// NEON FRONTIER – Einstiegspunkt des Multiplayer-Servers.
// Umgebungsvariablen:
//   PORT                 (vom Hoster gesetzt, Standard 8080)
//   DATABASE_URL         PostgreSQL-Verbindung (z. B. Supabase). Ohne sie läuft nur der Gast-Modus.
//   OWNER_USERNAME       Benutzername des Besitzers (Standard "Aurelio") – nur dieser Name kann OWNER werden
//   OWNER_REGISTER_CODE  geheimer Code, der zum Registrieren des Besitzer-Kontos nötig ist
//   SERVE_CLIENT=0       Frontend nicht mit ausliefern
import { createApp } from './app.js';
import { connectPg, migrate } from './lib/db.js';

const PORT = +process.env.PORT || 8080;
let db = null;
if (process.env.DATABASE_URL) {
  try { db = await connectPg(process.env.DATABASE_URL); await migrate(db); console.log('[db] verbunden, Schema aktuell'); }
  catch (e) { console.error('[db] Verbindung fehlgeschlagen – starte im Gast-Modus:', e.message); db = null; }
} else console.log('[db] DATABASE_URL nicht gesetzt – Konten sind deaktiviert (Gast-Modus)');

const app = createApp({
  db, serveClient: process.env.SERVE_CLIENT !== '0',
  config: { ownerUsername: process.env.OWNER_USERNAME || 'Aurelio', ownerCode: process.env.OWNER_REGISTER_CODE || '' },
});
const port = await app.start(PORT);
console.log(`NEON FRONTIER Server läuft auf Port ${port}`);
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled', e));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { console.log('Beende …'); try { await app.stop(); if (db) await db.close(); } finally { process.exit(0); } });
