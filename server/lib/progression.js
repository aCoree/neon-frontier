// Server-autoritative Fortschrittsberechnung: XP, Level, Rang. Der Client darf nichts davon selbst festlegen.
import { xpForLevel } from '../../client/js/shared/defs.js';

export const RANKS = [
  { name: 'Bronze', min: 0 }, { name: 'Silver', min: 100 }, { name: 'Gold', min: 250 },
  { name: 'Platinum', min: 450 }, { name: 'Diamond', min: 700 }, { name: 'Master', min: 1000 },
];
export const rankOf = (pts) => { let r = RANKS[0]; for (const x of RANKS) if (pts >= x.min) r = x; return r.name; };
export function levelFromXp(total) { let lvl = 1, left = total; while (left >= xpForLevel(lvl)) { left -= xpForLevel(lvl); lvl++; } return { level: lvl, into: left, need: xpForLevel(lvl) }; }

// Belohnung für ein Match. stat = { kills, deaths, hs, dmg, won, secs, humans, ranked }
export function reward(stat) {
  if (stat.secs < 30) return { xp: 0, rankDelta: 0 };               // Mini-/Abbruch-Matches zählen nicht
  let xp = 120 + stat.kills * 35 + stat.hs * 12 + Math.round(stat.dmg / 25) + (stat.won ? 280 : 0);
  xp = Math.min(1800, Math.max(0, xp));
  let rankDelta = 0;
  if (stat.ranked && stat.humans >= 2) rankDelta = stat.won ? Math.min(40, 25 + Math.floor(stat.kills / 2)) : -Math.max(0, 15 - Math.floor(stat.kills / 3));
  return { xp, rankDelta };
}

// Idempotent: (match_id, user_id) ist Primärschlüssel – ein Match kann nie doppelt belohnt werden.
export async function applyMatchResult(db, userId, matchId, stat) {
  const r = reward(stat);
  return db.tx(async (t) => {
    const ins = await t.query('INSERT INTO match_results (match_id, user_id, xp, rank_delta) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING 1', [matchId, userId, r.xp, r.rankDelta]);
    if (!ins.rows.length) return null;
    const cur = (await t.query('SELECT xp, rank_points FROM user_stats WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
    if (!cur) return null;
    const xp = Number(cur.xp) + r.xp, rp = Math.max(0, cur.rank_points + r.rankDelta), lv = levelFromXp(xp), coins = Math.floor(r.xp / 10);
    await t.query(`UPDATE user_stats SET xp=$2, level=$3, kills=kills+$4, deaths=deaths+$5, headshots=headshots+$6, matches=matches+1, wins=wins+$7,
      rank_points=$8, best_rank_points=GREATEST(best_rank_points,$8), currency=currency+$9 WHERE user_id=$1`,
      [userId, xp, lv.level, stat.kills, stat.deaths, stat.hs, stat.won ? 1 : 0, rp, coins]);
    return { xp: r.xp, rankDelta: r.rankDelta, totalXp: xp, level: lv.level, into: lv.into, need: lv.need, rankPoints: rp, rank: rankOf(rp), coins };
  });
}
