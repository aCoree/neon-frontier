// Tests: Karten-Auswahl und die Arena „Arena Zero“ (Ranked-Karte): Spawns, Begehbarkeit, Match mit Bots, Kartenwahl in der Lobby.
import assert from 'node:assert/strict';
import { Room, VS_SECS } from '../client/js/shared/sim/room.js';
import { buildMap, MAP_IDS } from '../client/js/shared/mapdata.js';
import { World } from '../client/js/shared/world.js';
import { Nav } from '../client/js/shared/sim/nav.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
const mk = (name) => ({ name, msgs: [], send(o, raw) { this.msgs.push(raw ? JSON.parse(o) : o); } });
const step = (r, n = 1) => { for (let i = 0; i < n; i++) { fake += 25; r.tick(); } };

console.log('Arena & Kartenwahl');
assert.deepEqual(MAP_IDS, ['frontier', 'arena']); ok('Zwei Karten registriert');
{
  const m = buildMap(true, 'arena'), w = new World(m), nav = Nav.for(w);
  assert.equal(m.id, 'arena'); assert.ok(m.spawns.length >= 12, 'Spawns: ' + m.spawns.length);
  for (const s of m.spawns) { assert.ok(Math.abs(w.groundAt(s.x, s.z, 80.5)) < 0.1, 'Spawn nicht auf dem Boden ' + s.x + ',' + s.z); assert.ok(nav.isWalk(s.x, s.z), 'Spawn nicht begehbar ' + s.x + ',' + s.z); assert.ok(Math.abs(s.x) < 46 && Math.abs(s.z) < 34); }
  ok(`${m.spawns.length} Startpunkte, alle auf dem Boden und begehbar`);
  // Symmetrie (Fairness): zu jedem Spawn gibt es den punktgespiegelten
  for (const s of m.spawns) assert.ok(m.spawns.some(o => Math.abs(o.x + s.x) < 0.01 && Math.abs(o.z + s.z) < 0.01), 'ohne Gegenstück ' + s.x + ',' + s.z);
  for (const p of m.pickups) assert.ok(m.pickups.some(o => o.item === p.item && o.kind === p.kind && Math.abs(o.x + p.x) < 0.01 && Math.abs(o.z + p.z) < 0.01 && Math.abs(o.y - p.y) < 0.01), 'Pickup ohne Gegenstück ' + p.item + ' ' + p.x + ',' + p.z);
  ok('Startpunkte und Ausrüstung sind punktsymmetrisch (fair für beide Seiten)');
  // Alle Bodenflächen sind vom West-Spawn aus erreichbar (kein Einschluss)
  const N = 200, start = nav.cell(-40, 0), seen = new Uint8Array(N * N), q = [start]; seen[start] = 1;
  while (q.length) { const k = q.pop(), i = k % N, j = (k / N) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const kk = b * N + a; if (seen[kk] || !nav.walk[kk] || Math.abs(nav.gh[kk] - nav.gh[k]) > 0.65) continue; seen[kk] = 1; q.push(kk); } }
  let isolated = 0; for (let k = 0; k < N * N; k++) if (nav.walk[k] && !seen[k]) { const x = -200 + ((k % N) + 0.5) * 2, z = -200 + (((k / N) | 0) + 0.5) * 2; if (Math.abs(x) < 43 && Math.abs(z) < 33) isolated++; }
  assert.equal(isolated, 0); assert.ok(seen[nav.cell(40, 0)]); ok('Alle Flächen in der Arena sind erreichbar, auch die gegnerische Bucht');
}
{
  const r = new Room('A1', { settings: { mode: 'duel', bots: 0 } }); assert.equal(r.settings.map, 'frontier'); assert.equal(r.map.id, 'frontier');
  const m = r.addMember(mk('Host'), { name: 'Host' });
  r.setSettings(m, { map: 'arena' }); assert.equal(r.settings.map, 'arena'); assert.equal(r.map.id, 'arena'); assert.ok(r.spawns.length >= 12); ok('Der Host kann die Arena in der Lobby wählen');
  r.setSettings(m, { map: 'quatsch' }); assert.equal(r.map.id, 'arena'); ok('Ungültige Karten werden ignoriert');
  r.setSettings(m, { map: 'frontier' }); assert.equal(r.map.id, 'frontier'); ok('… und zurück zur Weltkarte');
}
{
  const r = new Room('A2', { settings: { mode: 'duel', map: 'frontier' }, ranked: true }); assert.equal(r.settings.ranked, true); assert.equal(r.settings.map, 'arena'); assert.equal(r.map.id, 'arena');
  const m = r.addMember(mk('R'), { name: 'R' }); r.setSettings(m, { map: 'frontier' }); assert.equal(r.map.id, 'arena'); ok('Ranked läuft immer auf der Arena und lässt sich nicht umstellen');
}
{ // 1v1 zweier Menschen: Karte, VS-Karte, Countdown, danach Spiel
  const r = new Room('A3', { settings: { mode: 'duel', map: 'arena' } }); r.last = fake;
  const c1 = mk('Anna'), c2 = mk('Ben'); const a = r.addMember(c1, { name: 'Anna', userId: 1, rp: 1520, back: 'dragon', nc: 'gold' }), b = r.addMember(c2, { name: 'Ben', userId: 2, rp: 640 });
  assert.equal(a.back, 'dragon'); assert.equal(a.rp, 1520); assert.equal(b.back, 'none'); ok('Rückenstück, Wertung und Namensfarbe landen beim Mitspieler');
  r.start(); assert.equal(r.state, 'countdown'); assert.ok(Math.abs((r.startAt - r.T) - (4 + VS_SECS)) < 0.01, 'VS + Countdown');
  const st = c1.msgs.find(x => x.k === 'start'); assert.equal(st.vs, VS_SECS); assert.equal(st.settings.map, 'arena'); const infoA = st.ents.find(e => e.name === 'Anna'); assert.equal(infoA.rp, 1520); assert.equal(infoA.back, 'dragon'); assert.equal(infoA.nc, 'gold');
  ok('Gegner-Karte (' + VS_SECS + ' s) kommt vor dem Countdown; Startnachricht trägt Karte, Wertung und Rückenstück');
  const ea = a.ent, eb = b.ent; assert.ok(Math.hypot(ea.x - eb.x, ea.z - eb.z) > 30, 'Spieler starten an gegenüberliegenden Enden'); ok('Beide Spieler starten weit voneinander entfernt (' + Math.hypot(ea.x - eb.x, ea.z - eb.z).toFixed(0) + ' m)');
  step(r, 40 * 12); assert.equal(r.state, 'playing'); ok('Nach VS-Karte + Countdown läuft das Match');
}
{ // Match mit Bots auf der Arena
  const r = new Room('A4', { settings: { mode: 'ffa', bots: 5, diff: 'hard', scoreLimit: 0, timeLimit: 2, map: 'arena' } }); r.last = fake;
  const c = mk('Solo'); const m = r.addMember(c, { name: 'Solo' }); r.start(); step(r, 40 * 5);
  let kills = 0, supply = 0; for (let i = 0; i < 40 * 100; i++) { step(r); if (i % 2 === 0 && m.ent?.alive) r.handle(m, { k: 'st', x: m.ent.x, y: m.ent.y, z: m.ent.z, yaw: i * 0.01, pitch: 0, fl: 0, w: m.ent.w }); for (const msg of c.msgs.splice(0)) if (msg.k === 'snap') for (const ev of msg.ev) { if (ev.k === 'kill') kills++; if (ev.k === 'supply') supply++; } }
  for (const e of r.ents.values()) { assert.ok(Math.abs(e.x) <= 47.6 && Math.abs(e.z) <= 47.6, 'außerhalb der Grenze: ' + e.name + ' ' + e.x); assert.ok(e.y > -5, 'unter der Karte: ' + e.name); }
  assert.ok(kills > 0, 'keine Abschüsse'); assert.equal(supply, 0); ok(`Match mit 5 Bots: ${kills} Abschüsse, alle Figuren in der Arena, keine Nachschub-Kisten (fairer Kampf)`);
}
Date.now = realNow;
console.log(`\n${passed} Arena-Tests bestanden`);
