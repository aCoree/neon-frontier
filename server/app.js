// NEON FRONTIER – Server-Anwendung: HTTP (Client + API), WebSocket-Räume, Konten (optional, PostgreSQL), Metriken.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../client/js/shared/sim/room.js';
import { MODES } from '../client/js/shared/defs.js';
import { Api } from './lib/api.js';
import { Analytics } from './lib/analytics.js';
import { Parties } from './lib/party.js';
import { applyMatchResult } from './lib/progression.js';
import { can, filterText } from './lib/auth.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../client');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createApp({ db = null, config = {}, serveClient = true, log = console } = {}) {
  const rooms = new Map();
  const M = { bytesOut: 0, bytesIn: 0, msgsIn: 0, tickSum: 0, tickMax: 0, ticks: 0, lastCpu: process.cpuUsage(), lastT: Date.now(), errors: 0, slowTicks: 0 };
  const playersOnline = () => [...rooms.values()].reduce((n, r) => n + r.humans().length, 0);
  function metricsSnapshot() {
    const now = Date.now(), dt = (now - M.lastT) / 1000 || 1, cpu = process.cpuUsage(M.lastCpu), mem = process.memoryUsage();
    const out = { windowSec: +dt.toFixed(2), tickAvgMs: +(M.tickSum / Math.max(1, M.ticks)).toFixed(3), tickMaxMs: +M.tickMax.toFixed(2), ticksPerSec: +(M.ticks / dt).toFixed(1), slowTicks: M.slowTicks,
      cpuPct: +(((cpu.user + cpu.system) / 1000) / (dt * 10)).toFixed(1), rssMB: +(mem.rss / 1048576).toFixed(1), heapMB: +(mem.heapUsed / 1048576).toFixed(1),
      outKBps: +(M.bytesOut / 1024 / dt).toFixed(1), inKBps: +(M.bytesIn / 1024 / dt).toFixed(1), msgsInPerSec: +(M.msgsIn / dt).toFixed(0), rooms: rooms.size, players: playersOnline(), errors: M.errors };
    M.bytesOut = M.bytesIn = M.msgsIn = M.tickSum = M.tickMax = M.ticks = M.slowTicks = 0; M.lastCpu = process.cpuUsage(); M.lastT = now;
    return out;
  }
  const sockets = new Map();   // userId -> Anzahl offener WebSocket-Verbindungen (angemeldet)
  const social = new Map();    // userId -> Set(client): dauerhafte „Social“-Verbindung im Menü (Echtzeit-Hinweise, Einladungen)
  const parties = new Parties({ send: (id, m) => notify(id, m), isOnline: (id) => (social.get(Number(id))?.size || 0) > 0 });
  const notify = (userId, msg) => { const s = social.get(Number(userId)); if (!s || !s.size) return false; for (const c of s) c.send(msg); return true; };
  const presence = (userId) => {
    const online = (sockets.get(userId) || 0) > 0; if (!online) return { online: false };
    for (const r of rooms.values()) for (const m of r.members.values()) if (m.userId === userId && m.connected) return { online: true, room: r.state === 'lobby' ? r.code : null, inMatch: r.state !== 'lobby' };
    return { online: true };
  };
  let api;
  const stats = new Analytics(db, { enabled: () => api.flags.analytics !== false, log, sample: (a) => { a.max('peak_players', '', playersOnline()); a.max('peak_rooms', '', rooms.size); } });
  api = new Api({
    db, stats, notify, config, log, presence, metrics: () => metricsSnapshot(),
    rooms: () => [...rooms.values()].map(r => ({ code: r.code, state: r.state, mode: r.settings.mode, players: r.humans().length, matchId: r.matchId })),
    onBan: (userId, reason) => { parties.leave(userId); for (const c of [...(social.get(userId) || [])]) { c.send({ k: 'err', code: 'banned', text: 'Dein Konto wurde gesperrt.' }); c.close(); } for (const r of rooms.values()) for (const m of r.members.values()) if (m.userId === userId && m.client) { m.client.send({ k: 'kicked', text: 'Dein Konto wurde gesperrt: ' + reason }); m.client.close && m.client.close(); } },
  });
  const newCode = () => { for (let i = 0; i < 200; i++) { let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return 'R' + Date.now().toString(36).slice(-3).toUpperCase(); };

  const json = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('#')[0]);
    const route = url.split('?')[0];
    try { if (await api.handle(req, res, url)) return; } catch (e) { log.error('[http]', e); res.writeHead(500); return res.end(); }
    if (route === '/health') return json(res, { ok: true, rooms: rooms.size, players: playersOnline(), accounts: !!db, maintenance: api.maintenance });
    if (route === '/metrics') return json(res, metricsSnapshot());
    if (route === '/rooms') return json(res, [...rooms.values()].filter(r => r.state === 'lobby' && r.settings.public && r.humans().length).map(r => ({ code: r.code, host: r.members.get(r.hostId)?.name || '?', mode: MODES[r.settings.mode].name, players: r.humans().length })));
    if (!serveClient) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('NEON FRONTIER game server. WebSocket on this port.'); }
    const p = route.endsWith('/') ? route + 'index.html' : route, file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Nicht gefunden'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024, perMessageDeflate: false });
  wss.on('connection', (ws, req) => {
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    const client = { send(o, raw) { if (ws.readyState === 1) { try { const d = raw ? o : JSON.stringify(o); M.bytesOut += d.length; ws.send(d); } catch { /* Verbindung weg */ } } }, close() { try { ws.close(); } catch { /* ignore */ } } };
    let room = null, member = null, profile = null, bucket = 120, lastRefill = Date.now(), chain = Promise.resolve();

    const hooksFor = () => { const h = { room: null, chatAllowed: () => api.flags.chat, emotesAllowed: () => api.flags.emotes, track: (m, d) => stats.inc(m, d), filter: filterText, suspicious: (m, kind, detail) => api.suspicious(m.userId, m.name, kind, detail, h.room?.matchId), matchEnd: (r, matchId, results) => finishMatch(r, matchId, results) }; return h; };
    async function finishMatch(r, matchId, results) {
      if (!db) return;
      const mode = r.settings.mode, secs = Math.round(r.T - (r.matchStart || 0)), humans = r.humans().length;
      stats.inc('match_end', mode); stats.inc('match_secs', mode, secs); stats.inc('match_humans', mode, humans);
      for (const x of results) {
        try {
          const rew = await applyMatchResult(db, x.userId, matchId, { kills: x.kills, deaths: x.deaths, hs: x.hs, dmg: x.dmg, won: x.won, secs: x.secs, humans: x.humans, ranked: x.ranked && api.flags.ranked });
          if (rew) r.send(x.member, { k: 'reward', matchId, ...rew });
        } catch (e) { M.errors++; log.error('[db] Match-Ergebnis', e.message); }
      }
    }
    async function onMessage(msg) {
      if (msg.k === 'hello') {
        let acct = null;
        if (db && typeof msg.token === 'string' && msg.token) {
          acct = await api.userFromToken(msg.token);
          if (acct) { const ban = api.banInfo(acct); if (ban) { client.send({ k: 'err', code: 'banned', text: 'Dein Konto ist gesperrt.' }); client.close(); return; } }
        }
        if (api.maintenance && !(acct && can(acct.role, 'MODERATOR'))) { client.send({ k: 'err', code: 'maintenance', text: 'NEON FRONTIER wird gerade gewartet. Bitte später erneut versuchen.' }); client.close(); return; }
        if (acct) {
          const s = await db.one('SELECT level, equipped_skin, equipped_wskin FROM user_stats WHERE user_id=$1', [acct.id]);
          profile = { name: acct.username, skin: s ? s.equipped_skin : 'vanguard', wskin: s ? s.equipped_wskin : 'default', level: s ? s.level : 1, userId: Number(acct.id), role: acct.role };
        } else {
          let name = String(msg.name || 'Gast').replace(/[^\w\- äöüÄÖÜß]/g, '').slice(0, 14) || 'Gast';
          if (db) { const clash = await db.one('SELECT 1 FROM users WHERE username_lower=$1', [name.toLowerCase()]); if (clash) name = name.slice(0, 11) + '_G' + Math.floor(Math.random() * 90 + 10); }
          profile = { name, skin: msg.skin, wskin: msg.wskin, level: Math.min(99, msg.level | 0) };
        }
        if (msg.social) {   // reine Hinweis-Verbindung: nur für angemeldete Spieler, höchstens 5 pro Konto, kann keine Räume betreten
          if (!acct) { client.send({ k: 'err', code: 'nosocial', text: 'Nicht angemeldet.' }); client.close(); return; }
          const set = social.get(profile.userId) || new Set(); if (set.size >= 5) { client.send({ k: 'err', code: 'toomany', text: 'Zu viele Verbindungen.' }); client.close(); return; }
          set.add(client); social.set(profile.userId, set); client.social = true; profile.social = true; parties.touch(profile.userId, { name: profile.name, level: profile.level, skin: profile.skin, wskin: profile.wskin });
        }
        if (acct && profile.userId && !client.counted) { client.counted = profile.userId; sockets.set(profile.userId, (sockets.get(profile.userId) || 0) + 1); }
        client.send({ k: 'welcome', v: 2, serverTime: Date.now(), account: !!acct, name: profile.name, role: acct ? acct.role : 'GUEST' }); return;
      }
      if (client.social) { await handleSocial(msg); return; }   // Social-Verbindungen verstehen nur party_*-Befehle
      if (msg.k === 'create') {
        if (!profile) return; if (room) leave();
        const code = newCode(), hooks = hooksFor(); room = new Room(code, { settings: msg.settings, hooks }); hooks.room = room;
        rooms.set(code, room); profile.party = parties.partyIdOf(profile.userId); member = room.addMember(client, profile); loadMutes();
        log.log(`[room ${code}] erstellt von ${member.name}`); return;
      }
      if (msg.k === 'join') {
        if (!profile) return;
        const code = String(msg.code || '').toUpperCase().trim(), r = rooms.get(code);
        if (!r) return client.send({ k: 'err', code: 'noroom', text: `Raum „${code}“ nicht gefunden.` });
        if (r.humans().length >= (r.state === 'lobby' ? 12 : MODES[r.settings.mode].max)) return client.send({ k: 'err', code: 'full', text: 'Der Raum ist voll.' });
        if (room) leave();
        room = r; profile.party = parties.partyIdOf(profile.userId); member = r.addMember(client, profile); loadMutes(); log.log(`[room ${code}] ${member.name} beigetreten`); return;
      }
      if (msg.k === 'resume') {
        const r = rooms.get(String(msg.code || '').toUpperCase()), m = r && r.members.get(msg.id | 0);
        if (!r || !m || m.token !== msg.token) return client.send({ k: 'err', code: 'noresume', text: 'Sitzung abgelaufen.' });
        room = r; member = m; r.resume(m, client); log.log(`[room ${r.code}] ${m.name} wiederverbunden`); return;
      }
      if (msg.k === 'leave') { leave(); return; }
      if (msg.k === 'refreshmutes') { loadMutes(); return; }
      if (room && member) room.handle(member, msg);
    }
    // Party-Befehle über die Social-Verbindung. Alle Rechte prüft der Server: nur Freunde einladen, nur der Leiter lädt ein/entfernt/nimmt mit.
    async function handleSocial(msg) {
      const uid = profile.userId, reply = (ok, error, extra) => client.send({ k: 'party_result', action: msg.k, ok, error, ...extra });
      if (!msg.k.startsWith('party_')) return;
      if (!api.flags.friends) return reply(false, 'Das Freunde-System ist gerade deaktiviert.');
      if (api.rl.hit('party:' + uid, 60, 60000)) return reply(false, 'Zu viele Anfragen. Bitte kurz warten.');
      const name = String(msg.target ?? msg.from ?? '').slice(0, 16);
      switch (msg.k) {
        case 'party_invite': {
          if (api.rl.hit('pinv:' + uid, 20, 60000)) return reply(false, 'Zu viele Einladungen. Bitte kurz warten.');
          const t = await api.friendByName(uid, name); if (!t) return reply(false, 'Du kannst nur Freunde einladen.');
          if ((await api.mutedBy(Number(t.id))).has(String(uid))) return reply(true, undefined, { target: t.username });   // stumm geschaltet = still verworfen
          const r = parties.invite(uid, { id: Number(t.id), name: t.username }); if (r.ok) stats.inc('party_invite'); return reply(r.ok, r.error, { target: t.username });
        }
        case 'party_accept': { const r = parties.accept(uid, name); if (r.ok) stats.inc('party_join'); return reply(r.ok, r.error); }
        case 'party_decline': return reply(parties.decline(uid, name).ok);
        case 'party_leave': return reply(parties.leave(uid).ok);
        case 'party_kick': { const r = parties.kick(uid, name); return reply(r.ok, r.error); }
        case 'party_promote': { const r = parties.promote(uid, name); return reply(r.ok, r.error); }
        case 'party_follow': {   // Leiter ist einer Lobby beigetreten → Server prüft, dass er wirklich dort ist
          const rm = rooms.get(String(msg.code || '').toUpperCase());
          if (!rm || rm.state !== 'lobby' || ![...rm.members.values()].some(m => m.userId === uid && m.connected)) return reply(false, 'Du bist in keiner Lobby.');
          const r = parties.follow(uid, rm.code); return reply(r.ok, r.error, { notified: r.notified });
        }
      }
    }
    function loadMutes() { const m = member; if (m && m.userId) api.mutedBy(m.userId).then(s => { m.muted = s; }).catch(() => {}); }

    ws.on('message', (data) => {
      const now = Date.now(); bucket = Math.min(240, bucket + (now - lastRefill) * 0.12); lastRefill = now;
      if (--bucket < 0) return;
      M.msgsIn++; M.bytesIn += data.length || 0;
      let msg; try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.k !== 'string') return;
      chain = chain.then(() => onMessage(msg)).catch((e) => { M.errors++; log.error('Fehler bei Nachricht', msg.k, e); });  // Nachrichten pro Verbindung strikt nacheinander
    });
    function leave() { if (room && member) { try { room.removeMember(member, true); } catch (e) { log.error(e); } } room = null; member = null; }
    ws.on('close', () => { if (client.social && profile) { const set = social.get(profile.userId); if (set) { set.delete(client); if (!set.size) { social.delete(profile.userId); parties.drop(profile.userId); } } } if (client.counted) { const n = (sockets.get(client.counted) || 1) - 1; n > 0 ? sockets.set(client.counted, n) : sockets.delete(client.counted); } if (room && member) { try { if (room.state === 'lobby') room.removeMember(member, true); else room.removeMember(member, false); } catch (e) { log.error(e); } } });
    ws.on('error', () => {});
  });

  const tickTimer = setInterval(() => {
    for (const [code, room] of rooms) {
      const t0 = performance.now(); try { room.tick(); } catch (e) { M.errors++; log.error(`[room ${code}] Tick-Fehler`, e); } const d = performance.now() - t0; M.tickSum += d; M.ticks++; if (d > M.tickMax) M.tickMax = d; if (d > 25) M.slowTicks++;
      if (room.emptyAt && Date.now() - room.emptyAt > 20000) { room.destroy(); rooms.delete(code); log.log(`[room ${code}] entfernt (leer)`); }
    }
  }, 25);
  const pingTimer = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* ignore */ } } }, 15000);

  return {
    server, api, rooms, wss, stats, parties,
    async start(port) { await api.init(); stats.start(); await new Promise(r => server.listen(port, r)); return server.address().port; },
    async stop() { await stats.stop().catch(() => {}); clearInterval(tickTimer); clearInterval(pingTimer); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(r => server.close(r)); },
  };
}
