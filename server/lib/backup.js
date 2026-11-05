// Backup & Restore der kompletten Datenbank – ohne pg_dump, funktioniert mit Supabase/Render/PGlite.
// Format: gzip(NDJSON) mit Kopfzeile (Tabellen + Zeilenzahlen) und Prüfsummen-Endzeile; optional AES-256-GCM-verschlüsselt (Schlüssel per scrypt aus einer Passphrase).
// Alle Werte werden als Text exportiert und beim Import wieder in den Spaltentyp gecastet → verlustfrei (BIGINT, Zeitstempel mit Mikrosekunden, DATE …).
// ACHTUNG: Ein Backup enthält Passwort-Hashes. Unverschlüsselte Backups gehören nie in ein öffentliches Repository.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const MAGIC_ENC = Buffer.from('NFBKENC1'), FORMAT = 1;
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const SKIP = new Set(['schema_migrations']);

async function listTables(db) {
  const tabs = (await db.all("SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).map(r => r.t).filter(t => !SKIP.has(t));
  const fks = await db.all("SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND n.nspname='public'");
  const deps = new Map(tabs.map(t => [t, new Set()])); for (const f of fks) if (f.child !== f.parent && deps.has(f.child) && deps.has(f.parent)) deps.get(f.child).add(f.parent);
  const out = [], done = new Set();   // Eltern vor Kindern (topologisch)
  while (out.length < tabs.length) {
    const next = tabs.filter(t => !done.has(t) && [...deps.get(t)].every(p => done.has(p)));
    if (!next.length) { for (const t of tabs) if (!done.has(t)) { out.push(t); done.add(t); } break; }
    for (const t of next) { out.push(t); done.add(t); }
  }
  return out;
}
async function columns(db, table) {
  return db.all("SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid = ($1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum", [q(table)]);
}
async function migrationVersions(db) { try { return (await db.all('SELECT v FROM schema_migrations ORDER BY v')).map(r => r.v); } catch { return []; } }

function encrypt(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC_ENC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, pass) {
  if (!pass) throw new Error('Das Backup ist verschlüsselt – BACKUP_PASSPHRASE fehlt.');
  const salt = buf.subarray(8, 24), iv = buf.subarray(24, 36), tag = buf.subarray(36, 52), key = crypto.scryptSync(pass, salt, 32);
  try { const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(buf.subarray(52)), d.final()]); }
  catch { throw new Error('Entschlüsselung fehlgeschlagen: falsche Passphrase oder die Datei wurde verändert/beschädigt.'); }
}
export const isEncrypted = (buf) => buf.length > 8 && buf.subarray(0, 8).equals(MAGIC_ENC);

// → Buffer. opts: { passphrase, includeSessions=false }
export async function exportBackup(db, { passphrase = '', includeSessions = false } = {}) {
  const tables = (await listTables(db)).filter(t => includeSessions || t !== 'sessions');
  const lines = [], counts = {}, hash = crypto.createHash('sha256');
  const rowsOf = {};
  await db.tx(async (t) => {   // eine Transaktion → konsistenter Schnappschuss über alle Tabellen
    for (const tb of tables) {
      const cols = await columns({ all: async (s, p) => (await t.query(s, p)).rows }, tb);
      const sel = cols.map(c => `${q(c.name)}::text AS ${q(c.name)}`).join(', ');
      const rows = (await t.query(`SELECT ${sel} FROM ${q(tb)}`)).rows;
      counts[tb] = rows.length; rowsOf[tb] = { cols, rows };
    }
  });
  const head = JSON.stringify({ nf_backup: FORMAT, created: new Date().toISOString(), migrations: await migrationVersions(db), tables: counts, sessions: includeSessions });
  lines.push(head);
  for (const tb of tables) { const { cols, rows } = rowsOf[tb]; lines.push(JSON.stringify({ t: tb, c: cols.map(c => c.name) })); for (const r of rows) lines.push(JSON.stringify({ t: tb, r: cols.map(c => r[c.name]) })); }
  for (const l of lines) hash.update(l + '\n');
  lines.push(JSON.stringify({ end: true, sha256: hash.digest('hex') }));
  const gz = zlib.gzipSync(Buffer.from(lines.join('\n') + '\n'));
  return passphrase ? encrypt(gz, passphrase) : gz;
}

// Liest und prüft ein Backup (Entschlüsselung, gzip, Prüfsumme, Zeilenzahlen). → { head, tables: { name: { cols, rows } } }
export function readBackup(buf, passphrase = '') {
  let data = buf; if (isEncrypted(buf)) data = decrypt(buf, passphrase);
  let text; try { text = zlib.gunzipSync(data).toString('utf8'); } catch { throw new Error('Datei ist kein gültiges Backup (oder beschädigt).'); }
  const lines = text.split('\n').filter(Boolean); if (lines.length < 2) throw new Error('Backup ist leer.');
  let head, end; try { head = JSON.parse(lines[0]); end = JSON.parse(lines[lines.length - 1]); } catch { throw new Error('Backup-Format ungültig.'); }
  if (head.nf_backup !== FORMAT) throw new Error('Unbekannte Backup-Version: ' + head.nf_backup);
  if (!end.end) throw new Error('Backup ist unvollständig (Endmarke fehlt).');
  const h = crypto.createHash('sha256'); for (let i = 0; i < lines.length - 1; i++) h.update(lines[i] + '\n');
  if (h.digest('hex') !== end.sha256) throw new Error('Prüfsumme stimmt nicht – Backup ist beschädigt oder manipuliert.');
  const tables = {};
  for (let i = 1; i < lines.length - 1; i++) { const o = JSON.parse(lines[i]); if (o.c) tables[o.t] = { cols: o.c, rows: [] }; else tables[o.t].rows.push(o.r); }
  for (const [t, n] of Object.entries(head.tables)) if ((tables[t]?.rows.length ?? -1) !== n) throw new Error(`Backup inkonsistent: Tabelle ${t} hat ${tables[t]?.rows.length} statt ${n} Zeilen.`);
  return { head, tables };
}

export const summarize = (b) => ({ created: b.head.created, migrations: b.head.migrations, sessions: !!b.head.sessions, tables: b.head.tables, rows: Object.values(b.head.tables).reduce((a, n) => a + n, 0) });

// Spielt ein Backup in eine (bereits migrierte) Datenbank ein. Alles in EINER Transaktion: bei jedem Fehler bleibt die Datenbank unverändert.
// Ohne wipe:true wird nur in eine leere Datenbank (keine Benutzer) eingespielt.
export async function restoreBackup(db, buf, { passphrase = '', wipe = false } = {}) {
  const b = readBackup(buf, passphrase);
  const have = await migrationVersions(db), need = Math.max(0, ...b.head.migrations);
  if (Math.max(0, ...have) < need) throw new Error(`Die Datenbank hat Schema-Version ${Math.max(0, ...have)}, das Backup braucht ${need}. Bitte zuerst den Server mit der neuesten Version starten (Migrationen).`);
  const existing = await listTables(db), unknown = Object.keys(b.tables).filter(t => !existing.includes(t));
  if (unknown.length) throw new Error('Tabellen im Backup fehlen in der Datenbank: ' + unknown.join(', '));
  const users = Number((await db.one('SELECT COUNT(*) AS n FROM users')).n);
  if (users > 0 && !wipe) throw new Error(`Die Ziel-Datenbank enthält schon ${users} Benutzer. Zum Überschreiben ausdrücklich wipe/--wipe angeben.`);
  const order = (await listTables(db)).filter(t => b.tables[t]);
  await db.tx(async (t) => {
    await t.query(`TRUNCATE ${order.map(q).join(', ')} RESTART IDENTITY CASCADE`);
    for (const tb of order) {
      const meta = new Map((await t.query("SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid = ($1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''", [q(tb)])).rows.map(r => [r.name, r.type]));
      const { cols, rows } = b.tables[tb]; if (!rows.length) continue;
      for (const c of cols) if (!meta.has(c)) throw new Error(`Spalte ${tb}.${c} gibt es in der Datenbank nicht.`);
      const sql = `INSERT INTO ${q(tb)} (${cols.map(q).join(',')}) VALUES (${cols.map((c, i) => `$${i + 1}::${meta.get(c)}`).join(',')})`;
      for (const r of rows) await t.query(sql, r);
    }
    for (const tb of order) {   // Zähler (BIGSERIAL) hinter die höchsten vorhandenen IDs setzen
      for (const c of (await t.query("SELECT a.attname AS name FROM pg_attribute a WHERE a.attrelid = ($1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND pg_get_serial_sequence($1::text, a.attname::text) IS NOT NULL", [q(tb)])).rows) {
        const seq = (await t.query('SELECT pg_get_serial_sequence($1::text, $2::text) AS s', [q(tb), c.name])).rows[0].s;
        await t.query(`SELECT setval($1, COALESCE((SELECT MAX(${q(c.name)}) FROM ${q(tb)}), 0) + 1, false)`, [seq]);
      }
    }
    for (const tb of order) { const n = Number((await t.query(`SELECT COUNT(*) AS n FROM ${q(tb)}`)).rows[0].n); if (n !== b.head.tables[tb]) throw new Error(`Kontrolle fehlgeschlagen: ${tb} hat ${n} statt ${b.head.tables[tb]} Zeilen – nichts wurde verändert.`); }
  });
  return summarize(b);
}
