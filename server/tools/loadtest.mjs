// Lasttest: simuliert N Spieler (echte WebSocket-Clients) in Räumen à ≤12 Spielern. Misst Server-Metriken über /metrics.
// Aufruf: node server/tools/loadtest.mjs <spieler> [sekunden] [url]
import WebSocket from 'ws';
const N = +process.argv[2] || 10, SEC = +process.argv[3] || 20, BASE = process.argv[4] || 'localhost:8080';
const PER = +process.env.PER || 12, BOTS = +process.env.BOTS || 0, clients = []; let rxBytes = 0, rxMsgs = 0, errors = 0, joined = 0, started = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function mkClient(i, code, host) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://' + BASE); const c = { ws, i, id: null, ent: null, x: (Math.random() - 0.5) * 100, z: (Math.random() - 0.5) * 100, y: 1, yaw: 0, t: 0, alive: false };
    ws.on('open', () => { ws.send(JSON.stringify({ k: 'hello', name: 'LT' + i, skin: 'vanguard' })); ws.send(JSON.stringify(host ? { k: 'create', settings: { mode: 'ffa', bots: BOTS, scoreLimit: 100, timeLimit: 20 } } : { k: 'join', code })); });
    ws.on('message', (d) => { rxBytes += d.length; rxMsgs++; let m; try { m = JSON.parse(d); } catch { return; }
      if (m.k === 'joined') { c.id = 'p' + m.you; c.code = m.code; joined++; resolve(c); }
      if (m.k === 'start') { started++; }
      if (m.k === 'snap') for (const ev of m.ev) { if (ev.k === 'spawn' && ev.id === c.id) { c.x = ev.x; c.y = ev.y; c.z = ev.z; c.alive = true; } if (ev.k === 'kill' && ev.v === c.id) c.alive = false; }
      if (m.k === 'err') errors++; });
    ws.on('error', () => errors++);
    clients.push(c);
  });
}
const rooms = [];
for (let r = 0; r * PER < N; r++) {
  const n = Math.min(PER, N - r * PER); const host = await mkClient(r * PER, null, true); const members = [host];
  for (let k = 1; k < n; k++) members.push(await mkClient(r * PER + k, host.code, false));
  rooms.push({ host, members });
}
for (const r of rooms) r.host.ws.send(JSON.stringify({ k: 'start' }));
await sleep(5500); // Countdown
// Bewegung + Feuern simulieren (20 Hz Position, ~4 Schuss/s)
const iv = setInterval(() => { for (const c of clients) { if (c.ws.readyState !== 1 || !c.alive) continue; c.t += 0.05; c.yaw += (Math.random() - 0.5) * 0.3;
  c.x += Math.sin(c.yaw) * 0.25; c.z += Math.cos(c.yaw) * 0.25; c.x = Math.max(-150, Math.min(150, c.x)); c.z = Math.max(-150, Math.min(150, c.z));
  c.ws.send(JSON.stringify({ k: 'st', x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: 0, fl: 0, w: 'viper' }));
  if (Math.random() < 0.2) c.ws.send(JSON.stringify({ k: 'fire', w: 'viper', o: [c.x, c.y + 1.6, c.z], d: [Math.sin(c.yaw), 0, Math.cos(c.yaw)], s: (Math.random() * 1e9) | 0, sp: 1 })); } }, 50);
await fetch('http://' + BASE + '/metrics').then(r => r.json()); // Fenster leeren
rxBytes = rxMsgs = 0; await sleep(SEC * 1000);
const m = await fetch('http://' + BASE + '/metrics').then(r => r.json());
clearInterval(iv);
const out = { players: N, rooms: rooms.length, joined, started, seconds: SEC, errors, clientRxKBpsPerPlayer: +(rxBytes / 1024 / SEC / N).toFixed(1), server: m };
console.log(JSON.stringify(out));
for (const c of clients) try { c.ws.close(); } catch {}
await sleep(300); process.exit(0);
