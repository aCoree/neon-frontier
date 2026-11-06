// Tests: Rang-Einteilung (Bronze … Champion, Stufen I–III bis Diamond) und ELO-Formel.
import assert from 'node:assert/strict';
import { TIERS, rankInfo, eloDelta, expected, PLACEMENT_MATCHES } from '../client/js/shared/ranks.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
console.log('Ränge & ELO');
assert.deepEqual(TIERS.map(t => t.name), ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Champion']); ok('Sieben Ränge: Bronze, Silver, Gold, Platinum, Diamond, Master, Champion');
assert.deepEqual(TIERS.map(t => t.divs), [3, 3, 3, 3, 3, 1, 1]); ok('Stufen I–III nur bis Diamond – Master und Champion sind je ein einziger Rang');
const cases = [[0, 'Bronze I'], [99, 'Bronze I'], [100, 'Bronze II'], [299, 'Bronze III'], [300, 'Silver I'], [599, 'Silver III'], [600, 'Gold I'], [900, 'Platinum I'], [1199, 'Platinum III'], [1200, 'Diamond I'], [1499, 'Diamond III'], [1500, 'Master'], [1999, 'Master'], [2000, 'Champion'], [99999, 'Champion']];
for (const [p, l] of cases) assert.equal(rankInfo(p).label, l, p + ' → ' + l); ok('Grenzen stimmen (z. B. 299 = Bronze III, 300 = Silver I, 1500 = Master, 2000 = Champion)');
assert.equal(rankInfo(-5).label, 'Bronze I'); assert.equal(rankInfo(NaN).label, 'Bronze I'); assert.equal(rankInfo('1500').tier, 'Master'); ok('Ungültige Werte fallen auf Bronze I zurück');
assert.equal(rankInfo(150).nextLabel, 'Bronze III'); assert.equal(rankInfo(150).nextAt, 200); assert.equal(rankInfo(250).nextLabel, 'Silver I'); assert.equal(rankInfo(1450).nextLabel, 'Master'); assert.equal(rankInfo(1700).nextLabel, 'Champion'); assert.equal(rankInfo(2500).nextLabel, null); assert.equal(rankInfo(2500).progress, 1); ok('Aufstiegsziel: Stufe → Stufe → nächster Rang → Master → Champion → nichts mehr');
assert.equal(rankInfo(1500).elite, true); assert.equal(rankInfo(1499).elite, false); ok('Master und Champion gelten als Elite');
assert.ok(Math.abs(expected(1000, 1000) - 0.5) < 1e-9); assert.ok(expected(1400, 1000) > 0.9 && expected(1000, 1400) < 0.1); ok('Erwartung: gleich stark = 50 %, 400 Punkte Abstand ≈ 91 %');
assert.equal(eloDelta({ me: 500, opps: [500], score: 1, played: 20 }), 18); assert.equal(eloDelta({ me: 500, opps: [500], score: 0, played: 20 }), -18); assert.equal(eloDelta({ me: 500, opps: [500], score: 0.5, played: 20 }), 0); ok('Gleich stark: Sieg +18, Niederlage −18, Remis 0');
assert.equal(eloDelta({ me: 500, opps: [500], score: 1, played: 0 }), 28); assert.equal(PLACEMENT_MATCHES, 5); assert.equal(eloDelta({ me: 500, opps: [500], score: 1, played: 4 }), 28); assert.equal(eloDelta({ me: 500, opps: [500], score: 1, played: 5 }), 18); ok('Die ersten 5 Matches zählen doppelt (K 56 statt 36)');
const up = eloDelta({ me: 500, opps: [900], score: 1, played: 20 }), down = eloDelta({ me: 900, opps: [500], score: 1, played: 20 }); assert.ok(up > 18 && down < 18 && up > down); ok('Sieg gegen Stärkere bringt mehr (+' + up + ') als gegen Schwächere (+' + down + ')');
const w = eloDelta({ me: 700, opps: [500], score: 1, played: 20 }), l = eloDelta({ me: 500, opps: [700], score: 0, played: 20 }); assert.ok(Math.abs(w + l) <= 1 || w > 0 && l < 0); ok('Wer als Favorit verliert, verliert viel – ein Außenseiter-Verlust kostet wenig');
assert.equal(eloDelta({ me: 500, opps: [], score: 1, played: 20 }), 18); ok('Ohne Gegner-Angaben gilt „gleich stark“');
console.log(`\n${passed} Rang-Tests bestanden`);
