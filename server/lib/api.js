// HTTP-API: Konten, Profile, Meldungen, Stummschalten, Admin-Funktionen. Alle Rechte werden serverseitig aus der Datenbank geprüft.
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, newToken, hashToken, validateUsername, validatePassword, RateLimiter, can, ROLE_RANK } from './auth.js';
import { rankOf, levelFromXp, RANKS } from './progression.js';

const SESSION_DAYS = 30;
export const DEFAULT_FLAGS = { accounts: true, ranked: true, chat: true, emotes: true, dailyRewards: false, maintenance: false };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export class Api {
  constructor({ db, config = {}, metrics = () => ({}), rooms = () => [], onBan = () => {}, log = console }) {
    this.db = db; this.cfg = config; this.metrics = metrics; this.rooms = rooms; this.onBan = onBan; this.log = log;
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
  async publicUser(u) {
    const s = await this.db.one('SELECT * FROM user_stats WHERE user_id=$1', [u.id]); const lv = levelFromXp(Number(s.xp));
    const rank = rankOf(s.rank_points), next = RANKS.find(r => r.min > s.rank_points);
    return { id: Number(u.id), username: u.username, role: u.role, createdAt: u.created_at, stats: { xp: Number(s.xp), level: lv.level, xpInto: lv.into, xpNeed: lv.need, kills: s.kills, deaths: s.deaths, headshots: s.headshots, matches: s.matches, wins: s.wins, kd: s.deaths ? +(s.kills / s.deaths).toFixed(2) : s.kills, rankPoints: s.rank_points, rank, bestRank: rankOf(s.best_rank_points), nextRankAt: next ? next.min : null, currency: Number(s.currency) } };
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
      if (url === '/api/status') return this.send(res, 200, { accounts: !!this.db && this.flags.accounts, maintenance: this.maintenance, flags: { ranked: this.flags.ranked, chat: this.flags.chat, emotes: this.flags.emotes, dailyRewards: this.flags.dailyRewards } }), true;
      if (!this.db || !this.flags.accounts) return this.send(res, 503, { error: 'Konten sind auf diesem Server nicht aktiviert.' }), true;
      const m = req.method;
      if (m === 'POST' && url === '/api/register') return await this.register(req, res, ip), true;
      if (m === 'POST' && url === '/api/login') return await this.login(req, res, ip), true;
      const user = await this.authReq(req);
      if (!user) return this.send(res, 401, { error: 'Nicht angemeldet.' }), true;
      const ban = this.banInfo(user); if (ban) return this.send(res, 403, { error: 'Dein Konto ist gesperrt.', ban }), true;
      if (m === 'POST' && url === '/api/logout') { await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(String(req.headers.authorization).slice(7))]); return this.send(res, 200, { ok: true }), true; }
      if (m === 'GET' && url === '/api/me') return this.send(res, 200, { user: await this.publicUser(user), mutes: (await this.db.all('SELECT u.username FROM mutes m JOIN users u ON u.id=m.muted_id WHERE m.user_id=$1', [user.id])).map(r => r.username) }), true;
      if (m === 'GET' && url.startsWith('/api/profile/')) {
        if (this.rl.hit('prof:' + user.id, 60, 60000)) return this.send(res, 429, { error: 'Zu viele Anfragen.' }), true;
        const t = await this.db.one('SELECT * FROM users WHERE username_lower=$1', [decodeURIComponent(url.slice(13)).toLowerCase().slice(0, 16)]);
        if (!t) return this.send(res, 404, { error: 'Spieler nicht gefunden.' }), true;
        return this.send(res, 200, { user: await this.publicUser(t) }), true;
      }
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
        await t.query('INSERT INTO user_stats (user_id) VALUES ($1)', [u.id]); return u;
      });
    } catch (e) { if (e.code === '23505' || /unique/i.test(e.message)) return this.send(res, 409, { error: 'Dieser Benutzername ist schon vergeben.' }); throw e; }
    await this.audit(user, 'register', username, isOwner ? 'owner' : '');
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
      const left = this.rl.hit(lockKey, 8, 900000) ? 0 : 1; if (this.rl.count(lockKey) >= 6) await this.suspicious(u?.id, uname, 'login_failures', `ip=${ip} n=${this.rl.count(lockKey)}`);
      return this.send(res, 401, { error: 'Benutzername oder Passwort falsch.' });
    }
    const ban = this.banInfo(u); if (ban) return this.send(res, 403, { error: 'Dein Konto ist gesperrt.', ban });
    this.rl.clear(lockKey);
    await this.db.query('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    this.send(res, 200, { token: await this.createSession(u.id, req), user: await this.publicUser(u) });
  }

  async report(req, res, user) {
    const b = await this.body(req);
    if (this.rl.hit('rep:' + user.id, 5, 600000)) return this.send(res, 429, { error: 'Zu viele Meldungen. Bitte warten.' });
    const t = await this.db.one('SELECT id, username FROM users WHERE username_lower=$1', [clip(b.target, 16).toLowerCase()]);
    const reason = clip(b.reason, 200); if (!t || t.id === user.id || reason.length < 3) return this.send(res, 400, { error: 'Ungültige Meldung.' });
    await this.db.query('INSERT INTO reports (reporter_id, reported_id, reason, match_id) VALUES ($1,$2,$3,$4)', [user.id, t.id, reason, clip(b.matchId, 40) || null]);
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
