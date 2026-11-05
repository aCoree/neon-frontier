# Backups & Analytics

## Warum Backups?
Im kostenlosen Supabase-Plan gibt es **keine** Wiederherstellungs-Backups. Gehen Konten oder Fortschritte verloren (Fehlbedienung, kaputtes Update, gelöschtes Projekt), sind sie weg. Deshalb bringt NEON FRONTIER eigene Backup-Werkzeuge mit.

Ein Backup enthält **alles aus der Datenbank** (Konten, Passwort-Hashes, Fortschritt, Inventar, Freundschaften, Seasons, Meldungen, Audit-Log, Analytics-Zähler). Sitzungen (angemeldet bleiben) sind standardmäßig **nicht** enthalten – nach einem Restore melden sich Spieler einfach neu an.

## Weg A – per Klick im Admin-Bereich (einfachster Weg)
1. Render → dein Dienst → **Environment** → Variable `BACKUP_PASSPHRASE` anlegen (mind. 12 Zeichen, z. B. ein langer Satz). **Merke sie dir gut** – sie steht nirgends sonst, ohne sie ist das Backup unlesbar. Speichern, Render startet neu.
2. `https://<dein-frontend>/admin.html` öffnen (ggf. `?server=wss://<dein-render-server>` anhängen), als Besitzer anmelden.
3. Tab **Backup** → **Verschlüsseltes Backup herunterladen**. Es entsteht eine Datei `neon-frontier-<Datum>.nfbackup` (AES-256-verschlüsselt, mit Prüfsumme).
4. Datei an einem sicheren Ort aufbewahren (z. B. verschlüsselte Cloud, USB-Stick) – **nie in ein öffentliches GitHub-Repository**. Der Ordner `backups/` und `*.nfbackup` sind in `.gitignore` eingetragen.

Nur der **Besitzer** darf das (Server prüft die Rolle), max. 4 Downloads pro Stunde, jeder Download steht im Audit-Log. Ohne gesetzte `BACKUP_PASSPHRASE` gibt es bewusst **keinen** Download.

## Weg B – per Kommandozeile (lokal auf deinem Rechner)
Voraussetzung: Node.js, Projekt-Ordner, `npm install`. `DATABASE_URL` ist dieselbe wie bei Render (Supabase *Session pooler*).

```bash
export DATABASE_URL='postgresql://…'
export BACKUP_PASSPHRASE='dein langer geheimer satz'
npm run backup -- backup --keep 10
```
Das legt `backups/neon-frontier-<Zeitstempel>.nfbackup` an, prüft die Datei sofort gegen und löscht ältere Backups bis auf die letzten 10. Weitere Optionen: `--out datei`, `--with-sessions`, `--plain` (unverschlüsselt, nur für Tests – enthält Passwort-Hashes!).

**Backup prüfen** (braucht keine Datenbank, nur die Datei und die Passphrase):
```bash
npm run backup -- verify backups/neon-frontier-….nfbackup
```
Ausgabe: „Backup ist intakt“ + Zeilenzahl je Tabelle. Falsche Passphrase, beschädigte oder manipulierte Dateien werden erkannt.

## Wiederherstellen (Restore)
> Das ersetzt die Daten der Ziel-Datenbank. Übe es **vorher einmal** mit einem zweiten, leeren Supabase-Projekt – ein Backup, das nie getestet wurde, ist keins.

1. Ziel-Datenbank wählen (neues Supabase-Projekt oder das bestehende) und `DATABASE_URL` darauf setzen.
2. In eine **leere** Datenbank:
   ```bash
   npm run backup -- restore backups/neon-frontier-….nfbackup --yes
   ```
   In eine Datenbank mit vorhandenen Daten (überschreibt sie komplett):
   ```bash
   npm run backup -- restore backups/neon-frontier-….nfbackup --yes --wipe
   ```
3. Das Werkzeug legt zuerst das Schema an, prüft das Backup, spielt alles in **einer Transaktion** ein (bei einem Fehler bleibt die Datenbank unverändert) und zählt am Ende jede Tabelle nach.
4. Render-Dienst neu starten (und bei einem neuen Projekt `DATABASE_URL` anpassen).

Schutz: Ein Backup aus einer **neueren** Schema-Version wird nicht in eine ältere Datenbank eingespielt (erst den Server aktualisieren).

## Empfohlener Rhythmus
Wöchentlich ein Backup und vor jedem größeren Update eines. Die letzten 5–10 aufbewahren.

## Grenzen (ehrlich)
* Das Backup wird im Speicher aufgebaut. Für die Größenordnung dieses Spiels (Konten + Statistiken, wenige MB) ist das unkritisch; bei Millionen Zeilen solltest du stattdessen `pg_dump` nutzen. An großen Datenmengen wurde es **nicht** getestet.
* Wiederhergestellt wird der Stand zum Backup-Zeitpunkt – alles danach ist weg. Es gibt kein automatisches, zeitgesteuertes Backup (Render Free hat keinen dauerhaften Speicher, und ein GitHub-Action-Artefakt wäre in einem öffentlichen Repo öffentlich).
* Getestet wurde mit PGlite (echtes Postgres als WASM) im Roundtrip; gegen ein echtes Supabase noch nicht – daher der Probe-Restore oben.

---

# Analytics

Datensparsam und anonym: Der Server zählt nur **Tageszähler** in der Tabelle `analytics_daily` (Spalten: Tag, Kennzahl, Dimension, Wert). Es werden **keine Spieler-IDs, keine IP-Adressen, keine Cookies, keine Browser-Kennungen** gespeichert; der Browser sendet nichts. Zähler werden im Speicher gesammelt und alle 30 s gebündelt geschrieben; Tage rechnen in UTC; Daten älter als 400 Tage werden automatisch gelöscht.

| Kennzahl | Dimension | Bedeutung |
|---|---|---|
| `register`, `login`, `login_fail` | – | Registrierungen, erfolgreiche und fehlgeschlagene Anmeldungen |
| `match_end`, `match_secs`, `match_humans` | Spielmodus | Matches, Spielsekunden, Menschen (Summe) – daraus ergeben sich Beliebtheit und Dauer je Modus |
| `purchase` | skin / wskin | Käufe im Shop |
| `daily_claim`, `season_claim` | – | abgeholte Tages-/Season-Belohnungen |
| `emote` | Emote-ID | genutzte Emotes |
| `report`, `ban` | – / permanent, temporary | Meldungen, Sperren |
| `peak_players`, `peak_rooms` | – | Tagesspitze gleichzeitiger Spieler/Räume (Maximum, nicht Summe) |

Dazu zeigt das Dashboard Gesamtzahlen **aus den echten Daten** (Konten, Neuregistrierungen, Logins 24 h/7 Tage, Matches gesamt).

Ansehen: `admin.html` → **Analytics** (Admins und Besitzer; Zeitraum 7/14/30/90 Tage). Abschaltbar im Tab *Server & Features* über das Flag `analytics` (dann wird nichts mehr gezählt).

Hinweise: „Logins 24 h/7 Tage“ beruht auf dem Zeitpunkt der letzten **Anmeldung** (wer eingeloggt bleibt, ohne sich neu anzumelden, zählt nicht). Ein Zähler kann ein paar Sekunden nachhinken, und ein Server-Neustart verliert höchstens die Zähler der letzten ≤30 s (beim ordentlichen Beenden wird noch geschrieben).
