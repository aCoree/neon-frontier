// Echter Mehrspielertest: N Spieler (je ein echter WebSocket-Client) spielen ein komplettes Match gleichzeitig – gegen einen lokalen
// Server oder den Render-Server. Prüft Verbindung, Lobby, Start, Snapshots, gegenseitige Sichtbarkeit, Treffer/Kills, Chat, Latenz,
// dass legitime Bewegung NIE zurückgesetzt wird und dass ein Speed-/Teleport-Cheater vom Server gestoppt wird.
//
//   node server/tools/mptest.mjs                       → startet lokal einen eigenen Server (Standard)
//   node server/tools/mptest.mjs https://DEIN-SERVER.onrender.com 6 40
//   Argumente: [ziel|local] [spieler=6] [sekunden=30]      Umgebung: NOCHEAT=1 überspringt den Cheater-Test
import WebSocket from 'ws';
import { buildMap } from '../../client/js/shared/mapdata.js';
import { World } from '../../client/js/shared/world.js';

const TARGET = process.argv[2] || 'local', N = Math.max(2, Math.min(10, +process.argv[3] || 6)), SEC = Math.max(10, +process.argv[4] || 30);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; let failed = 0;
const check = (ok, name, detail = '') => { results.push([ok, name, detail]); if (!ok) failed++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  – ' + detail : '')); };

let app = null, base, httpBase;
if (TARGET === 'local') {
  const { createApp } = await import('../app.js');
  const quiet = { log() {}, error() {}, warn() {}, info() {} };
  app = createApp({ db: null, serveClient: false, log: quiet });
  const port = await app.start(0); base = 'ws://127.0.0.1:' + port; httpBase = 'http://127.0.0.1:' + port;
} else {
  const t = TARGET.replace(/\/$/, '');
  if (/^https?:\/\//.test(t)) { httpBase = t; base = t.replace(/^http/, 'ws'); }
  else { httpBase = 'http://' + t; base = 'ws://' + t; }
}
console.log(`NEON FRONTIER Mehrspielertest · Ziel ${TARGET === 'local' ? 'lokaler Server' : httpBase} · ${N} Spieler · ${SEC} s`);

const world = new World(buildMap());
const groundAt = (x, z, y) => world.groundAt(x, z, y + 0.6);

// ---- Server erreichbar? ----
let health = null;
for (let i = 0; i < 12 && !health; i++) { try { const r = await fetch(httpBase + '/health'); if (r.ok) health = await r.json(); } catch { /* Server schläft evtl. (Render Free) */ } if (!health) await sleep(5000); }
check(!!health && health.ok, 'Server erreichbar (/health)', health ? `Build ${health.build || '?'} · ${health.rooms} Räume · ${health.players} Spieler` : 'keine Antwort');
if (!health) { console.log('\nAbbruch.'); process.exit(1); }
const roomsBefore = health.rooms;

// ---- Clients ----
class Bot {
  constructor(i, name) {
    this.i = i; this.name = name; this.ws = null; this.id = null; this.code = null; this.members = 0; this.you = null; this.x = 0; this.y = 0; this.z = 0; this.yaw = Math.random() * 6.28;
    this.alive = false; this.go = false; this.snaps = 0; this.seen = new Set(); this.others = new Map(); this.fixes = 0; this.kills = 0; this.deaths = 0; this.chats = []; this.errs = []; this.rtts = []; this.closed = false; this.tx = 0; this.tz = 0; this.fireAt = 0; this.shots = 0; this.hits = 0;
    this.speed = 8.0; this.cheat = null;
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = this.ws = new WebSocket(base); const to = setTimeout(() => reject(new Error('Verbindung Zeitüberschreitung')), 20000);
      ws.on('open', () => { clearTimeout(to); this.send({ k: 'hello', name: this.name, skin: 'vanguard', wskin: 'default' }); });
      ws.on('error', (e) => { this.errs.push('ws:' + e.message); });
      ws.on('close', () => { this.closed = true; });
      ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.k === 'welcome') resolve();
        else if (m.k === 'joined') { this.id = m.you; this.code = m.code; }
        else if (m.k === 'lobby') this.members = m.members.length;
        else if (m.k === 'start') { this.you = m.you; }
        else if (m.k === 'pong') this.rtts.push(Date.now() - m.t);
        else if (m.k === 'fix') { this.fixes++; this.x = m.x; this.y = m.y; this.z = m.z; this.tp = true; }
        else if (m.k === 'chat') this.chats.push(m);
        else if (m.k === 'err') this.errs.push(m.code + ':' + m.text);
        else if (m.k === 'snap') this.onSnap(m);
      });
    });
  }
  onSnap(m) {
    this.snaps++;
    for (const r of m.e) {
      if (r[0] === this.you) { continue; }
      this.seen.add(r[0]); this.others.set(r[0], { x: r[1], y: r[2], z: r[3], dead: !!(r[6] & 64), t: Date.now() });
    }
    for (const ev of m.ev) {
      if (ev.k === 'go') this.go = true;
      else if (ev.k === 'spawn' && ev.id === this.you) { this.x = ev.x; this.y = ev.y; this.z = ev.z; this.alive = true; this.tp = true; }
      else if (ev.k === 'hit' && ev.a === this.you) this.hits++;
      else if (ev.k === 'kill') { if (ev.a === this.you) this.kills++; if (ev.v === this.you) { this.deaths++; this.alive = false; } }
    }
  }
  // 20 Hz: über das Gelände laufen (Sprint), mit begrenzter Fallgeschwindigkeit, ab und zu auf den nächsten Gegner schießen
  tick(now) {
    if (!this.alive || !this.go || this.closed) return;
    const dt = 0.05;
    if (this.cheat) return this.cheat(dt);
    if (Math.hypot(this.tx - this.x, this.tz - this.z) < 3 || Math.random() < 0.01) {   // Gegner suchen (damit es Begegnungen gibt), sonst zufälliges Ziel
      const live = [...this.others.values()].filter(o => !o.dead);
      if (live.length && Math.random() < 0.75) { const o = live[(Math.random() * live.length) | 0]; this.tx = o.x + (Math.random() - 0.5) * 20; this.tz = o.z + (Math.random() - 0.5) * 20; } else { this.tx = (Math.random() - 0.5) * 300; this.tz = (Math.random() - 0.5) * 300; }
    }
    if (Math.hypot(this.tx - this.x, this.tz - this.z) > 0 && this.tgt) { /* Ziel bleibt */ }
    const yaw = Math.atan2(this.tx - this.x, this.tz - this.z); this.yaw = yaw;
    let nx = this.x + Math.sin(yaw) * this.speed * dt, nz = this.z + Math.cos(yaw) * this.speed * dt;
    nx = Math.max(-185, Math.min(185, nx)); nz = Math.max(-185, Math.min(185, nz));
    const g = groundAt(nx, nz, this.y); let ny = this.y;
    if (g > ny) ny = Math.min(g, ny + 0.55); else ny = Math.max(g, ny - 1.4);
    this.x = nx; this.z = nz; this.y = ny;
    this.send({ k: 'st', x: +this.x.toFixed(2), y: +this.y.toFixed(2), z: +this.z.toFixed(2), yaw: +yaw.toFixed(3), pitch: 0, fl: 2, w: 'viper', tp: this.tp ? 1 : 0 }); this.tp = false;
    if (now >= this.fireAt) {   // nächsten lebenden Gegner anvisieren
      let best = null, bd = 80;
      for (const o of this.others.values()) { if (o.dead || now - o.t > 600) continue; const d = Math.hypot(o.x - this.x, o.z - this.z); if (d < bd) { bd = d; best = o; } }
      if (best) { const ox = this.x, oy = this.y + 1.6, oz = this.z, dx = best.x - ox, dy = best.y + 1.0 - oy, dz = best.z - oz, L = Math.hypot(dx, dy, dz) || 1; this.send({ k: 'fire', w: 'viper', o: [ox, oy, oz], d: [dx / L, dy / L, dz / L], s: (Math.random() * 1e9) | 0, sp: 1 }); this.shots++; }
      this.fireAt = now + 260;
    }
  }
}

const bots = Array.from({ length: N }, (_, i) => new Bot(i, 'MP' + String(Date.now()).slice(-5) + i));
let t0 = Date.now();
try { await Promise.all(bots.map(b => b.connect())); } catch (e) { check(false, 'Alle Spieler verbinden sich', e.message); process.exit(1); }
check(true, `${N} Spieler verbunden`, `${Date.now() - t0} ms`);

// ---- Lobby ----
bots[0].send({ k: 'create', settings: { mode: 'ffa', bots: 0, diff: 'easy', scoreLimit: 100, timeLimit: 5, tod: 'day' } });
for (let i = 0; i < 100 && !bots[0].code; i++) await sleep(50);
check(!!bots[0].code, 'Raum erstellt', 'Code ' + bots[0].code);
for (const b of bots.slice(1)) b.send({ k: 'join', code: bots[0].code });
for (let i = 0; i < 100 && bots.some(b => !b.id); i++) await sleep(50);
check(bots.every(b => b.id != null), 'Alle sind beigetreten');
await sleep(500);
check(bots.every(b => b.members === N), 'Alle sehen die vollständige Lobby', bots.map(b => b.members).join(','));

// ---- Match starten ----
bots[0].send({ k: 'start' });
for (let i = 0; i < 300 && !bots.every(b => b.go); i++) await sleep(50);
check(bots.every(b => b.go), 'Match läuft bei allen (Countdown beendet)');
check(bots.every(b => b.alive), 'Jeder Spieler hat einen Spawn erhalten');

// ---- Spielen ----
const timer = setInterval(() => { const now = Date.now(); for (const b of bots) b.tick(now); }, 50);
const pinger = setInterval(() => { for (const b of bots) b.send({ k: 'ping', t: Date.now(), rtt: 0.05 }); }, 1000);
let chatSent = false;
for (let s = 0; s < SEC; s++) {
  await sleep(1000);
  if (!chatSent && s === Math.min(5, SEC - 3)) { chatSent = true; bots[1 % N].send({ k: 'chat', text: 'Hallo vom Mehrspielertest', scope: 'all' }); }
  if (s % 10 === 9) console.log(`    … ${s + 1}/${SEC} s · Snapshots ${bots.map(b => b.snaps).join('/')} · Kills ${bots.reduce((a, b) => a + b.kills, 0)}`);
}

// ---- Auswertung (vor dem Cheat-Test) ----
const rate = (b) => b.snaps / (SEC + 5);
check(bots.every(b => b.snaps > SEC * 8), 'Alle bekommen laufend Snapshots', 'je ' + bots.map(b => (b.snaps / SEC).toFixed(0)).join('/') + ' pro Sekunde');
check(bots.every(b => b.seen.size >= N - 1), 'Jeder sieht alle anderen Spieler', bots.map(b => b.seen.size).join(','));
const fixes = bots.reduce((a, b) => a + b.fixes, 0);
check(fixes === 0, 'Legitime Bewegung wird NIE zurückgesetzt (keine Fehlalarme)', fixes + ' Zurücksetzer bei ' + bots.length * SEC * 20 + ' Positionspaketen');
const kills = bots.reduce((a, b) => a + b.kills, 0), shots = bots.reduce((a, b) => a + b.shots, 0);
check(shots > 0, 'Schüsse wurden abgefeuert', shots + ' Schüsse');
const hits = bots.reduce((a, b) => a + b.hits, 0);
check(hits > 0 || shots < 40, 'Treffer werden vom Server berechnet und gemeldet', hits + ' Treffer · ' + kills + ' Kills' + (hits ? '' : ' (zu wenige Begegnungen im Test)'));
check(bots.filter(b => b.chats.some(c => /Mehrspielertest/.test(c.text || ''))).length >= Math.max(1, N - 1), 'Chat kommt bei den anderen an');
const rtts = bots.flatMap(b => b.rtts).sort((a, b) => a - b), med = rtts[rtts.length >> 1] ?? 0, p95 = rtts[Math.floor(rtts.length * 0.95)] ?? 0;
check(rtts.length > N * 3 && p95 < 800, 'Latenz (Ping)', `Median ${med} ms · p95 ${p95} ms`);
check(bots.every(b => !b.closed), 'Keine Verbindung ist abgebrochen');
check(bots.every(b => b.errs.length === 0), 'Keine Fehlermeldungen vom Server', bots.flatMap(b => b.errs).slice(0, 3).join(' | '));

// ---- Cheater: ein Spieler fälscht Tempo und Teleport ----
if (!process.env.NOCHEAT) {
  for (let i = 0; i < 100 && !bots.some(b => b.alive); i++) await sleep(100);
  const ch = bots.find(b => b.alive) || bots[N - 1]; ch.fixes = 0;
  let step = 0; for (const b of bots) if (b !== ch) b.fireAt = Infinity;   // niemand schießt, damit der Cheater nicht stirbt
  ch.cheat = () => { step++; if (step % 25 === 0) { ch.send({ k: 'st', x: Math.max(-185, Math.min(185, ch.x + 90)), y: ch.y, z: ch.z, yaw: 0, pitch: 0, fl: 0, w: 'viper', tp: 1 }); } else if (step <= 80) { ch.x = Math.max(-185, Math.min(185, ch.x + 1.0)); ch.send({ k: 'st', x: ch.x, y: ch.y, z: ch.z, yaw: 0, pitch: 0, fl: 2, w: 'viper', tp: 0 }); } };
  await sleep(5000); ch.cheat = null;
  check(ch.fixes >= 3, 'Cheater (20 m/s + gefälschter tp-Teleport) wird vom Server zurückgesetzt', ch.fixes + ' Korrekturen');
}

clearInterval(timer); clearInterval(pinger);
for (const b of bots) b.send({ k: 'leave' });
await sleep(800);
for (const b of bots) try { b.ws.close(); } catch { /* egal */ }
await sleep(1500);
try { const h = await (await fetch(httpBase + '/health')).json(); check(h.ok && h.players === 0 || h.players <= health.players, 'Alle Spieler sind abgemeldet, Server läuft weiter', `${h.players} Spieler · ${h.rooms} Raum/Räume (leere Räume werden nach 20 s entfernt)`); } catch { check(false, 'Server antwortet nach dem Test'); }

console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden${failed ? ' – ' + failed + ' FEHLGESCHLAGEN' : ''}`);
if (app) await app.stop().catch(() => {});
process.exit(failed ? 1 : 0);
