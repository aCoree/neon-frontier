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

* **Echtzeit-Hinweise:** Angemeldete Spieler halten im Menü eine leichte „Social“-WebSocket-Verbindung (max. 5 pro Konto, kann keine Räume betreten, Gäste bekommen keine). Darüber kommen in Echtzeit Freundschaftsanfragen (Karte mit *Annehmen/Ablehnen*), Annahmen und Party-Einladungen. Im laufenden Match erscheint nur ein kurzer Hinweis ohne Knöpfe (die Maus ist gesperrt). Stumm geschaltete Absender werden still verworfen.
* **Party (wie bei Fortnite):** Der Leiter lädt Freunde ein (Freundesliste → *Party einladen*; die Party entsteht mit der ersten Einladung), max. 4 Spieler, Einladung gilt 60 s. Mitglieder stehen als 3D-Figuren mit Namensschild im Hauptmenü neben dir; das Party-Panel am Profil zeigt Leiter, Online-Status und (für den Leiter) *Befördern* / *Entfernen*. **Betritt der Leiter eine Lobby** (neue oder bestehende, auch öffentliche), kommen alle Mitglieder automatisch mit; der Server prüft dafür, dass der Leiter wirklich in dieser Lobby ist. In Team-Modi teilt der Server die Party in dasselbe Team ein, solange dort Platz ist (z. B. 2 gegen 2: zwei Partymitglieder zusammen, der Rest verteilt). Verlässt der Leiter die Party, wird das nächste Mitglied Leiter; eine Party mit nur einem Spieler löst sich auf. Bei Verbindungsverlust (auch Seite neu laden) bleibt der Platz 30 s reserviert. Der Zustand liegt im Arbeitsspeicher des Servers: ein Server-Neustart löst alle Parties auf.
* **Eigene Dialoge:** Bestätigungen und Eingaben (Kauf, Freund entfernen, Spieler melden, Admin-Sperren) nutzen eigene Spiel-Fenster statt der Browser-Popups.

* **Matchmaking (Match suchen):** Nur mit Konto. Menü → *Match suchen* → Modus wählen (Free for All, Team Deathmatch, 1 gegen 1, 2 gegen 2, 3 gegen 3) → *Suche starten*. Der Server hält pro Modus eine Warteschlange und bringt Spieler nach **Rang** zusammen; das erlaubte Rang-Fenster beträgt 150 Punkte und wächst um 40 pro Wartesekunde. Gestartet wird, sobald die Gruppe voll ist (z. B. 2 bei 1 gegen 1, 8 bei Free for All), mit der Mindestzahl (4 bei Free for All/Team Deathmatch) nach 6 s, und spätestens nach **18 s** – dann mit **Bots als Auffüllung** (das Suchfenster sagt das vorher: „Keine weiteren Spieler – Bots füllen auf“). Eine Party sucht gemeinsam (nur der Leiter startet/bricht ab; die Party muss in die Teamgröße passen, 3er-Party also nicht in 2 gegen 2); ändert sich die Party oder bricht eine Verbindung ab, endet die Suche. Der Server legt einen nicht öffentlichen Raum an, benachrichtigt alle in Echtzeit und startet das Match **automatisch**, sobald alle da sind (Frist 25 s); in diesem Raum kann niemand Einstellungen oder Teams ändern. Abschaltbar über das Flag `matchmaking`. Die Warteschlange liegt im Arbeitsspeicher (Server-Neustart leert sie). Bei sehr wenigen gleichzeitigen Spielern ist ein Match oft Mensch + Bots – das ist gewollt, damit niemand ewig wartet.

* **Profil:** Menü → Name oder *Profil ansehen* (auch aus Freundesliste und Season-Rangliste): getragener Charakter und Waffen-Skin in 3D, Level/XP, **Rang** mit Fortschrittsbalken und allen Stufen (Bronze 0 · Silver 100 · Gold 250 · Platinum 450 · Diamond 700 · Master 1000 Rangpunkte), Statistiken (Matches, Siege, Niederlagen, Siegquote, K/D, Kills, Tode, Kopftreffer, HS-Quote), bei dir selbst die Season. Fremde Profile zeigen **keine Münzen**. **Rangpunkte gibt es nur in Ranked-Matches** (*Spielen → Match suchen → RANKED an*) mit mindestens 2 echten Spielern: Sieg +25 bis +40, Niederlage bis −15. Lockere Matches, Bots, private und offene Lobbys geben XP/Münzen, aber keinen Rang. Ranked kann nur der Server setzen (nicht über Lobby-Einstellungen), Ranked und Locker haben getrennte Warteschlangen.
* **Online-Status:** Ein Freund gilt als online, solange er eine Verbindung zum Server hat (Social-Verbindung im Menü oder Spiel). Wechselt ein Freund den Status, kommt es in Echtzeit (`presence`, Offline mit 4 s Verzögerung, damit ein Seiten-Reload nicht flackert). In *Freunde* zeigt „Echtzeit-Verbindung aktiv“ den eigenen Zustand; ein Sicherheitsnetz im Client stellt die Verbindung alle 8 s wieder her.

* **Karte (Taste M):** Große Karte mit benannten Orten (Neon Heights, Ironworks, Fort Helios, Saltwind Bay, Proving Grounds, Aurora Station, Whisper Forest, Heartland und kleinere wie Nexus Tower, Cyber Bar, Alte Kapelle …), dir und **nur deinen Teammates** – Gegner erscheinen dort nie. Orte anklicken und per Knopf ans Team schreiben („Ich bin in Heartland“, „Gegner in …!“, „Treffpunkt: …“). Team-Nachrichten gehen **serverseitig nur an das eigene Team** (im Chat auch mit `/t Text`); im Free for All gibt es keinen Team-Chat.

## 5. Noch nicht gebaut (bewusst)
 Profilbilder, Saison-Abschlussbelohnungen (z. B. Titel für die Top 3). 
**Backups & Analytics:** siehe [BACKUPS.md](BACKUPS.md) – verschlüsselte Backups (Download im Admin-Bereich oder per `npm run backup`), geprüfter Restore, anonyme Tageszähler mit Dashboard.

## 6. Tests
`npm test` führt alles aus: Simulation, `server/test-emotes.js` (10 Emote-Regeltests) und `npm run test:accounts` – 140 Integrationstests (inkl. Analytics-/Backup-API) plus `server/test-backup.js` (23 Tests: Backup-Roundtrip, Manipulation, Rollback, Analytics) gegen echtes Postgres (PGlite): Registrierung, Login-Sperre, Passwort-Hash, Rollen, Sperren, Reports, Mutes, idempotente Belohnungen, Wartungsmodus, Flags, Bann-im-Match, Shop (Doppelkauf/Race Conditions), Ausrüstung, Tagesbelohnung, Freunde/Suche/Online-Status, Seasons (Punkte, Doppelzählung, Abholung, Race Condition, Rangliste).
`node server/tools/dev-pglite.mjs` startet lokal einen Server **mit** Konten (Daten nur im Speicher).


## 7. Fehlersuche: „Freund wird nicht als online angezeigt“ / „keine Einladungen“
1. **Version prüfen:** Im Hauptmenü steht unten links *Build … · Server …*. Sind beide **gleich**, ist alles aktuell. Steht der Server-Wert nicht da oder ist er älter (gelb markiert), läuft auf Render noch eine alte Version: Render → *Manual Deploy → Deploy latest commit*; im Browser *Strg+Shift+R* (Mac: *Cmd+Shift+R*).
2. **Direkt prüfen:** `https://<dein-service>.onrender.com/health` muss `"build"` enthalten (ohne dieses Feld ist der Server veraltet). `"social"` zeigt, wie viele Spieler gerade verbunden sind.
3. **Beide Spieler** müssen angemeldet sein und das Spiel muss **in beiden Browsern offen** sein (Online-Status gibt es nur für geöffnete Spiele). Mit *Freunde* → „Echtzeit-Verbindung aktiv“ (grüner Punkt) siehst du, ob deine Verbindung steht.
4. Zwei Konten im **selben Browser-Profil** teilen sich die Anmeldung – für den Test ein zweites Profil/Inkognito-Fenster oder zweites Gerät nutzen.
5. Render Free schläft nach ~15 min ohne Besucher; der erste Aufruf braucht bis zu 60 s. Das Spiel verbindet sich danach automatisch nach.
