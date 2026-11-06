// Datenbank-Zugriff: PostgreSQL über "pg" (Supabase/Render/Neon …). Ohne DATABASE_URL läuft das Spiel im Gast-Modus.
// Für Tests kann ein PGlite-Adapter (echtes Postgres in WASM) übergeben werden – gleiche Schnittstelle.
import { MIGRATIONS } from './schema.js';

export async function connectPg(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: +process.env.DB_POOL || 8, ssl: local ? false : { rejectUnauthorized: false }, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
  pool.on('error', (e) => console.error('[db] Pool-Fehler', e.message));
  return wrap({
    query: (t, p) => pool.query(t, p),
    tx: async (fn) => { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn({ query: (t, p) => c.query(t, p) }); await c.query('COMMIT'); return r; } catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; } finally { c.release(); } },
    close: () => pool.end(),
  });
}

const INT8_AS_TEXT = { parsers: { 20: (v) => v } };
export async function connectPglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  return wrap({
    // Wie das echte "pg": BIGINT (OID 20) kommt als Text zurück – so fallen Typfehler (Zahl vs. Text) schon in den Tests auf
    query: (t, p) => db.query(t, p, INT8_AS_TEXT),
    tx: (fn) => db.transaction((t) => fn({ query: (q, p) => t.query(q, p, INT8_AS_TEXT) })),
    close: () => db.close(),
  });
}

function wrap(d) {
  return {
    ...d,
    async one(t, p) { return (await d.query(t, p)).rows[0] || null; },
    async all(t, p) { return (await d.query(t, p)).rows; },
  };
}

export async function migrate(db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (v INT PRIMARY KEY, name TEXT, applied_at TIMESTAMPTZ DEFAULT now())');
  const done = new Set((await db.all('SELECT v FROM schema_migrations')).map(r => r.v));
  for (const m of MIGRATIONS) {
    if (done.has(m.v)) continue;
    await db.tx(async (t) => { for (const stmt of m.sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await t.query(stmt); await t.query('INSERT INTO schema_migrations (v, name) VALUES ($1,$2)', [m.v, m.name]); });
    console.log(`[db] Migration ${m.v} (${m.name}) angewendet`);
  }
}
