// Test der serverseitigen Emote-Regeln (ohne Netzwerk): gültige IDs, Abklingzeit, tot/aus, Feature-Flag, Ankunft im Snapshot.
import assert from 'node:assert/strict';
import { Room } from '../client/js/shared/sim/room.js';
import { EMOTES, EMOTE_COOLDOWN } from '../client/js/shared/defs.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
const mk = (name) => ({ name, msgs: [], send(o, raw) { this.msgs.push(raw ? JSON.parse(o) : o); } });
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
let allowed = true;
const room = new Room('EMO', { settings: { mode: 'ffa', bots: 0, diff: 'easy', scoreLimit: 50, timeLimit: 5 }, hooks: { emotesAllowed: () => allowed } });
const c1 = mk('A'), c2 = mk('B');
const m1 = room.addMember(c1, { name: 'A' }), m2 = room.addMember(c2, { name: 'B' });
room.start(); room.last = fake;
const step = (n = 1) => { for (let i = 0; i < n; i++) { fake += 25; room.tick(); } };
step(40 * 8);   // Countdown abwarten
assert.ok(m1.ent && m1.ent.alive, 'Spieler lebt');
const emotes = () => room.ev.filter(e => e.k === 'emote');
const send = (m, id) => { room.ev.length = 0; room.handle(m, { k: 'emote', id }); return emotes(); };

console.log('Emotes (Server)');
let r = send(m1, 'gg'); assert.equal(r.length, 1); assert.equal(r[0].e, EMOTES.findIndex(x => x.id === 'gg')); assert.equal(r[0].id, m1.ent.id); ok('Gültiges Emote wird mit Spieler-ID und Index gesendet');
assert.equal(send(m1, 'wave').length, 0); ok('Zweites Emote innerhalb der Abklingzeit wird verworfen');
assert.equal(send(m2, 'wave').length, 1); ok('Abklingzeit gilt pro Spieler, nicht global');
fake += EMOTE_COOLDOWN * 1000 + 50; assert.equal(send(m1, 'wave').length, 1); ok('Nach Ablauf der Abklingzeit wieder erlaubt');
for (const bad of ['../../x', '', 5, null, undefined, {}, ['gg'], 'GG', '<script>']) { fake += EMOTE_COOLDOWN * 1000 + 50; assert.equal(send(m1, bad).length, 0, 'ungültig: ' + String(bad)); } ok('Ungültige Emote-IDs werden ignoriert (Strings, Objekte, Skripte)');
fake += EMOTE_COOLDOWN * 1000 + 50; allowed = false; assert.equal(send(m1, 'gg').length, 0); allowed = true; assert.equal(send(m1, 'gg').length, 1); ok('Feature-Flag „emotes“ schaltet Emotes serverseitig ab');
fake += EMOTE_COOLDOWN * 1000 + 50; m2.ent.alive = false; assert.equal(send(m2, 'gg').length, 0); m2.ent.alive = true; ok('Tote Spieler können nicht emoten');
const emoteTo = (c, id) => { fake += EMOTE_COOLDOWN * 1000 + 50; room.ev.length = 0; room.handle(m1, { k: 'emote', id }); c.msgs.length = 0; room.flush(true); const sn = c.msgs.find(x => x.k === 'snap'); return !!(sn && sn.ev.some(e => e.k === 'emote' && e.e === EMOTES.findIndex(x => x.id === id))); };
m2.ent.x = m1.ent.x + 4; m2.ent.z = m1.ent.z + 4; assert.equal(emoteTo(c2, 'fire'), true); ok('Emote kommt im Snapshot bei Spielern in der Nähe an');
m2.ent.x = m1.ent.x + 400; assert.equal(emoteTo(c2, 'cry'), false); assert.equal(emoteTo(c1, 'cry'), true); ok('Weit entfernte Spieler bekommen das Emote nicht (Interest Management), der Sender schon');
const lobby = new Room('EMO2', { settings: { mode: 'ffa', bots: 0 } }); const lm = lobby.addMember(mk('L'), { name: 'L' }); lobby.ev.length = 0; lobby.handle(lm, { k: 'emote', id: 'gg' }); assert.equal(lobby.ev.filter(e => e.k === 'emote').length, 0); ok('In der Lobby gibt es keine Emotes');

Date.now = realNow;
console.log(`\n${passed} Emote-Tests bestanden`);
process.exit(0);
