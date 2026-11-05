# Konten, Rang & Admin – Einrichtung (Supabase + Render)

Ohne Datenbank läuft NEON FRONTIER weiter im **Gast-Modus** (wie bisher). Mit `DATABASE_URL` schaltet der Server Konten ein.

## 1. Supabase-Projekt (kostenlos)
1. [supabase.com](https://supabase.com) → **New project** (Region möglichst nah, z. B. Frankfurt). Ein **Datenbank-Passwort** vergeben und notieren.
2. Oben im Projekt auf **Connect** → Reiter **Connection string** → Methode **Session pooler** wählen (wichtig: Render nutzt IPv4, der „Direct connection“-String ist nur IPv6).
3. Die URI kopieren, sie sieht so aus:
   `postgresql://postgres.<projekt>:[DEIN-PASSWORT]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   und `[DEIN-PASSWORT]` durch dein Datenbank-Passwort ersetzen (Sonderzeichen URL-kodieren).
4. Tabellen musst du **nicht** anlegen: der Server erstellt/aktualisiert das Schema beim Start selbst (versionierte Migrationen, siehe `server/lib/schema.js`).

## 2. Umgebungsvariablen bei Render
Im Render-Dashboard → dein Service → **Environment** → hinzufügen (diese Werte gehören **nie** ins Repository / Frontend):

| Variable | Wert |
|---|---|
| `DATABASE_URL` | die Supabase-URI aus Schritt 1 |
| `OWNER_USERNAME` | `Aurelio` (der Name, der Besitzer werden darf) |
| `OWNER_REGISTER_CODE` | ein langes geheimes Passwort, das nur du kennst |

Danach **Manual Deploy → Deploy latest commit**. In den Logs muss stehen: `[db] verbunden, Schema aktuell`.

## 3. Besitzer-Konto anlegen
1. Spiel öffnen → **Anmelden / Registrieren** → Reiter *Registrieren*.
2. Benutzername `Aurelio` eingeben: ein zusätzliches Feld **Besitzer-Code** erscheint → deinen `OWNER_REGISTER_CODE` eintragen, Passwort wählen.
3. Der Name `Aurelio` (und `AurelioZingarello`) ist für alle anderen gesperrt; die Rolle **OWNER** wird ausschließlich serverseitig in der Datenbank gespeichert – der Name im Client spielt für Rechte keine Rolle.
4. Admin-Oberfläche: `https://<dein-server>/admin.html` (bei GitHub Pages: `…/admin.html?server=wss://<dein-server>`), mit dem Besitzer-Konto anmelden.

## 4. Was es gibt
* **Konten:** Registrierung/Login/Logout, scrypt-Passwort-Hash, 30-Tage-Sitzungen (nur der Token-Hash liegt in der DB), Benutzernamen-Regeln (3–16 Zeichen, eindeutig, reservierte und anstößige Namen blockiert), Rate-Limits (Registrierung pro IP, Login pro Konto und IP, Konto-Sperre nach 8 Fehlversuchen).
* **Server-autoritativer Fortschritt:** XP, Level, Rang-Punkte, Kills/Tode/Siege, Münzen werden am Match-Ende **nur vom Server** berechnet und pro Match genau einmal gutgeschrieben (Primärschlüssel `match_id + user_id`). Rang zählt nur in Matches mit mindestens 2 echten Spielern (kein Bot-Farming). Ränge: Bronze, Silver, Gold, Platinum, Diamond, Master.
* **Moderation:** Meldungen (Reports), Stummschalten (serverseitig im Chat), temporäre/dauerhafte Sperren (werden sofort durchgesetzt, auch im laufenden Match), Audit-Log aller Admin-Aktionen, „verdächtige Ereignisse“ (Teleport-/Feuerraten-Verstöße, Login-Fehlversuche) – **nur Protokoll, keine automatischen Sperren**.
* **Rollen:** OWNER > ADMIN > MODERATOR > PLAYER. Moderatoren: Spielersuche, Reports, Sperren bis 7 Tage. Admins: dauerhafte Sperren, Feature-Flags, Wartungsmodus, Audit, Server-Status. Nur der Owner vergibt Rollen. Niemand kann Gleich- oder Höherrangige sperren.
* **Feature-Flags & Wartungsmodus:** serverseitig umschaltbar (`/admin.html` → Server & Features), ohne neuen Build.

* **Inventar & Shop:** Besitz liegt serverseitig (Tabelle `inventory`). Level-Skins werden beim Aufstieg automatisch freigeschaltet, mit Münzen kann man sie früher kaufen (Skins `Level×90`, Waffen-Skins `Level×70`). Kauf läuft in einer Transaktion mit Zeilensperre: kein Doppelkauf, kein negatives Guthaben, auch nicht bei parallelen Anfragen. Im Match zählt immer der **serverseitig ausgerüstete** Skin.
* **Tagesbelohnung:** einmal pro Tag (Serverdatum), 7-Tage-Zyklus (Münzen, XP, am Tag 7 ein zufälliges Cosmetic), Serie bricht bei verpasstem Tag ab. Abschaltbar über die Feature-Flags `dailyRewards` und `shop`.
* **Freunde & Suche:** Spielersuche per Namensanfang (Index, Seitenaufteilung, gesperrte Spieler ausgeblendet), Anfragen senden/annehmen/ablehnen/zurückziehen, gegenseitige Anfragen werden sofort zur Freundschaft, Limits (100 Freunde, 30 offene Anfragen, Rate-Limits). Online-Status stammt aus den echten WebSocket-Verbindungen; ein Freund in einer Lobby zeigt „Beitreten“. Abschaltbar über das Flag `friends`.

* **Seasons:** Jeder Kalendermonat (UTC) ist eine Saison mit eigener Rangliste (Tabelle `season_stats`, Index auf Punkte). Saisonpunkte kommen ausschließlich vom Server aus der Match-Belohnung (XP ÷ 10): volle Punkte nur bei Ranglisten-Matches mit mind. 2 Menschen, sonst 25 % (Bot-Farming lohnt kaum); Abbruch-Matches <30 s geben nichts, dasselbe Match zählt nie doppelt. 8 Belohnungsstufen (Münzen) werden einmalig abgeholt (`season_claims`, Primärschlüssel = keine Doppelauszahlung, Zeilen-Sperre gegen parallele Anfragen). Rangliste: Top 25 ohne gesperrte Spieler, nur Name/Punkte/Siege/Level. API: `GET /api/season`, `POST /api/season/claim`. Abschaltbar über das Flag `seasons`. Alte Saisons bleiben in der Datenbank erhalten; nicht abgeholte Stufen verfallen mit Saisonende.
* **Emotes:** 8 feste Emotes (Taste **B halten + 1–8**, im Spiel auch per Klick), Sprechblase über dem Kopf. Der Server prüft die ID (nur aus der festen Liste), erlaubt nur lebenden Spielern ein Emote und erzwingt 2,5 s Abklingzeit pro Spieler; sie werden wie andere positionsbezogene Events nur an Spieler in 140 m Reichweite gesendet. Stummgeschaltete Spieler werden clientseitig ausgeblendet. Es gibt keinen Freitext, also nichts zu filtern. Abschaltbar über das Flag `emotes`.

* **Echtzeit-Hinweise & Lobby-Einladungen:** Angemeldete Spieler halten im Menü eine leichte „Social“-WebSocket-Verbindung (max. 5 pro Konto, kann keine Räume betreten, Gäste bekommen keine). Darüber kommen in Echtzeit: Freundschaftsanfragen (Karte mit *Annehmen/Ablehnen*), Annahmen und Lobby-Einladungen (*Beitreten/Ablehnen*, läuft nach 45 s ab). Einladen geht nur an **akzeptierte Freunde**, die online sind; der Server prüft Freundschaft, Lobby-Zugehörigkeit, Rate-Limit (30/Min., 3 pro Person/Min.) und Stummschaltung (stumm geschaltete Absender werden still verworfen). In der Freundesliste legt „Einladen“ bei Bedarf automatisch eine private Lobby an; in der Lobby gibt es eine Liste einladbarer Freunde. Im laufenden Match erscheint nur ein kurzer Hinweis ohne Knöpfe (die Maus ist gesperrt).
* **Eigene Dialoge:** Bestätigungen und Eingaben (Kauf, Freund entfernen, Spieler melden, Admin-Sperren) nutzen eigene Spiel-Fenster statt der Browser-Popups.

## 5. Noch nicht gebaut (bewusst)
 Profilbilder, Saison-Abschlussbelohnungen (z. B. Titel für die Top 3). 
**Backups & Analytics:** siehe [BACKUPS.md](BACKUPS.md) – verschlüsselte Backups (Download im Admin-Bereich oder per `npm run backup`), geprüfter Restore, anonyme Tageszähler mit Dashboard.

## 6. Tests
`npm test` führt alles aus: Simulation, `server/test-emotes.js` (10 Emote-Regeltests) und `npm run test:accounts` – 112 Integrationstests (inkl. Analytics-/Backup-API) plus `server/test-backup.js` (23 Tests: Backup-Roundtrip, Manipulation, Rollback, Analytics) gegen echtes Postgres (PGlite): Registrierung, Login-Sperre, Passwort-Hash, Rollen, Sperren, Reports, Mutes, idempotente Belohnungen, Wartungsmodus, Flags, Bann-im-Match, Shop (Doppelkauf/Race Conditions), Ausrüstung, Tagesbelohnung, Freunde/Suche/Online-Status, Seasons (Punkte, Doppelzählung, Abholung, Race Condition, Rangliste).
`node server/tools/dev-pglite.mjs` startet lokal einen Server **mit** Konten (Daten nur im Speicher).
