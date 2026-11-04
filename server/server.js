// NEON FRONTIER – Multiplayer-Server (Node.js + ws). Liefert zusätzlich den Client statisch aus (praktisch fürs Hosting auf einer einzigen Plattform).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../client/js/shared/sim/room.js';
import { MODES } from '../client/js/shared/defs.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../client');
const PORT = +process.env.PORT || 8080;
const SERVE_CLIENT = process.env.SERVE_CLIENT !== '0';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { for (let i = 0; i < 200; i++) { let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return 'R' + Date.now().toString(36).slice(-3).toUpperCase(); };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.humans().length, 0) })); }
  if (url === '/rooms') { const list = [...rooms.values()].filter(r => r.state === 'lobby' && r.settings.public && r.humans().length).map(r => ({ code: r.code, host: r.members.get(r.hostId)?.name || '?', mode: MODES[r.settings.mode].name, players: r.humans().length })); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify(list)); }
  if (!SERVE_CLIENT) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('NEON FRONTIER game server. WebSocket on this port.'); }
  let p = url.endsWith('/') ? url + 'index.html' : url;
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Nicht gefunden'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024, perMessageDeflate: false });

wss.on('connection', (ws, req) => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const client = { send(o, raw) { if (ws.readyState === 1) { try { ws.send(raw ? o : JSON.stringify(o)); } catch { /* Verbindung weg */ } } } };
  let room = null, member = null, profile = null, bucket = 120, lastRefill = Date.now();

  ws.on('message', (data) => {
    // Rate-Limit: ~200 Nachrichten/s Burst, 120/s im Mittel
    const now = Date.now(); bucket = Math.min(240, bucket + (now - lastRefill) * 0.12); lastRefill = now;
    if (--bucket < 0) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.k !== 'string') return;
    try {
      if (msg.k === 'hello') { profile = { name: msg.name, skin: msg.skin, wskin: msg.wskin, level: msg.level }; client.send({ k: 'welcome', v: 1, serverTime: Date.now() }); return; }
      if (msg.k === 'create') {
        if (!profile) return;
        if (room) leave();
        const code = newCode(); room = new Room(code, { settings: msg.settings });
        rooms.set(code, room); member = room.addMember(client, profile);
        console.log(`[room ${code}] erstellt von ${member.name}`); return;
      }
      if (msg.k === 'join') {
        if (!profile) return;
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return client.send({ k: 'err', code: 'noroom', text: `Raum „${code}“ nicht gefunden.` });
        if (r.humans().length >= (r.state === 'lobby' ? 12 : MODES[r.settings.mode].max)) return client.send({ k: 'err', code: 'full', text: 'Der Raum ist voll.' });
        if (room) leave();
        room = r; member = r.addMember(client, profile); console.log(`[room ${code}] ${member.name} beigetreten`); return;
      }
      if (msg.k === 'resume') {
        const r = rooms.get(String(msg.code || '').toUpperCase());
        const m = r && r.members.get(msg.id | 0);
        if (!r || !m || m.token !== msg.token) return client.send({ k: 'err', code: 'noresume', text: 'Sitzung abgelaufen.' });
        room = r; member = m; r.resume(m, client); console.log(`[room ${r.code}] ${m.name} wiederverbunden`); return;
      }
      if (msg.k === 'leave') { leave(); return; }
      if (room && member) room.handle(member, msg);
    } catch (e) { console.error('Fehler bei Nachricht', msg.k, e); }
  });

  function leave() {
    if (room && member) { try { room.removeMember(member, true); } catch (e) { console.error(e); } }
    room = null; member = null;
  }
  ws.on('close', () => {
    if (room && member) {
      try { if (room.state === 'lobby') room.removeMember(member, true); else room.removeMember(member, false); } catch (e) { console.error(e); }
    }
  });
  ws.on('error', () => {});
});

// Spiel-Tick (40 Hz) & Aufräumen
setInterval(() => {
  for (const [code, room] of rooms) {
    try { room.tick(); } catch (e) { console.error(`[room ${code}] Tick-Fehler`, e); }
    if (room.emptyAt && Date.now() - room.emptyAt > 60000) { room.destroy(); rooms.delete(code); console.log(`[room ${code}] entfernt (leer)`); }
  }
}, 25);
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* ignore */ } } }, 15000);

server.listen(PORT, () => console.log(`NEON FRONTIER Server läuft auf Port ${PORT} (Client wird ${SERVE_CLIENT ? 'mit ausgeliefert' : 'nicht ausgeliefert'})`));
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled', e));
