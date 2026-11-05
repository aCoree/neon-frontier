// Tests für Backup/Restore (Roundtrip gegen echtes Postgres via PGlite) und die Analytics-Zähler.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { connectPglite, migrate } from './lib/db.js';
import { exportBackup, readBackup, restoreBackup, isEncrypted } from './lib/backup.js';
import { Analytics } from './lib/analytics.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ✓', n); };
const PASS = 'ein-sehr-geheimes-passwort-123';
const fresh = async () => { const d = await connectPglite(); const log = console.log; console.log = () => {}; await migrate(d); console.log = log; return d; };
const snapshot = async (db) => {   // alle Tabellen als sortierter Text → exakter Vergleich
  const out = {}; for (const t of (await db.all("SELECT relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND relname NOT IN ('schema_migrations','sessions') ORDER BY 1")).map(r => r.t)) out[t] = (await db.all(`SELECT t::text AS x FROM "${t}" t`)).map(r => r.x).sort();
  return out;
};

console.log('Backup & Restore');
const A = await fresh();
const u1 = (await A.one("INSERT INTO users (username, username_lower, password_hash, role) VALUES ($1,$2,'scrypt$x$y','PLAYER') RETURNING id", ['Zoë "Q" 🎮', 'zoë "q" 🎮'])).id;
const u2 = (await A.one("INSERT INTO users (username, username_lower, password_hash, role, ban_reason) VALUES ('Bob','bob','scrypt$a$b','OWNER', $1) RETURNING id", ["Zeile1\nZeile2 ' -- ; DROP TABLE users;"])).id;
for (const id of [u1, u2]) await A.query('INSERT INTO user_stats (user_id, xp, level, currency, kills) VALUES ($1, 123456789012, 7, 42, 9)', [id]);
await A.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, 'h1', now() + interval '1 day')", [u1]);
await A.query("INSERT INTO inventory (user_id, item_id) VALUES ($1,'skin:vanguard'), ($1,'wskin:default')", [u1]);
await A.query("INSERT INTO daily_rewards (user_id, last_claim, streak) VALUES ($1, DATE '2026-11-05', 3)", [u1]);
await A.query("INSERT INTO friendships (requester, addressee, status) VALUES ($1,$2,'accepted')", [u1, u2]);
await A.query("INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1,$2,'Test')", [u1, u2]);
await A.query("INSERT INTO season_stats (season_id, user_id, points) VALUES (202611, $1, 321)", [u1]);
await A.query("INSERT INTO analytics_daily (day, metric, dim, value) VALUES (DATE '2026-11-05','register','',5)");
await A.query("UPDATE users SET last_login = TIMESTAMPTZ '2026-11-05 12:34:56.123456+00' WHERE id=$1", [u1]);
const before = await snapshot(A);

const enc = await exportBackup(A, { passphrase: PASS });
assert.ok(isEncrypted(enc)); assert.ok(!enc.includes(Buffer.from('scrypt$x$y')) && !enc.includes(Buffer.from('Zoë'))); ok('Backup ist verschlüsselt (kein Klartext, keine Hashes lesbar)');
const info = readBackup(enc, PASS); assert.equal(info.head.tables.users, 2); assert.equal(info.head.tables.sessions, undefined); ok('Sitzungen werden standardmäßig nicht gesichert');
assert.equal(readBackup(await exportBackup(A, { passphrase: PASS, includeSessions: true }), PASS).head.tables.sessions, 1); ok('Sitzungen nur auf ausdrücklichen Wunsch');

const B = await fresh();
await B.query('DELETE FROM seasons');   // frisch migrierte DB enthält eine Start-Saison; Restore muss sie ersetzen
const s = await restoreBackup(B, enc, { passphrase: PASS }); assert.ok(s.rows >= 10);
assert.deepEqual(await snapshot(B), before); ok('Roundtrip: ALLE Tabellen sind danach Zeichen für Zeichen identisch');
assert.equal((await B.one("SELECT last_login::text AS t FROM users WHERE id=$1", [u1])).t.includes('12:34:56.123456'), true); assert.equal((await B.one("SELECT last_claim::text AS d FROM daily_rewards")).d, '2026-11-05'); assert.equal((await B.one("SELECT username FROM users WHERE id=$1", [u1])).username, 'Zoë "Q" 🎮'); ok('Mikrosekunden, DATE-Spalten, Unicode und Sonderzeichen bleiben erhalten');
const nid = (await B.one("INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1,$2,'neu') RETURNING id", [u1, u2])).id; assert.ok(Number(nid) > Number((await A.one('SELECT MAX(id) AS m FROM reports')).m)); ok('Zähler (BIGSERIAL) laufen nach dem Restore korrekt weiter');

assert.throws(() => readBackup(enc, 'falsche-passphrase-xyz'), /falsche Passphrase/); assert.throws(() => readBackup(enc, ''), /verschlüsselt/); ok('Falsche/fehlende Passphrase wird abgewiesen');
const tamper = Buffer.from(enc); tamper[tamper.length - 20] ^= 0xff; assert.throws(() => readBackup(tamper, PASS), /verändert|beschädigt/); ok('Manipulierte verschlüsselte Datei wird erkannt (GCM)');
const plain = await exportBackup(A, { passphrase: '' }); assert.ok(!isEncrypted(plain)); readBackup(plain);
const lines = zlib.gunzipSync(plain).toString().split('\n').filter(Boolean);
const rebuild = (ls, fixSum = true) => { const h = crypto.createHash('sha256'); const body = ls.slice(0, -1); for (const l of body) h.update(l + '\n'); return zlib.gzipSync(Buffer.from([...body, JSON.stringify({ end: true, sha256: fixSum ? h.digest('hex') : 'x'.repeat(64) })].join('\n') + '\n')); };
const edited = lines.map(l => l.replace('"Bob"', '"Eve"')); assert.throws(() => readBackup(rebuild(edited, false)), /Prüfsumme/); ok('Geänderter Inhalt ohne passende Prüfsumme wird erkannt');
assert.throws(() => readBackup(plain.subarray(0, plain.length - 30)), /gültiges Backup|beschädigt/); assert.throws(() => readBackup(Buffer.from('kein backup')), /gültiges Backup/); ok('Abgeschnittene/fremde Dateien werden abgewiesen');

const C = await fresh(); await C.query("INSERT INTO users (username, username_lower, password_hash) VALUES ('Alt','alt','h')");
await assert.rejects(restoreBackup(C, enc, { passphrase: PASS }), /enthält schon 1 Benutzer/); assert.equal(Number((await C.one('SELECT COUNT(*) AS n FROM users')).n), 1); ok('Ziel mit vorhandenen Benutzern wird ohne --wipe NICHT überschrieben');
await restoreBackup(C, enc, { passphrase: PASS, wipe: true }); assert.deepEqual(await snapshot(C), before); ok('Mit wipe wird sauber ersetzt');

// Fehler mitten im Einspielen → Rollback, Ziel unverändert
const D = await fresh(); await D.query("INSERT INTO users (username, username_lower, password_hash) VALUES ('Behalten','behalten','h')"); const dBefore = await snapshot(D);
const bad = lines.slice(); const ui = bad.findIndex(l => l.includes('"t":"user_stats"') && l.includes('"r"')); bad.splice(ui, 0, JSON.stringify({ t: 'user_stats', r: bad[ui] && JSON.parse(bad[ui]).r.map((v, i) => (i === 0 ? '99999' : v)) }));
const head = JSON.parse(bad[0]); head.tables.user_stats++; bad[0] = JSON.stringify(head);
await assert.rejects(restoreBackup(D, rebuild(bad), { wipe: true }), /foreign key|violates/i); assert.deepEqual(await snapshot(D), dBefore); ok('Fehler mitten im Restore → Rollback, Datenbank bleibt unverändert');

const E = await fresh(); const fut = await fresh(); await fut.query("INSERT INTO schema_migrations (v, name) VALUES (99, 'zukunft')");
await assert.rejects(restoreBackup(E, await exportBackup(fut, { passphrase: PASS }), { passphrase: PASS }), /Schema-Version/); ok('Backup aus neuerem Schema wird nicht in eine ältere Datenbank eingespielt');

console.log('Analytics');
const T = await fresh(); let on = true, sampled = 0; const an = new Analytics(T, { enabled: () => on, sample: (a) => { sampled++; a.max('peak_players', '', 7); }, log: { error() {} } });
an.inc('match_end', 'ffa'); an.inc('match_end', 'ffa'); an.inc('match_end', 'tdm', 3); an.inc('emote', 'gg'); await an.flush(); an.inc('match_end', 'ffa'); await an.flush();
const rep = await an.report(7); assert.equal(rep.metrics.match_end.total, 6); assert.equal(rep.metrics.match_end.dims.ffa, 3); assert.equal(rep.metrics.match_end.byDay.at(-1), 6); assert.equal(rep.days.length, 7); ok('Zähler werden gebündelt geschrieben und über Flushes addiert');
an.max('peak_players', '', 12); an.max('peak_players', '', 9); await an.flush(); assert.equal((await an.report(3)).metrics.peak_players.total, 12); ok('Spitzenwerte nehmen das Maximum, nicht die Summe');
assert.equal(sampled, 3); ok('Messfunktion (Spieler online) läuft bei jedem Flush');
an.inc("x'; DROP TABLE users;--", 'A B<script>'); an.inc('', 'x'); await an.flush(); const names = (await T.all('SELECT metric, dim FROM analytics_daily')).map(r => r.metric + '|' + r.dim); assert.ok(names.includes('xdroptableusers--|abscript') && !names.some(n => /[ ';<>]/.test(n))); assert.equal(Number((await T.one('SELECT COUNT(*) AS n FROM users')).n), 0); ok('Metrik-/Dimensionsnamen werden bereinigt (keine Sonderzeichen, kein SQL)');
const cap = new Analytics(T, { maxKeys: 5 }); for (let i = 0; i < 50; i++) cap.inc('m', 'd' + i); assert.equal(cap.sums.size, 5); assert.equal(cap.dropped, 45); ok('Anzahl verschiedener Schlüssel ist begrenzt (Schutz vor Speicher-Flut)');
on = false; an.inc('off_metric'); await an.flush(); assert.equal(Number((await T.one("SELECT COUNT(*) AS n FROM analytics_daily WHERE metric='off_metric'")).n), 0); on = true; ok('Feature-Flag „analytics" schaltet das Zählen ab');
const flaky = await fresh(); let boom = true; const realTx = flaky.tx; flaky.tx = (fn) => { if (boom) { boom = false; return Promise.reject(new Error('db weg')); } return realTx(fn); };
const fa = new Analytics(flaky, { log: { error() {} } }); fa.inc('keep', '', 4); await fa.flush(); fa.inc('keep', '', 1); await fa.flush(); assert.equal(Number((await flaky.one("SELECT value FROM analytics_daily WHERE metric='keep'")).value), 5); ok('Fehlgeschlagenes Schreiben verliert keine Zähler (Rückpuffer)');
await T.query("INSERT INTO analytics_daily (day, metric, dim, value) VALUES (DATE '2020-01-01','old','',1)"); assert.ok((await an.prune(400)) >= 1); ok('Alte Tageszähler werden nach 400 Tagen gelöscht');
const cols = (await T.all("SELECT column_name FROM information_schema.columns WHERE table_name='analytics_daily' ORDER BY 1")).map(r => r.column_name); assert.deepEqual(cols, ['day', 'dim', 'metric', 'value']); ok('Datenschutz: Tabelle enthält nur Tag, Metrik, Dimension, Wert – keine Nutzer-ID, keine IP');

console.log(`\n${passed} Backup-/Analytics-Tests bestanden`); process.exit(0);
