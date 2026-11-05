// Lokaler Entwicklungsserver MIT Konten, aber ohne externe Datenbank (PGlite = Postgres im Speicher; Daten weg nach Neustart).
// Aufruf: node server/tools/dev-pglite.mjs   (Besitzer-Code zum Testen: dev-owner-code)
import { createApp } from '../app.js';
import { connectPglite, migrate } from '../lib/db.js';
const db = await connectPglite(process.env.PGLITE_DIR); await migrate(db);
const app = createApp({ db, config: { ownerUsername: 'Aurelio', ownerCode: process.env.OWNER_REGISTER_CODE || 'dev-owner-code' } });
console.log('Dev-Server (PGlite) auf Port', await app.start(+process.env.PORT || 8080));
