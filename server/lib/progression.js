// Server-autoritative Fortschrittsberechnung: XP, Level, Rang. Der Client darf nichts davon selbst festlegen.
import { xpForLevel, CATALOG, DEFAULT_ITEMS, seasonOf } from '../../client/js/shared/defs.js';

import { TIERS, rankInfo, rankName, eloDelta } from '../../client/js/shared/ranks.js';
export const RANKS = TIERS;
export const rankOf = rankName;
export { rankInfo, eloDelta };
export function levelFromXp(total) { let lvl = 1, left = total; while (left >= xpForLevel(lvl)) { left -= xpForLevel(lvl); lvl++; } return { level: lvl, into: left, need: xpForLevel(lvl) }; }

// Belohnung für ein Match. stat = { kills, deaths, hs, dmg, won, secs, humans, ranked, opps?, team?, score? }
// Rang = ELO: Erwartung aus der Wertung gegen die Gegner (opps = deren Wertungen, team = Durchschnitt des eigenen Teams); ohne Angaben gilt "gleich stark".
// Die Wertung selbst wird erst in der Transaktion berechnet (applyMatchResult), weil dort der aktuelle Stand gesperrt vorliegt.
export function reward(stat) {
  if (stat.secs < 30) return { xp: 0, ranked: false };               // Mini-/Abbruch-Matches zählen nicht
  let xp = 120 + stat.kills * 35 + stat.hs * 12 + Math.round(stat.dmg / 25) + (stat.won ? 280 : 0);
  xp = Math.min(1800, Math.max(0, xp));
  return { xp, ranked: !!(stat.ranked && stat.humans >= 2) };
}

// Saisonpunkte: volle Punkte nur für Ranglisten-Matches mit mind. 2 Menschen, sonst 25 % (Bot-Farming lohnt kaum).
export function seasonPoints(stat, xp) { if (!xp) return 0; const full = stat.ranked && stat.humans >= 2; return Math.max(1, Math.floor(xp / 10 * (full ? 1 : 0.25))); }

// Gewährt alle Cosmetics, deren Level erreicht ist (idempotent, kann beliebig oft aufgerufen werden).
export async function grantUnlocks(q, userId, level) {
  const ids = [...new Set([...DEFAULT_ITEMS, ...CATALOG.filter(i => i.level <= level).map(i => i.id)])];
  for (const id of ids) await q.query("INSERT INTO inventory (user_id, item_id, source) VALUES ($1,$2,'level') ON CONFLICT DO NOTHING", [userId, id]);
}

// Idempotent: (match_id, user_id) ist Primärschlüssel – ein Match kann nie doppelt belohnt werden.
export async function applyMatchResult(db, userId, matchId, stat) {
  const r = reward(stat);
  return db.tx(async (t) => {
    const cur0 = (await t.query('SELECT xp, rank_points, ranked_matches FROM user_stats WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
    if (!cur0) return null;
    const before = cur0.rank_points;
    let rankDelta = 0;
    if (r.ranked) {
      const me = Number.isFinite(stat.team) ? stat.team : before, opps = Array.isArray(stat.opps) && stat.opps.length ? stat.opps : [me];
      rankDelta = eloDelta({ me, opps, score: Number.isFinite(stat.score) ? stat.score : (stat.won ? 1 : 0), played: cur0.ranked_matches });
      if (before + rankDelta < 0) rankDelta = -before;   // nie unter 0
    }
    const ins = await t.query('INSERT INTO match_results (match_id, user_id, xp, rank_delta) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING 1', [matchId, userId, r.xp, rankDelta]);
    if (!ins.rows.length) return null;
    const cur = cur0;
    const xp = Number(cur.xp) + r.xp, rp = before + rankDelta, lv = levelFromXp(xp), coins = Math.floor(r.xp / 10);
    await t.query(`UPDATE user_stats SET xp=$2, level=$3, kills=kills+$4, deaths=deaths+$5, headshots=headshots+$6, matches=matches+1, wins=wins+$7,
      rank_points=$8, best_rank_points=GREATEST(best_rank_points,$8), currency=currency+$9, ranked_matches=ranked_matches+$10 WHERE user_id=$1`,
      [userId, xp, lv.level, stat.kills, stat.deaths, stat.hs, stat.won ? 1 : 0, rp, coins, r.ranked ? 1 : 0]);
    await grantUnlocks(t, userId, lv.level);
    const sp = seasonPoints(stat, r.xp), season = seasonOf();
    let seasonTotal = 0;
    if (sp > 0) {
      const ss = (await t.query(`INSERT INTO season_stats (season_id, user_id, points, matches, wins, kills) VALUES ($1,$2,$3,1,$4,$5)
        ON CONFLICT (season_id, user_id) DO UPDATE SET points = season_stats.points + $3, matches = season_stats.matches + 1, wins = season_stats.wins + $4, kills = season_stats.kills + $5, updated_at = now() RETURNING points`,
        [season.id, userId, sp, stat.won ? 1 : 0, stat.kills])).rows[0];
      seasonTotal = ss.points;
    }
    const ri = rankInfo(rp), rb = rankInfo(before);
    return { seasonPoints: sp, seasonTotal, xp: r.xp, rankDelta, ranked: r.ranked, totalXp: xp, level: lv.level, into: lv.into, need: lv.need, rankPoints: rp, rank: ri.tier, rankLabel: ri.label, rankBefore: rb.label, rankBeforePts: before, rankUp: ri.idx > rb.idx || (ri.idx === rb.idx && ri.div > rb.div), rankDown: ri.idx < rb.idx || (ri.idx === rb.idx && ri.div < rb.div), placement: r.ranked && cur.ranked_matches + 1 <= 5 ? 5 - (cur.ranked_matches + 1) : 0, coins };
  });
}
