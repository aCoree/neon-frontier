// Tests: Waffen-Limit, Droppen, Tauschen (keine endlose Aufheb-Schleife mehr).
import assert from 'node:assert/strict';
import { Room, MAX_WEAPONS } from '../client/js/shared/sim/room.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
const mkc = () => ({ msgs: [], send(o, raw) { this.msgs.push(raw ? JSON.parse(o) : o); } });
const room = new Room('INV', { settings: { mode: 'ffa', bots: 0, diff: 'easy', scoreLimit: 50, timeLimit: 5 } });
const m = room.addMember(mkc(), { name: 'A' }); room.start(); room.last = fake;
const step = (n = 1) => { for (let i = 0; i < n; i++) { fake += 25; room.tick(); } };
step(40 * 8); const e = m.ent; assert.ok(e && e.alive);
const drop = (item, kind = 'weapon') => room.addDyn(kind, item, e.x, e.y + 0.3, e.z, 600);
const POOL = ['striker', 'hornet', 'breaker', 'marksman', 'pulse', 'magnum'];

console.log('Inventar');
for (const w of POOL.slice(0, 3)) { drop(w); step(3); } assert.equal(e.owned.length, 5); assert.equal(MAX_WEAPONS, 5); ok('Bis zu 5 Waffen werden automatisch aufgenommen');
const extra = drop('lancer'); step(60); assert.ok(room.dyn.includes(extra)); assert.equal(e.owned.length, 5); assert.ok(!e.owned.includes('lancer')); ok('Bei vollem Inventar wird NICHTS mehr automatisch aufgenommen (keine Tausch-Schleife)');
assert.equal(room.dyn.filter(d => d.item === 'lancer').length, 1); ok('Die Waffe am Boden bleibt liegen und wird nicht dupliziert');
e.w = 'striker'; room.handle(m, { k: 'dropw' }); assert.ok(!e.owned.includes('striker')); assert.equal(e.owned.length, 4); assert.equal(e.w, 'viper'); ok('V: aktuelle Waffe droppen – danach ist die Viper in der Hand');
const dropped = room.dyn.find(d => d.item === 'striker'); assert.ok(dropped && dropped.lock.id === e.id);
step(40); assert.ok(e.owned.includes('lancer')); assert.ok(room.dyn.includes(dropped)); assert.ok(!e.owned.includes('striker')); ok('Der Dropper hebt seine gedroppte Waffe nicht sofort wieder auf (3 s Sperre) – ein freier Platz geht an eine andere Waffe');
for (const w of ['viper', 'blade']) { e.w = w; const n = e.owned.length; room.handle(m, { k: 'dropw' }); assert.equal(e.owned.length, n); } ok('Viper und Klinge lassen sich nie droppen');
const held = e.owned[2]; e.w = held; const lone = drop('stormcaller'); step(30); assert.ok(room.dyn.includes(lone)); assert.equal(e.owned.length, 5);
room.handle(m, { k: 'interact', t: 'swap', id: lone.id }); assert.ok(e.owned.includes('stormcaller')); assert.ok(!e.owned.includes(held)); assert.equal(e.owned.length, 5); assert.equal(e.w, 'stormcaller'); assert.ok(room.dyn.some(d => d.item === held)); assert.ok(!room.dyn.includes(lone)); ok('E bei vollem Inventar: tauscht gegen die gehaltene Waffe, die alte liegt danach am Boden');
const old = room.dyn.find(d => d.item === held); step(60); assert.ok(room.dyn.includes(old)); assert.equal(e.owned.length, 5); ok('Nach dem Tauschen gibt es keine Aufheb-Schleife');
const far = room.addDyn('weapon', 'longshot', e.x + 30, e.y, e.z, 600); room.handle(m, { k: 'interact', t: 'swap', id: far.id }); assert.ok(!e.owned.includes('longshot')); room.handle(m, { k: 'interact', t: 'swap', id: 'unbekannt' }); room.handle(m, { k: 'interact', t: 'swap' }); ok('Tauschen geht nur in Reichweite; ungültige/fehlende IDs werden ignoriert');
drop('grapple', 'gadget'); step(3); assert.equal(e.gadget, 'grapple'); const g2 = drop('scanner', 'gadget'); step(40); assert.equal(e.gadget, 'grapple'); assert.ok(room.dyn.includes(g2)); room.handle(m, { k: 'interact', t: 'swap', id: g2.id }); assert.equal(e.gadget, 'scanner'); assert.ok(room.dyn.some(d => d.item === 'grapple')); ok('Gadgets: das zweite wird nicht automatisch genommen, E tauscht und legt das alte ab');
Date.now = realNow; console.log(`\n${passed} Inventar-Tests bestanden`); process.exit(0);
