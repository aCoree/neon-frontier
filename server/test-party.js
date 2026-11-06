// Tests der Party-Logik (ohne Netzwerk) und der Team-Zuteilung für Parties.
import assert from 'node:assert/strict';
import { Parties, MAX_PARTY } from './lib/party.js';
import { Room } from '../client/js/shared/sim/room.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let clock = 1_000_000; const inbox = new Map(), offline = new Set();
const mk = (o = {}) => { inbox.clear(); offline.clear(); return new Parties({ send: (id, m) => { if (offline.has(id)) return false; (inbox.get(id) || inbox.set(id, []).get(id)).push(m); return true; }, isOnline: (id) => !offline.has(id), now: () => clock, graceMs: 40, ...o }); };
const last = (id, k) => [...(inbox.get(id) || [])].reverse().find(m => m.k === k);
const all = (id, k) => (inbox.get(id) || []).filter(m => m.k === k);
const reg = (P, id, name) => P.touch(id, { name, level: id, skin: 'ember', wskin: 'default' });
const setup = (n = 4) => { const P = mk(); for (let i = 1; i <= n; i++) reg(P, i, 'P' + i); inbox.clear(); return P; };

console.log('Party-Logik');
{ const P = setup(); const r = P.invite(1, { id: 2, name: 'P2' }); assert.ok(r.ok); assert.equal(last(2, 'party_invite').from, 'P1'); assert.equal(last(1, 'party').party.members.length, 1); assert.equal(last(1, 'party').party.isLeader, true); ok('Einladung: Empfänger bekommt sie, Leiter sieht seine neue Party'); }
{ const P = setup(); offline.add(2); assert.match(P.invite(1, { id: 2, name: 'P2' }).error, /offline/); assert.equal(P.partyIdOf(1), 0); assert.match(P.invite(1, { id: 1, name: 'P1' }).error, /selbst/); ok('Offline-Ziel oder man selbst: Fehler, und es entsteht keine leere Party'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); assert.ok(P.accept(2, 'P1').ok); const a = last(1, 'party').party, b = last(2, 'party').party; assert.equal(a.members.length, 2); assert.equal(a.isLeader, true); assert.equal(b.isLeader, false); assert.equal(b.leader, 'P1'); assert.deepEqual(b.members.map(m => m.you), [false, true]); assert.ok(last(1, 'party_event').text.includes('P2')); ok('Annehmen: beide sehen dieselbe Party (Leiter-Markierung pro Empfänger), Leiter bekommt Hinweis'); }
{ const P = setup(); assert.match(P.accept(2, 'P1').error, /abgelaufen/); P.invite(1, { id: 2, name: 'P2' }); clock += 61000; assert.match(P.accept(2, 'P1').error, /abgelaufen/); clock += 0; ok('Ohne oder mit abgelaufener Einladung kann niemand beitreten'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); assert.match(P.invite(2, { id: 3, name: 'P3' }).error, /Leiter/); assert.match(P.invite(1, { id: 2, name: 'P2' }).error, /schon in deiner Party/); ok('Nur der Leiter lädt ein; Mitglieder lassen sich nicht doppelt einladen'); }
{ const P = setup(6); for (const i of [2, 3, 4]) { P.invite(1, { id: i, name: 'P' + i }); } assert.match(P.invite(1, { id: 5, name: 'P5' }).error, /voll/); for (const i of [2, 3, 4]) P.accept(i, 'P1'); assert.equal(P.get(1).members.length, MAX_PARTY); assert.match(P.invite(1, { id: 5, name: 'P5' }).error, /voll/); ok('Höchstens 4 Spieler – auch offene Einladungen zählen mit'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.invite(1, { id: 3, name: 'P3' }); assert.match(P.invite(1, { id: 2, name: 'P2' }).error, /gerade erst/); P.decline(2, 'P1'); assert.ok(last(1, 'party_event').text.includes('abgelehnt')); assert.match(P.accept(2, 'P1').error, /abgelaufen/); ok('Doppel-Einladung wird gebremst, Ablehnen benachrichtigt den Leiter und entwertet die Einladung'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); P.invite(1, { id: 3, name: 'P3' }); P.accept(3, 'P1'); inbox.clear(); P.leave(1); assert.equal(P.get(2).leader, 2); assert.equal(last(2, 'party').party.isLeader, true); assert.equal(last(1, 'party').party, null); assert.ok(all(3, 'party_event').some(e => e.text.includes('Party-Leiter'))); ok('Leiter geht: nächstes Mitglied wird Leiter, Verlassender bekommt „keine Party“'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); inbox.clear(); P.leave(2); assert.equal(P.partyIdOf(1), 0); assert.equal(last(1, 'party').party, null); assert.equal(P.parties.size, 0); ok('Party mit nur einem Spieler wird aufgelöst'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); P.invite(1, { id: 3, name: 'P3' }); P.accept(3, 'P1'); assert.match(P.kick(2, 'P3').error, /Leiter/); assert.match(P.promote(3, 'P2').error, /Leiter/); assert.match(P.kick(1, 'P1').error, /Ungültig/); assert.match(P.kick(1, 'Unbekannt').error, /Ungültig/); ok('Entfernen/Befördern nur durch den Leiter und nur für andere Mitglieder');
  assert.ok(P.kick(1, 'p3').ok); assert.equal(P.partyIdOf(3), 0); assert.ok(last(3, 'party_event').text.includes('entfernt')); assert.ok(P.promote(1, 'P2').ok); assert.equal(P.get(2).leader, 2); ok('Kick und Beförderung funktionieren (Namen ohne Groß-/Kleinschreibung)'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); P.invite(1, { id: 3, name: 'P3' }); P.accept(3, 'P1'); offline.add(3); inbox.clear();
  assert.deepEqual([P.follow(1, 'ABCD').notified, last(2, 'party_join')?.code, last(3, 'party_join')], [1, 'ABCD', undefined]); assert.match(P.follow(2, 'ABCD').error, /Leiter/); ok('Folgen: nur der Leiter, nur erreichbare Mitglieder bekommen die Lobby'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); P.invite(3, { id: 4, name: 'P4' }); P.accept(4, 'P3'); inbox.clear(); P.invite(1, { id: 3, name: 'P3' }); P.accept(3, 'P1'); assert.equal(P.get(3).id, P.get(1).id); assert.equal(P.get(4), null); assert.equal(last(4, 'party').party, null); ok('Beitritt zu einer anderen Party verlässt die alte automatisch'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.accept(2, 'P1'); P.drop(2); assert.equal(last(1, 'party').party.members[1].online, false); await sleep(15); reg(P, 2, 'P2'); await sleep(60); assert.equal(P.partyIdOf(2) > 0, true); assert.equal(last(1, 'party').party.members[1].online, true); ok('Kurzer Verbindungsabbruch (z. B. Seite neu laden) wirft niemanden aus der Party');
  P.drop(2); await sleep(80); assert.equal(P.partyIdOf(2), 0); assert.equal(P.partyIdOf(1), 0); assert.ok(all(1, 'party_event').some(e => e.text.includes('aufgelöst'))); ok('Nach 30 s (hier 40 ms) ohne Verbindung verlässt der Spieler die Party'); }
{ const P = setup(); P.invite(1, { id: 2, name: 'P2' }); P.invite(1, { id: 3, name: 'P3' }); assert.equal(P.pending.size, 2); clock += 61000; P.prune(); assert.equal(P.pending.size, 0); ok('Abgelaufene Einladungen werden aufgeräumt'); }

console.log('Teams');
const mkClient = () => ({ send() {} });
const roomOf = (mode, ps) => { const r = new Room('PT', { settings: { mode, bots: 0 } }); const ms = ps.map((p, i) => r.addMember(mkClient(), { name: 'S' + i, party: p })); return { r, ms }; };
{ const { r, ms } = roomOf('tdm', [7, 0, 7, 0, 7, 0]); r.autoAssign(); const t7 = new Set(ms.filter(m => m.party === 7).map(m => m.team)); assert.equal(t7.size, 1); assert.ok(ms.every(m => m.team >= 0)); ok('Team Deathmatch: Mitglieder derselben Party landen im selben Team'); }
{ const { r, ms } = roomOf('v2', [5, 5, 5, 0]); r.autoAssign(); const c = [0, 1].map(t => ms.filter(m => m.team === t).length); assert.deepEqual(c, [2, 2]); assert.equal(ms[0].team, ms[1].team); ok('2 gegen 2: Party hält zusammen, Überhang wird ins andere Team verteilt (Teamgröße bleibt 2)'); }
{ const { r, ms } = roomOf('v222', [3, 3, 4, 4, 0, 0]); r.autoAssign(); assert.equal(ms[0].team, ms[1].team); assert.equal(ms[2].team, ms[3].team); assert.notEqual(ms[0].team, ms[2].team); ok('3 Teams: zwei Parties bleiben jeweils zusammen und getrennt voneinander'); }
{ const { r, ms } = roomOf('tdm', [0, 0, 0, 0]); r.autoAssign(); assert.equal(ms.filter(m => m.team === 0).length, 2); ok('Ohne Party bleibt die ausgeglichene Zuteilung'); }

console.log('Team-Chat & Ranked');
{ const got = { a: [], b: [], c: [] }, mkc = (k) => ({ send(o, raw) { const x = raw ? JSON.parse(o) : o; if (x.k === 'chat' || x.k === 'toast') got[k].push(x); } });
  const r = new Room('TC', { settings: { mode: 'tdm', bots: 0 } }); const a = r.addMember(mkc('a'), { name: 'A' }), b = r.addMember(mkc('b'), { name: 'B' }), c = r.addMember(mkc('c'), { name: 'C' });
  a.team = 0; b.team = 0; c.team = 1; for (const k of Object.keys(got)) got[k].length = 0;
  r.handle(a, { k: 'chat', text: 'Ich bin in Heartland', scope: 'team' }); assert.equal(got.a.length, 1); assert.equal(got.b.length, 1); assert.equal(got.c.length, 0); assert.equal(got.b[0].scope, 'team'); ok('Team-Chat: Teammates bekommen die Nachricht, der Gegner nicht');
  r.handle(a, { k: 'chat', text: 'hallo alle' }); assert.equal(got.c.length, 1); ok('Normaler Chat geht weiterhin an alle');
  const f = new Room('FF', { settings: { mode: 'ffa', bots: 0 } }); const x = f.addMember(mkc('a'), { name: 'X' }), y = f.addMember(mkc('b'), { name: 'Y' }); got.a.length = got.b.length = 0; f.handle(x, { k: 'chat', text: 'hi', scope: 'team' }); assert.equal(got.b.length, 0); assert.equal(got.a[0].k, 'toast'); ok('Im Free for All gibt es keinen Team-Chat (kein Leck an alle)'); }
{ assert.equal(new Room('R1', { settings: { ranked: true } }).settings.ranked, false); assert.equal(new Room('R2', { settings: { mode: 'duel' }, ranked: true }).settings.ranked, true); ok('Ranked kann nicht über Raum-Einstellungen gefälscht werden – nur der Server setzt es'); }
{ let res = null; for (const ranked of [false, true]) { const r = new Room('RK', { settings: { mode: 'ffa', bots: 0 }, ranked, hooks: { matchEnd: (_r, _id, results) => { res = results; } } }); r.addMember(mkClient(), { name: 'U1', userId: 1 }); r.addMember(mkClient(), { name: 'U2', userId: 2 }); r.start(); r.state = 'playing'; r.endMatch(); assert.equal(res.length, 2); assert.ok(res.every(x => x.ranked === ranked)); } ok('Match-Ergebnis meldet „ranked“ nur für Ranked-Räume (sonst gibt es keine Rangpunkte)'); }
{ let res = null; const r = new Room('RB', { settings: { mode: 'duel', bots: 0 }, ranked: true, hooks: { matchEnd: (_r, _id, results) => { res = results; } } }); r.addMember(mkClient(), { name: 'U1', userId: 1 }); r.start(); r.state = 'playing'; assert.ok([...r.ents.values()].some(e => e.isBot)); r.endMatch(); assert.equal(res[0].ranked, false); ok('Selbst im Ranked-Raum zählt das Match nicht als Ranked, sobald Bots mitspielen (Absicherung im Server)'); }

console.log(`\n${passed} Party-Tests bestanden`); process.exit(0);
