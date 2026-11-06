// Tests: Fallschaden (serverseitig aus Positionsdaten abgeleitet).
import assert from 'node:assert/strict';
import { Room, FALL_SAFE } from '../client/js/shared/sim/room.js';
import { FL } from '../client/js/shared/defs.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
const mk = (training = false) => { const r = new Room('F', { settings: { mode: 'ffa', bots: 0, diff: 'easy', scoreLimit: 50, timeLimit: 5, training } }); const m = r.addMember({ send() {} }, { name: 'A' }); r.start(); r.last = fake; return { r, m }; };
const step = (r, n = 1) => { for (let i = 0; i < n; i++) { fake += 25; r.tick(); } };
const X = 0, Z = 5;
const total = (e) => e.hp + (e.shield || 0);
const send = (r, m, y, extra = {}) => { step(r, 2); r.handle(m, { k: 'st', x: X, y, z: Z, yaw: 0, pitch: 0, fl: 0, w: 'viper', ...extra }); };
const fresh = (training) => { const { r, m } = mk(training); step(r, 40 * 8); const e = m.ent; e.x = X; e.z = Z; e.hp = 100; e.shield = 0; e.spawnInv = 0; const g = r.groundY(X, Z); send(r, m, g); return { r, m, e, g }; };
// Fall: oben beginnen (Luft), dann in kleinen Schritten absinken, zuletzt am Boden
const fall = (r, m, g, from, extra) => { send(r, m, from, { ...extra, tp: 1 }); for (let y = from; y > g + 0.6; y -= 1.2) send(r, m, y, extra); send(r, m, g, extra); };

console.log('Fallschaden');
{ const { r, m, e, g } = fresh(); fall(r, m, g, g + 4); assert.equal(total(e), 100); ok('Kleine Fälle (4 m) machen keinen Schaden'); }
{ const { r, m, e, g } = fresh(); fall(r, m, g, g + 12); const dmg = 100 - total(e); assert.ok(dmg > 38 && dmg < 52, 'Schaden ' + dmg); assert.ok(Math.abs(dmg - (12 - FALL_SAFE) * 7) < 8); ok('12 m Fall: ca. 45 Schaden (7 pro Meter über 5,5 m)'); }
{ const { r, m, e, g } = fresh(); fall(r, m, g, g + 30); assert.equal(e.alive, false); ok('Sehr hohe Fälle (30 m) sind tödlich'); }
{ const { r, m, e, g } = fresh(); fall(r, m, g, g + 14, { fl: FL.JET | FL.AIR }); assert.equal(total(e), 100); ok('Mit Jetpack kein Fallschaden'); }
{ const { r, m, e, g } = fresh(); fall(r, m, g, g + 14, { fl: FL.GRAPPLE }); assert.equal(total(e), 100); ok('Mit Enterhaken kein Fallschaden'); }
{ const { r, m, e, g } = fresh(); send(r, m, g + 6); send(r, m, g + 14); send(r, m, g + 22); for (let y = g + 21; y > g + 0.6; y -= 1.2) send(r, m, y); send(r, m, g); assert.equal(total(e), 100); ok('Sprungplatten/Katapult (schneller Start nach oben) verursachen keinen Fallschaden'); }
{ const { r, m, e, g } = fresh(); send(r, m, g + 25, { tp: 1 }); for (let y = g + 24; y > g + 12.5; y -= 1.2) send(r, m, y); send(r, m, g + 12, { tp: 1 }); for (let y = g + 10.8; y > g + 0.6; y -= 1.2) send(r, m, y); send(r, m, g); const dmg = 100 - total(e); assert.ok(e.alive && dmg > 30 && dmg < 52, 'Schaden ' + dmg); ok('Teleport mitten in der Luft setzt die Messung zurück (nur die letzten Meter zählen, nicht 25)'); }
{ const { r, m, e, g } = fresh(); r.lowgravUntil = r.T + 30; fall(r, m, g, g + 14); assert.equal(total(e), 100); ok('Bei Niedrig-Schwerkraft kein Fallschaden'); }
{ const { r, m, e, g } = fresh(true); fall(r, m, g, g + 20); assert.equal(total(e), 100); ok('Im Training gibt es keinen Fallschaden'); }
{ const { r, m, e, g } = fresh(); e.shield = 100; fall(r, m, g, g + 12); assert.ok(total(e) < 200 && total(e) > 100); ok('Der Schaden geht erst auf den Schild (wie anderer Schaden)'); }
{ // Wasser: Position mit Gelände unter dem Meeresspiegel suchen
  const { r, m, e } = fresh(); let wx = null, wz = null; for (let x = -190; x <= 190 && wx === null; x += 5) for (let z = 150; z <= 195; z += 5) if (r.world.terrain(x, z) < (r.map.seaLevel ?? 0) - 1) { wx = x; wz = z; break; }
  if (wx !== null) { const wy = r.world.terrain(wx, wz); e.x = wx; e.z = wz; e.y = wy + 15; r.handle(m, { k: 'st', x: wx, y: wy + 15, z: wz, yaw: 0, pitch: 0, fl: 0, w: 'viper', tp: 1 }); step(r, 2); for (let y = wy + 14; y > wy + 1; y -= 1.5) { step(r, 2); r.handle(m, { k: 'st', x: wx, y, z: wz, yaw: 0, pitch: 0, fl: 0, w: 'viper' }); } step(r, 2); r.handle(m, { k: 'st', x: wx, y: wy, z: wz, yaw: 0, pitch: 0, fl: 0, w: 'viper' }); assert.equal(total(e), 100); ok('Landung im Wasser ist ungefährlich'); } else ok('Wasser-Test übersprungen (kein Wasser-Punkt gefunden)'); }
{ const { r, m, e, g } = fresh(); send(r, m, g + 20, { tp: 1 }); send(r, m, g + 20.1); step(r, 2); r.handle(m, { k: 'st', x: X, y: g, z: Z, yaw: 0, pitch: 0, fl: 0, w: 'viper' }); assert.ok(total(e) < 100); ok('Auch ein „Sprung“ von oben ohne Zwischenschritte wird erkannt (kein Umgehen durch wenige Pakete)'); }

Date.now = realNow; console.log(`\n${passed} Fallschaden-Tests bestanden`); process.exit(0);
