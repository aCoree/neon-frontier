// Backup-Werkzeug für die Konten-Datenbank.
//   npm run backup -- backup [--out datei] [--plain] [--with-sessions] [--keep N]
//   npm run backup -- verify <datei>                      (prüft Entschlüsselung + Prüfsumme, braucht keine Datenbank)
//   npm run backup -- restore <datei> --yes [--wipe]      (spielt ein Backup ein; ohne --wipe nur in eine LEERE Datenbank)
// Umgebungsvariablen: DATABASE_URL (Verbindung), BACKUP_PASSPHRASE (Verschlüsselung; nie als Kommandozeilen-Argument übergeben).
import fs from 'node:fs';
import path from 'node:path';
import { connectPg, migrate } from '../lib/db.js';
import { exportBackup, readBackup, restoreBackup, summarize, isEncrypted } from '../lib/backup.js';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes('--' + n), opt = (n) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : undefined; };
const pass = process.env.BACKUP_PASSPHRASE || '';
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };
const show = (s) => { console.log(`  erstellt: ${s.created}\n  Schema-Versionen: ${s.migrations.join(', ')}\n  Sitzungen enthalten: ${s.sessions ? 'ja' : 'nein'}\n  Zeilen gesamt: ${s.rows}`); for (const [t, n] of Object.entries(s.tables)) console.log(`    ${t}: ${n}`); };

if (!['backup', 'verify', 'restore'].includes(cmd)) {
  console.log('Benutzung:\n  npm run backup -- backup [--out datei] [--plain] [--with-sessions] [--keep N]\n  npm run backup -- verify <datei>\n  npm run backup -- restore <datei> --yes [--wipe]\nUmgebung: DATABASE_URL, BACKUP_PASSPHRASE'); process.exit(cmd ? 1 : 0);
}

if (cmd === 'verify') {
  const f = rest.find(a => !a.startsWith('--')); if (!f) fail('Dateiname fehlt.');
  try { const b = readBackup(fs.readFileSync(f), pass); console.log('✓ Backup ist intakt'); show(summarize(b)); } catch (e) { fail(e.message); }
  process.exit(0);
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL ist nicht gesetzt.');
const db = await connectPg(process.env.DATABASE_URL);
const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '?'; } })();
try {
  if (cmd === 'backup') {
    if (!pass && !flag('plain')) fail('Setze BACKUP_PASSPHRASE (mind. 12 Zeichen) – oder bewusst --plain für ein UNVERSCHLÜSSELTES Backup (enthält Passwort-Hashes!).');
    if (pass && pass.length < 12) fail('BACKUP_PASSPHRASE ist zu kurz (mind. 12 Zeichen).');
    const buf = await exportBackup(db, { passphrase: flag('plain') ? '' : pass, includeSessions: flag('with-sessions') });
    const out = opt('out') || path.join('backups', `neon-frontier-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.nfbackup`);
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf, { mode: 0o600 });
    const back = readBackup(buf, flag('plain') ? '' : pass);   // sofort gegenprüfen
    console.log(`✓ Backup von ${host} geschrieben: ${out} (${(buf.length / 1024).toFixed(1)} KB, ${isEncrypted(buf) ? 'verschlüsselt' : 'UNVERSCHLÜSSELT'})`); show(summarize(back));
    const keep = +opt('keep'); if (keep > 0) {
      const dir = path.dirname(out), files = fs.readdirSync(dir).filter(f => f.endsWith('.nfbackup')).sort().reverse();
      for (const f of files.slice(keep)) { fs.unlinkSync(path.join(dir, f)); console.log('  altes Backup gelöscht:', f); }
    }
  } else {
    const f = rest.find(a => !a.startsWith('--')); if (!f) fail('Dateiname fehlt.');
    if (!flag('yes')) fail(`Sicherheitsabfrage: Das Einspielen ERSETZT die Daten in ${host}. Wirklich? Wiederhole mit --yes.`);
    await migrate(db);
    const buf = fs.readFileSync(f); const pre = readBackup(buf, pass); console.log('Backup geprüft:'); show(summarize(pre));
    console.log(`Spiele in ${host} ein …`); const s = await restoreBackup(db, buf, { passphrase: pass, wipe: flag('wipe') });
    console.log(`✓ Wiederherstellung abgeschlossen (${s.rows} Zeilen, alle Tabellen nachgezählt). Starte den Server neu.`);
  }
} catch (e) { fail(e.message); } finally { await db.close(); }
