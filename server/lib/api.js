// HTTP-API: Konten, Profile, Meldungen, Stummschalten, Admin-Funktionen. Alle Rechte werden serverseitig aus der Datenbank geprüft.
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, newToken, hashToken, validateUsername, validatePassword, RateLimiter, can, ROLE_RANK, filterText } from './auth.js';
import { rankOf, rankInfo, levelFromXp, RANKS, grantUnlocks } from './progression.js';
import { exportBackup } from './backup.js';
import { BUILD } from '../../client/js/version.js';
import { CATALOG, CATALOG_BY_ID, DAILY_REWARDS, SEASON_TIERS, seasonOf, NAME_COLORS, AVATAR_BGS, AVATAR_ICONS, RENAME_COST, RENAME_COOLDOWN_DAYS, BIO_MAX } from '../../client/js/shared/defs.js';

const SESSION_DAYS = 30;
export const DEFAULT_FLAGS = { accounts: true, ranked: true, chat: true, emotes: true, dailyRewards: true, shop: true, friends: true, seasons: true, analytics: true, matchmaking: true, maintenance: false };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export class Api {
  constructor({ db, stats = null, notify = () => false, config = {}, metrics = () => ({}), rooms = () => [], onBan = () => {}, presence = () => ({ online: false }), log = console }) {
    this.presence = presence; this.notify = notify; this.db = db; this.stats = stats || { inc() {}, max() {}, report: async () => ({ days: [], metrics: {} }) }; this.cfg = config; this.metrics = metrics; this.rooms = rooms; this.onBan = onBan; this.log = log;
    this.rl = new RateLimiter(); this.flags = { ...DEFAULT_FLAGS };
  }
  async init() {
    if (!this.db) return;
    for (const r of await this.db.all('SELECT key, value FROM feature_flags')) this.flags[r.key] = r.value;
    // Owner-Rolle sicherstellen: nur der per Umgebungsvariable festgelegte Benutzername kann OWNER sein
    if (this.cfg.ownerUsername) await this.db.query("UPDATE users SET role='OWNER' WHERE username_lower=$1 AND role<>'OWNER'", [this.cfg.ownerUsername.toLowerCase()]);
  }
  get maintenance() { return !!this.flags.maintenance; }

  // ---------- Hilfen ----------
  ip(req) { const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); return f || req.socket.remoteAddress || '?'; }
  send(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(obj));
  }
  body(req) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > 8192) { reject(Object.assign(new Error('zu groß'), { code: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(Object.assign(new Error('Ungültiges JSON'), { code: 400 })); } });
      req.on('error', reject);
    });
  }
  async audit(actor, action, target, detail) { await this.db.query('INSERT INTO audit_logs (actor_id, actor_name, action, target, detail) VALUES ($1,$2,$3,$4,$5)', [actor?.id ?? null, actor?.username ?? 'system', action, clip(target, 60), clip(detail, 300)]); this.log.log?.(`[audit] ${actor?.username ?? 'system'} ${action} ${target ?? ''} ${detail ?? ''}`); }
  async suspicious(userId, name, kind, detail, matchId) {
    if (!this.db) return; const key = `sus:${userId || name}:${kind}`; if (this.rl.hit(key, 3, 60000)) return;   // nicht fluten
    try { await this.db.query('INSERT INTO suspicious_events (user_id, name, kind, detail, match_id) VALUES ($1,$2,$3,$4,$5)', [userId || null, clip(name, 30), clip(kind, 40), clip(detail, 300), matchId || null]); } catch (e) { this.log.error?.('[db] suspicious', e.message); }
  }
  banInfo(u) {
    if (!u) return null;
    if (u.ban_permanent) return { permanent: true, reason: u.ban_reason };
    if (u.banned_until && new Date(u.banned_until) > new Date()) return { until: u.banned_until, reason: u.ban_reason };
    return null;
  }
  async userFromToken(token) {
    if (!this.db || !token) return null;
    const u = await this.db.one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`, [hashToken(String(token))]);
    return u;
  }
  async authReq(req) { const h = String(req.headers.authorization || ''); return this.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : null); }
  async publicUser(u, self = true) {
    const s = await this.db.one('SELECT * FROM user_stats WHERE user_id=$1', [u.id]); const lv = levelFromXp(Number(s.xp));
    const ri = rankInfo(s.rank_points), bi = rankInfo(s.best_rank_points);
    const out = { id: Number(u.id), username: u.username, role: u.role, createdAt: u.created_at, stats: { xp: Number(s.xp), level: lv.level, xpInto: lv.into, xpNeed: lv.need, kills: s.kills, deaths: s.deaths, headshots: s.headshots, matches: s.matches, wins: s.wins, kd: s.deaths ? +(s.kills / s.deaths).toFixed(2) : s.kills,
        rankPoints: s.rank_points, rank: ri.tier, rankLabel: ri.label, rankDiv: ri.div, rankIdx: ri.idx, rankMin: ri.from, nextRank: ri.nextLabel, nextRankAt: ri.nextAt, bestRank: bi.tier, bestRankLabel: bi.label, bestRankPoints: s.best_rank_points,
        rankedMatches: s.ranked_matches, placement: Math.max(0, 5 - s.ranked_matches), ...(self ? { currency: Number(s.currency) } : {}) },
      equipped: { skin: s.equipped_skin, wskin: s.equipped_wskin, back: s.equipped_back }, profile: { bio: s.bio, nameColor: s.name_color, avatarBg: s.avatar_bg, avatarIcon: s.avatar_icon }, ranks: RANKS };
    if (self) out.rename = this.renameInfo(u);
    return out;
  }
  // Namensänderung: die erste ist gratis, jede weitere kostet Münzen; dazwischen liegt eine Wartezeit.
  renameInfo(u) {
    const last = u.username_changed_at ? new Date(u.username_changed_at).getTime() : 0, next = last ? last + RENAME_COOLDOWN_DAYS * 86400000 : 0;
    return { free: !last, cost: last ? RENAME_COST : 0, nextAt: next > Date.now() ? next : null };
  }
  // Gibt den Freund zurück (nur bei akzeptierter Freundschaft), sonst null – Grundlage für Einladungen
  async friendByName(userId, name) {
    const n = clip(name, 16).toLowerCase(); if (!n) return null;
    return this.db.one(`SELECT u.id, u.username FROM users u JOIN friendships f ON f.status='accepted' AND ((f.requester=$1 AND f.addressee=u.id) OR (f.addressee=$1 AND f.requester=u.id))
      WHERE u.username_lower=$2 AND NOT u.ban_permanent AND (u.banned_until IS NULL OR u.banned_until < now())`, [userId, n]);
  }
  // IDs aller bestätigten Freunde (für Online-Meldungen in Echtzeit)
  async friendIds(userId) { return (await this.db.all("SELECT CASE WHEN requester=$1 THEN addressee ELSE requester END AS id FROM friendships WHERE status='accepted' AND (requester=$1 OR addressee=$1)", [userId])).map(r => Number(r.id)); }
  // Echtzeit-Hinweis an alle Verbindungen des Spielers – aber nicht, wenn er den Absender stummgeschaltet hat
  async push(targetId, fromUser, msg) {
    try { if ((await this.mutedBy(targetId)).has(String(fromUser.id))) return false; return !!this.notify(targetId, msg); } catch { return false; }
  }
  // ---------- Freunde & Spielersuche ----------
  async friendsRoute(req, res, url, user) {
    if (!this.flags.friends) return this.send(res, 503, { error: 'Das Freunde-System ist gerade deaktiviert.' });
    const path = url.split('?')[0], q = new URLSearchParams(url.split('?')[1] || ''), uid = user.id;
    if (req.method === 'GET' && path === '/api/players/search') {
      if (this.rl.hit('psearch:' + uid, 40, 60000)) return this.send(res, 429, { error: 'Zu viele Suchanfragen.' });
      const term = clip(q.get('q'), 16).toLowerCase().replace(/[^a-z0-9_-]/g, ''), after = clip(q.get('after'), 16).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (term.length < 2) return this.send(res, 400, { error: 'Mindestens 2 Zeichen eingeben.' });
      const rows = await this.db.all(`SELECT u.id, u.username, u.username_lower, s.level, s.rank_points FROM users u JOIN user_stats s ON s.user_id=u.id
        WHERE u.username_lower LIKE $1 AND u.username_lower > $2 AND u.id <> $3 AND NOT u.ban_permanent AND (u.banned_until IS NULL OR u.banned_until < now()) ORDER BY u.username_lower LIMIT 11`, [term + '%', after, uid]);
      const page = rows.slice(0, 10), ids = page.map(r => r.id);
      const rel = ids.length ? await this.db.all('SELECT requester, addressee, status FROM friendships WHERE (requester=$1 AND addressee = ANY($2::bigint[])) OR (addressee=$1 AND requester = ANY($2::bigint[]))', [uid, ids]) : [];
      const relOf = (id) => { const r = rel.find(x => String(x.requester) === String(id) || String(x.addressee) === String(id)); if (!r) return 'none'; if (r.status === 'accepted') return 'friend'; return String(r.requester) === String(uid) ? 'outgoing' : 'incoming'; };
      return this.send(res, 200, { players: page.map(r => ({ username: r.username, level: r.level, rank: rankOf(r.rank_points), rankLabel: rankInfo(r.rank_points).label, relation: relOf(r.id) })), next: rows.length > 10 ? page[9].username_lower : null });
    }
    if (req.method === 'GET' && path === '/api/friends') {
      const rows = await this.db.all(`SELECT u.id, u.username, s.level, s.rank_points, f.status, f.requester FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.requester=$1 THEN f.addressee ELSE f.requester END JOIN user_stats s ON s.user_id=u.id WHERE f.requester=$1 OR f.addressee=$1 ORDER BY u.username_lower LIMIT 300`, [uid]);
      const out = { friends: [], incoming: [], outgoing: [] };
      for (const r of rows) {
        if (r.status === 'accepted') { const p = this.presence(Number(r.id)); out.friends.push({ username: r.username, level: r.level, rank: rankOf(r.rank_points), rankLabel: rankInfo(r.rank_points).label, online: !!p.online, room: p.room || null, inMatch: !!p.inMatch }); }
        else if (String(r.requester) === String(uid)) out.outgoing.push({ username: r.username }); else out.incoming.push({ username: r.username, level: r.level });
      }
      out.friends.sort((a, b) => (b.online - a.online) || a.username.localeCompare(b.username));
      return this.send(res, 200, out);
    }
    if (req.method !== 'POST') return this.send(res, 404, { error: 'Unbekannte Route.' });
    if (this.rl.hit('frq:' + uid, 40, 600000)) return this.send(res, 429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });
    const b = await this.body(req), t = await this.db.one('SELECT id, username FROM users WHERE username_lower=$1', [clip(b.target, 16).toLowerCase()]);
    if (!t) return this.send(res, 404, { error: 'Spieler nicht gefunden.' });
    if (String(t.id) === String(uid)) return this.send(res, 400, { error: 'Das bist du selbst.' });
    const row = await this.db.one('SELECT requester, addressee, status FROM friendships WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)', [uid, t.id]);
    const mine = row && String(row.requester) === String(uid);
    if (path === '/api/friends/request') {
      if (row && row.status === 'accepted') return this.send(res, 409, { error: 'Ihr seid schon befreundet.' });
      if (row && mine) return this.send(res, 409, { error: 'Anfrage wurde schon gesendet.' });
      if (row && !mine) { await this.db.query("UPDATE friendships SET status='accepted' WHERE requester=$1 AND addressee=$2", [t.id, uid]); this.push(t.id, user, { k: 'friend_accepted', from: user.username }); return this.send(res, 200, { ok: true, accepted: true }); }   // beide wollten → sofort Freunde
      const n = await this.db.one("SELECT (SELECT count(*) FROM friendships WHERE requester=$1 AND status='pending')::int AS pend, (SELECT count(*) FROM friendships WHERE (requester=$1 OR addressee=$1) AND status='accepted')::int AS fr", [uid]);
      if (n.pend >= 30) return this.send(res, 400, { error: 'Zu viele offene Anfragen (max. 30).' }); if (n.fr >= 100) return this.send(res, 400, { error: 'Deine Freundesliste ist voll (max. 100).' });
      try { await this.db.query('INSERT INTO friendships (requester, addressee) VALUES ($1,$2)', [uid, t.id]); } catch (e) { if (e.code === '23505' || /unique|duplicate/i.test(e.message)) return this.send(res, 409, { error: 'Anfrage existiert schon.' }); throw e; }
      const lv = await this.db.one('SELECT level FROM user_stats WHERE user_id=$1', [uid]); this.push(t.id, user, { k: 'friend_request', from: user.username, level: lv ? lv.level : 1 });
      return this.send(res, 200, { ok: true });
    }
    if (path === '/api/friends/accept') {
      if (!row || row.status !== 'pending' || mine) return this.send(res, 404, { error: 'Keine offene Anfrage von diesem Spieler.' });
      const n = await this.db.one("SELECT count(*)::int AS fr FROM friendships WHERE (requester=$1 OR addressee=$1) AND status='accepted'", [uid]); if (n.fr >= 100) return this.send(res, 400, { error: 'Deine Freundesliste ist voll (max. 100).' });
      await this.db.query("UPDATE friendships SET status='accepted' WHERE requester=$1 AND addressee=$2", [t.id, uid]); this.push(t.id, user, { k: 'friend_accepted', from: user.username }); return this.send(res, 200, { ok: true });
    }
    if (path === '/api/friends/decline' || path === '/api/friends/remove') {   // Ablehnen, Anfrage zurückziehen, Freund entfernen
      if (!row) return this.send(res, 404, { error: 'Keine Verbindung zu diesem Spieler.' });
      await this.db.query('DELETE FROM friendships WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)', [uid, t.id]); return this.send(res, 200, { ok: true });
    }
    return this.send(res, 404, { error: 'Unbekannte Route.' });
  }

  // ---------- Inventar / Shop / Tagesbelohnung (alles serverseitig, in Transaktionen) ----------
  async inventory(user) {
    await grantUnlocks(this.db, user.id, (await this.db.one('SELECT level FROM user_stats WHERE user_id=$1', [user.id])).level);
    const owned = (await this.db.all('SELECT item_id FROM inventory WHERE user_id=$1', [user.id])).map(r => r.item_id);
    const s = await this.db.one('SELECT currency, level, equipped_skin, equipped_wskin, equipped_back FROM user_stats WHERE user_id=$1', [user.id]);
    const d = await this.db.one("SELECT streak, (last_claim = CURRENT_DATE) AS today, (last_claim = CURRENT_DATE - 1) AS yesterday FROM daily_rewards WHERE user_id=$1", [user.id]);
    const streak = d ? (d.today || d.yesterday ? d.streak : 0) : 0;
    return { owned, coins: Number(s.currency), level: s.level, equipped: { skin: s.equipped_skin, wskin: s.equipped_wskin, back: s.equipped_back }, catalog: CATALOG.map(i => ({ id: i.id, type: i.type, name: i.name, level: i.level, price: i.price })),
      daily: { enabled: !!this.flags.dailyRewards, canClaim: !!this.flags.dailyRewards && !(d && d.today), streak, nextDay: (streak % 7) + 1, rewards: DAILY_REWARDS } };
  }
  async buy(req, res, user) {
    if (!this.flags.shop) return this.send(res, 503, { error: 'Der Shop ist gerade deaktiviert.' });
    if (this.rl.hit('buy:' + user.id, 20, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const b = await this.body(req), item = CATALOG_BY_ID[String(b.item)]; if (!item) return this.send(res, 400, { error: 'Unbekanntes Item.' });
    const out = await this.db.tx(async (t) => {
      const s = (await t.query('SELECT currency FROM user_stats WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];   // Zeilen-Sperre: parallele Käufe laufen nacheinander
      if ((await t.query('SELECT 1 FROM inventory WHERE user_id=$1 AND item_id=$2', [user.id, item.id])).rows.length) return { code: 409, error: 'Du besitzt dieses Item bereits.' };
      if (Number(s.currency) < item.price) return { code: 402, error: `Nicht genug Münzen (${item.price} nötig).` };
      await t.query('UPDATE user_stats SET currency = currency - $2 WHERE user_id=$1', [user.id, item.price]);
      await t.query("INSERT INTO inventory (user_id, item_id, source) VALUES ($1,$2,'shop')", [user.id, item.id]);
      return { ok: true };
    });
    if (out.error) return this.send(res, out.code, { error: out.error });
    this.stats.inc('purchase', item.type);
    this.send(res, 200, await this.inventory(user));
  }
  async equip(req, res, user) {
    if (this.rl.hit('equip:' + user.id, 30, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const b = await this.body(req); const skin = b.skin ? String(b.skin) : null, wskin = b.wskin ? String(b.wskin) : null, back = b.back ? String(b.back) : null;
    for (const [id, type] of [[skin && 'skin:' + skin, 'skin'], [wskin && 'wskin:' + wskin, 'wskin'], [back && 'back:' + back, 'back']]) {
      if (!id) continue; if (!CATALOG_BY_ID[id]) return this.send(res, 400, { error: 'Unbekanntes Item.' });
      if (!(await this.db.one('SELECT 1 FROM inventory WHERE user_id=$1 AND item_id=$2', [user.id, id]))) return this.send(res, 403, { error: 'Du besitzt dieses Item nicht.' });
    }
    await this.db.query('UPDATE user_stats SET equipped_skin = COALESCE($2, equipped_skin), equipped_wskin = COALESCE($3, equipped_wskin), equipped_back = COALESCE($4, equipped_back) WHERE user_id=$1', [user.id, skin, wskin, back]);
    this.send(res, 200, await this.inventory(user));
  }
  async claimDaily(res, user) {
    if (!this.flags.dailyRewards) return this.send(res, 503, { error: 'Tagesbelohnungen sind gerade deaktiviert.' });
    if (this.rl.hit('daily:' + user.id, 10, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const out = await this.db.tx(async (t) => {
      await t.query('INSERT INTO daily_rewards (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      const d = (await t.query('SELECT streak, last_claim, (last_claim = CURRENT_DATE) AS today, (last_claim = CURRENT_DATE - 1) AS yesterday FROM daily_rewards WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
      if (d.today) return { code: 409, error: 'Die heutige Belohnung hast du schon abgeholt. Komm morgen wieder!' };
      const streak = d.yesterday ? d.streak + 1 : 1, rw = DAILY_REWARDS[(streak - 1) % 7]; let coins = rw.coins || 0, xp = rw.xp || 0, item = null;
      if (rw.item) {
        const have = new Set((await t.query('SELECT item_id FROM inventory WHERE user_id=$1', [user.id])).rows.map(r => r.item_id));
        const pool = CATALOG.filter(i => i.price > 0 && !have.has(i.id)); if (pool.length) { item = pool[Math.floor(Math.random() * pool.length)].id; await t.query("INSERT INTO inventory (user_id, item_id, source) VALUES ($1,$2,'daily')", [user.id, item]); } else coins += 300;
      }
      const s = (await t.query('SELECT xp FROM user_stats WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0], total = Number(s.xp) + xp, lv = levelFromXp(total);
      await t.query('UPDATE user_stats SET currency = currency + $2, xp = $3, level = $4 WHERE user_id=$1', [user.id, coins, total, lv.level]);
      await grantUnlocks(t, user.id, lv.level);
      await t.query('UPDATE daily_rewards SET last_claim = CURRENT_DATE, streak = $2 WHERE user_id=$1', [user.id, streak]);
      return { ok: true, streak, day: ((streak - 1) % 7) + 1, coins, xp, item };
    });
    if (out.error) return this.send(res, out.code, { error: out.error });
    this.stats.inc('daily_claim');
    this.send(res, 200, { reward: out, inventory: await this.inventory(user) });
  }
  // ---------- Seasons ----------
  async season(user) {
    const s = seasonOf(), me = await this.db.one('SELECT points, matches, wins, kills FROM season_stats WHERE season_id=$1 AND user_id=$2', [s.id, user.id]);
    const pts = me ? me.points : 0;
    const claimed = (await this.db.all('SELECT tier FROM season_claims WHERE season_id=$1 AND user_id=$2', [s.id, user.id])).map(r => r.tier);
    const top = await this.db.all(`SELECT u.username, ss.points, ss.wins, st.level FROM season_stats ss JOIN users u ON u.id=ss.user_id JOIN user_stats st ON st.user_id=u.id
      WHERE ss.season_id=$1 AND ss.points>0 AND NOT u.ban_permanent AND (u.banned_until IS NULL OR u.banned_until < now()) ORDER BY ss.points DESC, ss.updated_at ASC LIMIT 25`, [s.id]);
    const pos = pts > 0 ? Number((await this.db.one('SELECT COUNT(*) AS n FROM season_stats WHERE season_id=$1 AND points > $2', [s.id, pts])).n) + 1 : null;
    return { enabled: !!this.flags.seasons, season: { id: s.id, name: s.name, endsAt: s.endsAt }, tiers: SEASON_TIERS,
      me: { points: pts, matches: me ? me.matches : 0, wins: me ? me.wins : 0, kills: me ? me.kills : 0, claimed, position: pos },
      top: top.map((r, i) => ({ pos: i + 1, name: r.username, points: r.points, wins: r.wins, level: r.level })) };
  }
  // Ranglisten (Top 50): 'season' = Saisonpunkte dieses Monats, 'rank' = Rangpunkte (nur Ranked-Matches). Gesperrte Spieler tauchen nicht auf.
  async leaderboard(user, kind) {
    const ok = "NOT u.ban_permanent AND (u.banned_until IS NULL OR u.banned_until < now())", cols = 'st.level, st.rank_points, st.wins, st.matches, st.name_color, st.avatar_bg, st.avatar_icon, st.equipped_skin';
    const row = (r, i, points) => { const ri = rankInfo(r.rank_points); return { pos: i + 1, name: r.username, level: r.level, points, rank: ri.tier, rankLabel: ri.label, rankDiv: ri.div, wins: r.wins, matches: r.matches, nc: r.name_color, av: { bg: r.avatar_bg, icon: r.avatar_icon, skin: r.equipped_skin } }; };
    if (kind === 'rank') {
      const mine = (await this.db.one('SELECT rank_points FROM user_stats WHERE user_id=$1', [user.id]))?.rank_points ?? 0;
      const rows = await this.db.all(`SELECT u.username, ${cols} FROM user_stats st JOIN users u ON u.id=st.user_id WHERE st.ranked_matches > 0 AND ${ok} ORDER BY st.rank_points DESC, st.wins DESC, u.username_lower ASC LIMIT 50`);
      const played = (await this.db.one('SELECT ranked_matches FROM user_stats WHERE user_id=$1', [user.id]))?.ranked_matches ?? 0;
      const pos = played > 0 ? Number((await this.db.one('SELECT COUNT(*) AS n FROM user_stats WHERE ranked_matches > 0 AND rank_points > $1', [mine])).n) + 1 : null;
      const ri = rankInfo(mine);
      return { kind: 'rank', title: 'Rangliste', unit: 'Wertung', me: { points: mine, position: pos, rank: ri.tier, rankLabel: ri.label, played }, rows: rows.map((r, i) => row(r, i, r.rank_points)) };
    }
    const s = seasonOf(), me = await this.db.one('SELECT points FROM season_stats WHERE season_id=$1 AND user_id=$2', [s.id, user.id]), pts = me ? me.points : 0;
    const rows = await this.db.all(`SELECT u.username, ss.points, ${cols} FROM season_stats ss JOIN users u ON u.id=ss.user_id JOIN user_stats st ON st.user_id=u.id WHERE ss.season_id=$1 AND ss.points>0 AND ${ok} ORDER BY ss.points DESC, ss.updated_at ASC LIMIT 50`, [s.id]);
    const pos = pts > 0 ? Number((await this.db.one('SELECT COUNT(*) AS n FROM season_stats WHERE season_id=$1 AND points > $2', [s.id, pts])).n) + 1 : null;
    return { kind: 'season', title: 'Saison-Rangliste', unit: 'Punkte', season: { id: s.id, name: s.name, endsAt: s.endsAt }, me: { points: pts, position: pos }, rows: rows.map((r, i) => row(r, i, r.points)) };
  }
  // ---------- Profil anpassen ----------
  async customize(req, res, user) {
    if (this.rl.hit('cust:' + user.id, 30, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const b = await this.body(req), st = await this.db.one('SELECT level FROM user_stats WHERE user_id=$1', [user.id]), set = [], vals = [user.id];
    const add = (col, v) => { vals.push(v); set.push(col + '=$' + vals.length); };
    if (b.nameColor !== undefined) { const c = NAME_COLORS.find(x => x.id === b.nameColor); if (!c) return this.send(res, 400, { error: 'Unbekannte Namensfarbe.' }); if (st.level < c.req) return this.send(res, 403, { error: `Diese Farbe gibt es ab Level ${c.req}.` }); add('name_color', c.id); }
    if (b.avatarBg !== undefined) { if (!AVATAR_BGS.some(x => x.id === b.avatarBg)) return this.send(res, 400, { error: 'Unbekannter Hintergrund.' }); add('avatar_bg', b.avatarBg); }
    if (b.avatarIcon !== undefined) { if (!AVATAR_ICONS.some(x => x.id === b.avatarIcon)) return this.send(res, 400, { error: 'Unbekanntes Symbol.' }); add('avatar_icon', b.avatarIcon); }
    if (b.bio !== undefined) {
      if (typeof b.bio !== 'string') return this.send(res, 400, { error: 'Ungültige Bio.' });
      const bio = filterText(b.bio.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX)); add('bio', bio);
    }
    if (!set.length) return this.send(res, 400, { error: 'Nichts zu ändern.' });
    await this.db.query(`UPDATE user_stats SET ${set.join(', ')} WHERE user_id=$1`, vals);
    this.send(res, 200, { user: await this.publicUser(user) });
  }
  async rename(req, res, user) {
    if (this.rl.hit('rename:' + user.id, 12, 3600000)) return this.send(res, 429, { error: 'Zu viele Versuche. Bitte später erneut.' });
    if (user.role === 'OWNER') return this.send(res, 403, { error: 'Der Name des Besitzers ist fest.' });
    const b = await this.body(req), name = clip(b.username, 16), lower = name.toLowerCase();
    const err = validateUsername(name) || (this.cfg.ownerUsername && lower === this.cfg.ownerUsername.toLowerCase() ? 'Dieser Name ist reserviert.' : null);
    if (err) return this.send(res, 400, { error: err });
    if (name === user.username) return this.send(res, 400, { error: 'Das ist schon dein Name.' });
    const caseOnly = lower === user.username_lower;   // nur Groß-/Kleinschreibung ändern: gratis, ohne Wartezeit
    const info = this.renameInfo(user);
    if (!caseOnly && info.nextAt) return this.send(res, 429, { error: `Du kannst deinen Namen erst am ${new Date(info.nextAt).toLocaleDateString('de-DE')} wieder ändern.` });
    const cost = caseOnly ? 0 : info.cost;
    let out;
    try {
      out = await this.db.tx(async (t) => {
        const s = (await t.query('SELECT currency FROM user_stats WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
        if (Number(s.currency) < cost) return { code: 402, error: `Nicht genug Münzen (${cost} nötig).` };
        if ((await t.query('SELECT 1 FROM users WHERE username_lower=$1 AND id<>$2', [lower, user.id])).rows.length) return { code: 409, error: 'Dieser Benutzername ist schon vergeben.' };
        await t.query(caseOnly ? 'UPDATE users SET username=$2 WHERE id=$1' : 'UPDATE users SET username=$2, username_lower=$3, username_changed_at=now() WHERE id=$1', caseOnly ? [user.id, name] : [user.id, name, lower]);
        if (cost) await t.query('UPDATE user_stats SET currency = currency - $2 WHERE user_id=$1', [user.id, cost]);
        return { ok: true };
      });
    } catch (e) { if (e.code === '23505' || /unique|duplicate/i.test(e.message)) out = { code: 409, error: 'Dieser Benutzername ist schon vergeben.' }; else throw e; }
    if (out.error) return this.send(res, out.code, { error: out.error });
    await this.audit(user, 'rename', user.username, '→ ' + name + (cost ? ' (' + cost + ' Münzen)' : ''));
    const fresh = await this.db.one('SELECT * FROM users WHERE id=$1', [user.id]);
    this.send(res, 200, { user: await this.publicUser(fresh), inventory: await this.inventory(fresh) });
  }
  async claimSeason(req, res, user) {
    if (!this.flags.seasons) return this.send(res, 503, { error: 'Seasons sind gerade deaktiviert.' });
    if (this.rl.hit('seasonclaim:' + user.id, 20, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const b = await this.body(req), idx = b.tier, tier = Number.isInteger(idx) ? SEASON_TIERS[idx] : null; if (!tier) return this.send(res, 400, { error: 'Unbekannte Stufe.' });
    const s = seasonOf();
    const out = await this.db.tx(async (t) => {
      await t.query('SELECT 1 FROM user_stats WHERE user_id=$1 FOR UPDATE', [user.id]);   // Sperre: parallele Abholungen laufen nacheinander
      const me = (await t.query('SELECT points FROM season_stats WHERE season_id=$1 AND user_id=$2', [s.id, user.id])).rows[0];
      if (!me || me.points < tier.points) return { code: 403, error: `Dafür brauchst du ${tier.points} Saisonpunkte.` };
      const ins = await t.query('INSERT INTO season_claims (season_id, user_id, tier, coins) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING 1', [s.id, user.id, idx, tier.coins]);
      if (!ins.rows.length) return { code: 409, error: 'Diese Belohnung hast du schon abgeholt.' };
      await t.query('UPDATE user_stats SET currency = currency + $2 WHERE user_id=$1', [user.id, tier.coins]);
      return { ok: true, coins: tier.coins };
    });
    if (out.error) return this.send(res, out.code, { error: out.error });
    this.stats.inc('season_claim');
    this.send(res, 200, { coins: out.coins, season: await this.season(user) });
  }
  async createSession(userId, req) {
    const token = newToken();
    await this.db.query('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1,$2, now() + ($3 || \' days\')::interval, $4)', [hashToken(token), userId, String(SESSION_DAYS), clip(req.headers['user-agent'], 120)]);
    await this.db.query('DELETE FROM sessions WHERE expires_at < now()');
    return token;
  }

  // ---------- Router ----------
  async handle(req, res, url) {
    if (!url.startsWith('/api/')) return false;
    if (req.method === 'OPTIONS') { this.send(res, 204, {}); return true; }
    try {
      const ip = this.ip(req);
      if (this.rl.hit('api:' + ip, 240, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen. Bitte kurz warten.' }), true;
      if (url === '/api/status') return this.send(res, 200, { build: BUILD, accounts: !!this.db && this.flags.accounts, maintenance: this.maintenance, flags: { ranked: this.flags.ranked, chat: this.flags.chat, emotes: this.flags.emotes, dailyRewards: this.flags.dailyRewards, shop: this.flags.shop, friends: this.flags.friends, seasons: this.flags.seasons, matchmaking: this.flags.matchmaking } }), true;
      if (!this.db || !this.flags.accounts) return this.send(res, 503, { error: 'Konten sind auf diesem Server nicht aktiviert.' }), true;
      const m = req.method;
      if (m === 'POST' && url === '/api/register') return await this.register(req, res, ip), true;
      if (m === 'POST' && url === '/api/login') return await this.login(req, res, ip), true;
      const user = await this.authReq(req);
      if (!user) return this.send(res, 401, { error: 'Nicht angemeldet.' }), true;
      const ban = this.banInfo(user); if (ban) return this.send(res, 403, { error: 'Dein Konto ist gesperrt.', ban }), true;
      if (m === 'POST' && url === '/api/logout') { await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(String(req.headers.authorization).slice(7))]); return this.send(res, 200, { ok: true }), true; }
      if (m === 'GET' && url === '/api/me') return this.send(res, 200, { user: await this.publicUser(user), mutes: (await this.db.all('SELECT u.username FROM mutes m JOIN users u ON u.id=m.muted_id WHERE m.user_id=$1', [user.id])).map(r => r.username) }), true;
      if (m === 'POST' && url === '/api/profile/customize') return await this.customize(req, res, user), true;
      if (m === 'POST' && url === '/api/username') return await this.rename(req, res, user), true;
      if (m === 'GET' && url.startsWith('/api/profile/')) {
        if (this.rl.hit('prof:' + user.id, 60, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' }), true;
        const t = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [decodeURIComponent(url.slice(13)).toLowerCase().slice(0, 16)]);
        if (!t) return this.send(res, 404, { error: 'Spieler nicht gefunden.' }), true;
        return this.send(res, 200, { user: await this.publicUser(t, false), online: !!this.presence(Number(t.id)).online }), true;
      }
      if (url.startsWith('/api/friends') || url.startsWith('/api/players/search')) return await this.friendsRoute(req, res, url, user), true;
      if (m === 'GET' && url === '/api/inventory') return this.send(res, 200, await this.inventory(user)), true;
      if (m === 'POST' && url === '/api/shop/buy') return await this.buy(req, res, user), true;
      if (m === 'POST' && url === '/api/equip') return await this.equip(req, res, user), true;
      if (m === 'GET' && url === '/api/season') return this.send(res, 200, await this.season(user)), true;
      if (m === 'GET' && url.split('?')[0] === '/api/leaderboard') return this.send(res, 200, await this.leaderboard(user, new URLSearchParams(url.split('?')[1] || '').get('kind'))), true;
      if (m === 'POST' && url === '/api/season/claim') return await this.claimSeason(req, res, user), true;
      if (m === 'POST' && url === '/api/daily/claim') return await this.claimDaily(res, user), true;
      if (m === 'POST' && url === '/api/report') return await this.report(req, res, user), true;
      if (m === 'POST' && (url === '/api/mute' || url === '/api/unmute')) return await this.mute(req, res, user, url === '/api/mute'), true;
      if (url.startsWith('/api/admin/')) return await this.admin(req, res, url, user), true;
      return this.send(res, 404, { error: 'Unbekannte Route.' }), true;
    } catch (e) {
      if (e.code === 413 || e.code === 400) return this.send(res, e.code, { error: e.message }), true;
      this.log.error?.('[api] Fehler', e); this.send(res, 500, { error: 'Interner Fehler.' }); return true;
    }
  }

  async register(req, res, ip) {
    const b = await this.body(req);
    const wait = this.rl.hit('reg:' + ip, 5, 3600000); if (wait) return this.send(res, 429, { error: `Zu viele Registrierungen. Bitte in ${Math.ceil(wait / 60)} Min. erneut versuchen.` });
    const username = clip(b.username, 16), isOwner = !!this.cfg.ownerUsername && username.toLowerCase() === this.cfg.ownerUsername.toLowerCase();
    let err = validateUsername(username, { isOwnerName: isOwner }) || validatePassword(b.password);
    if (!err && isOwner) { const ok = this.cfg.ownerCode && typeof b.ownerCode === 'string' && b.ownerCode.length === this.cfg.ownerCode.length && crypto.timingSafeEqual(Buffer.from(b.ownerCode), Buffer.from(this.cfg.ownerCode)); if (!ok) err = 'Dieser Name ist für den Besitzer reserviert.'; }
    if (err) return this.send(res, 400, { error: err });
    const hash = await hashPassword(b.password);
    let user;
    try {
      user = await this.db.tx(async (t) => {
        const u = (await t.query('INSERT INTO users (username, username_lower, password_hash, role, last_login) VALUES ($1,$2,$3,$4, now()) RETURNING *', [username, username.toLowerCase(), hash, isOwner ? 'OWNER' : 'PLAYER'])).rows[0];
        await t.query('INSERT INTO user_stats (user_id) VALUES ($1)', [u.id]); await grantUnlocks(t, u.id, 1); return u;
      });
    } catch (e) { if (e.code === '23505' || /unique/i.test(e.message)) return this.send(res, 409, { error: 'Dieser Benutzername ist schon vergeben.' }); throw e; }
    await grantUnlocks(this.db, user.id, 1);
    await this.audit(user, 'register', username, isOwner ? 'owner' : ''); this.stats.inc('register');
    this.send(res, 200, { token: await this.createSession(user.id, req), user: await this.publicUser(user) });
  }

  async login(req, res, ip) {
    const b = await this.body(req); const uname = clip(b.username, 16).toLowerCase();
    const lockKey = 'login:u:' + uname;
    if (this.rl.count(lockKey) >= 8) return this.send(res, 429, { error: 'Konto vorübergehend gesperrt (zu viele Fehlversuche). Bitte in einigen Minuten erneut versuchen.' });
    if (this.rl.hit('login:ip:' + ip, 40, 900000)) return this.send(res, 429, { error: 'Zu viele Anmeldeversuche von dieser Adresse.' });
    const u = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [uname]);
    const ok = u && typeof b.password === 'string' && b.password.length <= 128 && await verifyPassword(b.password, u.password_hash);
    if (!ok) {
      if (!u) await hashPassword('x'); // gleiche Laufzeit, kein Benutzer-Orakel
      this.stats.inc('login_fail');
      const left = this.rl.hit(lockKey, 8, 900000) ? 0 : 1; if (this.rl.count(lockKey) >= 6) await this.suspicious(u?.id, uname, 'login_failures', `ip=${ip} n=${this.rl.count(lockKey)}`);
      return this.send(res, 401, { error: 'Benutzername oder Passwort falsch.' });
    }
    const ban = this.banInfo(u); if (ban) return this.send(res, 403, { error: 'Dein Konto ist gesperrt.', ban });
    this.rl.clear(lockKey);
    await this.db.query('UPDATE users SET last_login=now() WHERE id=$1', [u.id]); this.stats.inc('login');
    this.send(res, 200, { token: await this.createSession(u.id, req), user: await this.publicUser(u) });
  }

  async report(req, res, user) {
    const b = await this.body(req);
    if (this.rl.hit('rep:' + user.id, 5, 600000)) return this.send(res, 429, { error: 'Zu viele Meldungen. Bitte warten.' });
    const t = await this.db.one('SELECT id, username FROM users WHERE username_lower=$1', [clip(b.target, 16).toLowerCase()]);
    const reason = clip(b.reason, 200); if (!t || t.id === user.id || reason.length < 3) return this.send(res, 400, { error: 'Ungültige Meldung.' });
    await this.db.query('INSERT INTO reports (reporter_id, reported_id, reason, match_id) VALUES ($1,$2,$3,$4)', [user.id, t.id, reason, clip(b.matchId, 40) || null]); this.stats.inc('report');
    this.send(res, 200, { ok: true });
  }
  async mute(req, res, user, on) {
    const b = await this.body(req); if (this.rl.hit('mute:' + user.id, 30, 600000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    const t = await this.db.one('SELECT id FROM users WHERE username_lower=$1', [clip(b.target, 16).toLowerCase()]); if (!t || t.id === user.id) return this.send(res, 400, { error: 'Ungültiger Spieler.' });
    if (on) await this.db.query('INSERT INTO mutes (user_id, muted_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, t.id]); else await this.db.query('DELETE FROM mutes WHERE user_id=$1 AND muted_id=$2', [user.id, t.id]);
    this.send(res, 200, { ok: true });
  }
  async mutedBy(userId) { if (!this.db || !userId) return new Set(); return new Set((await this.db.all('SELECT muted_id FROM mutes WHERE user_id=$1', [userId])).map(r => String(r.muted_id))); }

  // ---------- Admin ----------
  async admin(req, res, url, user) {
    if (!can(user.role, 'MODERATOR')) return this.send(res, 403, { error: 'Keine Berechtigung.' });
    const path = url.split('?')[0], q = new URLSearchParams(url.split('?')[1] || ''), m = req.method;
    if (this.rl.hit('adm:' + user.id, 120, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' });
    if (m === 'GET' && path === '/api/admin/players') {
      const s = clip(q.get('q'), 16).toLowerCase().replace(/[%_\\]/g, ''); const rows = await this.db.all(`SELECT u.id, u.username, u.role, u.created_at, u.last_login, u.banned_until, u.ban_permanent, u.ban_reason, s.level, s.matches, s.kills, s.deaths, s.rank_points FROM users u JOIN user_stats s ON s.user_id=u.id WHERE u.username_lower LIKE $1 ORDER BY u.username_lower LIMIT 25`, [s + '%']);
      return this.send(res, 200, { players: rows });
    }
    if (m === 'GET' && path === '/api/admin/reports') return this.send(res, 200, { reports: await this.db.all(`SELECT r.id, r.reason, r.match_id, r.status, r.created_at, a.username AS reporter, b.username AS reported FROM reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.reported_id WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 50`, [q.get('status') === 'closed' ? 'closed' : 'open']) });
    if (m === 'GET' && path === '/api/admin/suspicious') { if (!can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Keine Berechtigung.' }); return this.send(res, 200, { events: await this.db.all('SELECT * FROM suspicious_events ORDER BY created_at DESC LIMIT 100') }); }
    if (m === 'GET' && path === '/api/admin/audit') { if (!can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Keine Berechtigung.' }); return this.send(res, 200, { logs: await this.db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100') }); }
    if (m === 'GET' && path === '/api/admin/server') { if (!can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Keine Berechtigung.' }); return this.send(res, 200, { metrics: this.metrics(), rooms: this.rooms(), flags: this.flags, status: this.maintenance ? 'MAINTENANCE' : 'ONLINE' }); }
    if (m === 'GET' && path === '/api/admin/analytics') {
      if (!can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Keine Berechtigung.' });
      const rep = await this.stats.report(Number(q.get('days')) || 14);
      const t = await this.db.one("SELECT (SELECT COUNT(*) FROM users) AS accounts, (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days') AS new7, (SELECT COUNT(*) FROM users WHERE last_login > now() - interval '24 hours') AS login24, (SELECT COUNT(*) FROM users WHERE last_login > now() - interval '7 days') AS login7, (SELECT COUNT(DISTINCT match_id) FROM match_results) AS matches");
      return this.send(res, 200, { ...rep, enabled: !!this.flags.analytics, totals: { accounts: Number(t.accounts), newAccounts7d: Number(t.new7), logins24h: Number(t.login24), logins7d: Number(t.login7), matchesTotal: Number(t.matches) } });
    }
    if (m === 'GET' && path === '/api/admin/backup') {   // nur Besitzer; die Passphrase liegt als Umgebungsvariable auf dem Server (nie im Browser)
      if (user.role !== 'OWNER') return this.send(res, 403, { error: 'Nur der Besitzer darf Backups herunterladen.' });
      const pass = this.cfg.backupPassphrase || process.env.BACKUP_PASSPHRASE || '';
      if (pass.length < 12) return this.send(res, 503, { error: 'Backup-Download ist aus: Setze auf dem Server die Umgebungsvariable BACKUP_PASSPHRASE (mind. 12 Zeichen).' });
      if (this.rl.hit('backup:' + user.id, 4, 3600000)) return this.send(res, 429, { error: 'Maximal 4 Backups pro Stunde.' });
      const buf = await exportBackup(this.db, { passphrase: pass });
      await this.audit(user, 'backup_download', '', Math.round(buf.length / 1024) + ' KB');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="neon-frontier-' + new Date().toISOString().slice(0, 10) + '.nfbackup"', 'Content-Length': buf.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    }
    if (m !== 'POST') return this.send(res, 404, { error: 'Unbekannte Route.' });
    const b = await this.body(req);
    if (path === '/api/admin/ban') {
      const t = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [clip(b.username, 16).toLowerCase()]); if (!t) return this.send(res, 404, { error: 'Spieler nicht gefunden.' });
      if (ROLE_RANK[t.role] >= ROLE_RANK[user.role]) return this.send(res, 403, { error: 'Du kannst diesen Spieler nicht sperren.' });
      const perm = !!b.permanent, mins = Math.max(1, Math.min(525600, +b.minutes || 60)), reason = clip(b.reason, 200) || 'Verstoß gegen die Regeln';
      if (perm && !can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Dauerhafte Sperren nur für Admins.' });
      if (!perm && !can(user.role, 'ADMIN') && mins > 10080) return this.send(res, 403, { error: 'Moderatoren: maximal 7 Tage.' });
      await this.db.query(`UPDATE users SET ban_permanent=$2, banned_until = CASE WHEN $2 THEN NULL ELSE now() + ($3 || ' minutes')::interval END, ban_reason=$4 WHERE id=$1`, [t.id, perm, String(mins), reason]);
      await this.db.query('DELETE FROM sessions WHERE user_id=$1', [t.id]); this.onBan(Number(t.id), reason);
      this.stats.inc('ban', perm ? 'permanent' : 'temporary');
      await this.audit(user, perm ? 'ban_permanent' : 'ban_temporary', t.username, `${reason}${perm ? '' : ` (${mins} min)`}`);
      return this.send(res, 200, { ok: true });
    }
    if (path === '/api/admin/unban') {
      const t = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [clip(b.username, 16).toLowerCase()]); if (!t) return this.send(res, 404, { error: 'Spieler nicht gefunden.' });
      await this.db.query('UPDATE users SET ban_permanent=FALSE, banned_until=NULL, ban_reason=NULL WHERE id=$1', [t.id]); await this.audit(user, 'unban', t.username, ''); return this.send(res, 200, { ok: true });
    }
    if (path === '/api/admin/reports/close') { await this.db.query("UPDATE reports SET status='closed', handled_by=$2, handled_at=now() WHERE id=$1", [+b.id | 0, user.id]); await this.audit(user, 'report_close', String(b.id), clip(b.note, 100)); return this.send(res, 200, { ok: true }); }
    if (!can(user.role, 'ADMIN')) return this.send(res, 403, { error: 'Keine Berechtigung.' });
    if (path === '/api/admin/flag') {
      const key = clip(b.key, 30); if (!(key in DEFAULT_FLAGS)) return this.send(res, 400, { error: 'Unbekanntes Feature.' });
      await this.db.query('INSERT INTO feature_flags (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()', [key, !!b.value]); this.flags[key] = !!b.value;
      await this.audit(user, 'flag', key, String(!!b.value)); return this.send(res, 200, { ok: true, flags: this.flags });
    }
    if (path === '/api/admin/maintenance') { await this.db.query('INSERT INTO feature_flags (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()', ['maintenance', !!b.on]); this.flags.maintenance = !!b.on; await this.audit(user, 'maintenance', 'server', String(!!b.on)); return this.send(res, 200, { ok: true }); }
    if (path === '/api/admin/role') {
      if (!can(user.role, 'OWNER')) return this.send(res, 403, { error: 'Nur der Besitzer vergibt Rollen.' });
      const role = String(b.role); if (!['ADMIN', 'MODERATOR', 'PLAYER'].includes(role)) return this.send(res, 400, { error: 'Ungültige Rolle.' });
      const t = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [clip(b.username, 16).toLowerCase()]); if (!t || t.role === 'OWNER') return this.send(res, 400, { error: 'Ungültiger Spieler.' });
      await this.db.query('UPDATE users SET role=$2 WHERE id=$1', [t.id, role]); await this.audit(user, 'role', t.username, role); return this.send(res, 200, { ok: true });
    }
    return this.send(res, 404, { error: 'Unbekannte Route.' });
  }
}
