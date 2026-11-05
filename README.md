# NEON FRONTIER

Ein 3D-Multiplayer-Shooter für den Browser (Three.js + Node.js/WebSockets) – Third-Person, große Map mit 7 Zonen, 11 Waffen, Gadgets, Bots, Lobby mit Raumcodes und Einladungslink, XP/Skins/Erfolge. **Alle Grafiken, Modelle, Sounds und Musik werden prozedural zur Laufzeit erzeugt – es gibt keine externen Asset-Dateien.**

* **Solo / Training** laufen komplett im Browser (dieselbe Server-Simulation läuft lokal), es wird kein Server benötigt.
* **Multiplayer** läuft über den mitgelieferten Node.js-Server (autoritativ für Leben, Treffer, Projektile, Items, Türen, Kisten, Bots).

---

## 1. Lokal starten (2 Minuten)

Voraussetzung: [Node.js 18+](https://nodejs.org).

```bash
npm install
npm start
```

Dann im Browser **http://localhost:8080** öffnen. Der Server liefert das Spiel gleich mit aus.
Freunde im selben WLAN öffnen `http://<deine-lokale-IP>:8080`. Für Freunde über das Internet siehe Abschnitt 3.

## 2. Steuerung

| Taste | Aktion | Taste | Aktion |
|---|---|---|---|
| W A S D | Bewegen | Maus | Umsehen |
| Linke Maustaste | Schießen | Rechte Maustaste | Zielen / Zoom (Sniper-Visier) |
| Shift | Sprinten | Leertaste | Springen (2× = Doppelsprung, halten = Jetpack) |
| C / Strg | Ducken | Q | Dash / Ausweichen |
| R | Nachladen | 1–5 / Mausrad | Waffe wechseln |
| E | Interagieren (Kisten, Schalter, Geheimnisse) | F | Gadget (Enterhaken, Teleporter, Drohne, Scanner) |
| Z / X | Medkit / Schildtrank | G / H | Granate / Rauchbombe |
| Tab | Punktetafel | Enter | Chat |
| Esc | Pause (Maus freigeben) | | |

## 3. Online bringen – Frontend (GitHub Pages) + Server (Node.js-Hoster)

Das Spiel besteht aus zwei Teilen:

1. **Frontend** = Ordner `client/` (statisch, kein Build-Schritt) → GitHub Pages
2. **Multiplayer-Server** = `server/server.js` (braucht einen Node.js-Host mit WebSocket-Unterstützung)

> Hinweis: Der Server importiert die gemeinsame Spiellogik aus `client/js/shared/…`. Deshalb muss beim Hosting des Servers das **gesamte Repository** vorhanden sein (nicht nur `server/`).

### Schritt A – Repository auf GitHub hochladen

```bash
git init
git add .
git commit -m "NEON FRONTIER"
git branch -M main
git remote add origin https://github.com/<DEIN-NAME>/<REPO>.git
git push -u origin main
```

### Schritt B – Server hosten (Beispiel: Render.com, kostenlos)

1. Auf [render.com](https://render.com) mit GitHub anmelden → **New → Blueprint** → dein Repository wählen. Die Datei `render.yaml` richtet alles ein (Start: `node server/server.js`, Health-Check `/health`).
   *Alternativ:* **New → Web Service**, Build Command `npm install --omit=dev`, Start Command `node server/server.js`.
2. Nach dem Deploy bekommst du eine Adresse wie `https://neon-frontier.onrender.com`.
   Die WebSocket-Adresse ist dieselbe mit `wss://`: **`wss://neon-frontier.onrender.com`**
3. Test: `https://neon-frontier.onrender.com/health` muss `{"ok":true,…}` liefern.

Hinweise zum Gratis-Plan: Render schläft nach ~15 Minuten Inaktivität ein. Der erste Verbindungsversuch kann dann bis zu einer Minute dauern (Menü „Multiplayer“ zeigt den Serverstatus an – einfach nochmal auf „Aktualisieren“). Gleichwertige Alternativen: **Railway**, **Fly.io** (`Dockerfile` ist enthalten), **Koyeb**, ein eigener Server/VPS (`npm start`, z. B. mit `pm2`).
Umgebungsvariablen: `PORT` (vom Hoster gesetzt), `SERVE_CLIENT=0`, sowie für Konten `DATABASE_URL`, `OWNER_USERNAME`, `OWNER_REGISTER_CODE` – Einrichtung Schritt für Schritt in [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

### Schritt C – Frontend auf GitHub Pages veröffentlichen

1. Öffne `client/js/config.js` und trage deinen Server ein:
   ```js
   export const SERVER_URL = 'wss://neon-frontier.onrender.com';
   ```
   Committen und pushen.
2. Im GitHub-Repository: **Settings → Pages → Source: „GitHub Actions“**. Die mitgelieferte Datei `.github/workflows/pages.yml` veröffentlicht den Ordner `client/` bei jedem Push auf `main`.
3. Nach ca. einer Minute ist das Spiel erreichbar unter `https://<DEIN-NAME>.github.io/<REPO>/`.

### Schritt D – Mit Freunden spielen

1. Spiel öffnen → Namen eingeben → **Multiplayer → Raum erstellen** (oder **Private Lobby**).
2. In der Lobby auf **„Einladungslink kopieren“** klicken und den Link an Freunde schicken (z. B. `https://<name>.github.io/<repo>/?room=ABCD`). Ein Klick genügt – sie landen direkt in deiner Lobby. Alternativ den 4-stelligen Raumcode nennen.
3. Host wählt Modus (FFA, Team Deathmatch, 1v1, 2v2, 3v3, 2v2v2), Bots, Schwierigkeit, Zeit & Tageszeit, teilt Teams zu und startet das Match.

*Alles auf einer Plattform:* Du kannst auch nur den Node-Server hosten – er liefert das Frontend selbst aus. Dann reicht `https://neon-frontier.onrender.com/?room=ABCD` (kein GitHub Pages nötig).

*Schneller Test ohne Hoster:* `npm start` und einen Tunnel starten, z. B. `npx cloudflared tunnel --url http://localhost:8080` – die erzeugte https-Adresse an Freunde schicken.

## 4. Spielinhalte

* **Map „Frontier“ (400×400 m)** mit Tageszeit-Zyklus (Tag / Abend / Nacht / dynamisch): *Neon Heights* (Stadt mit Hochhäusern, Panorama-Aufzug, U-Bahn), *Ironworks* (Industrie, Kran, Silos, Container, Tresor), *Fort Helios* (futuristische Militärbasis, Reaktor, Hangar), *Whisper Forest* (Wald, See, Wachturm, Baumhaus, Kristallhöhlen), *Aurora Station* (verlassene Forschungsstation mit Keller), *Saltwind Bay* (Küstenstadt, Leuchtturm, Mole), *Heartland* (Windpark, Scheune, Kapelle) und der *Proving Grounds* Schießstand.
* **Geheimnisse:** versteckte Kisten (3 Stufen), 7 Daten-Kerne, geheimer Tresorraum in der U-Bahn (Hebel), Kristall-Geheimkammer, Industrie-Tresor (Hauptschalter im Kontrollgebäude), eine goldene Ente, ein roter Knopf („nicht drücken“ → 25 s Schwerkraft-Anomalie), Teleporter, Sprungplattformen, Aufzüge, Nachschub-Abwürfe.
* **Waffen:** Viper, Hand Cannon, AR-7 Striker, Hornet SMG, Breaker (Shotgun), Marksman DMR, Longshot (Sniper), Stormcaller (Raketenwerfer), Pulse Rifle (Plasma), Lancer (Laser), Plasma-Klinge (Nahkampf).
* **Items:** Medkit, Schildtrank, Splittergranate, Rauchbombe, Geschwindigkeits-/Sprung-Boost, Schutzschild; Gadgets: Enterhaken, Jetpack, Teleporter, Kampfdrohne, Scanner.
* **Fortschritt:** XP, Level, 8 Charakter-Skins, 6 Waffen-Skins, 14 Erfolge (im Browser gespeichert).

## 5. Technik

```
client/                 statisches Frontend (GitHub Pages)
  index.html, css/      Oberfläche
  vendor/three/         three.js (vendored, keine CDN-Abhängigkeit)
  js/render/            Engine, Welt-Renderer, Himmel, Post-Processing, Charakter, Waffen-Modelle, FX
  js/game/              Client-Spiellogik, Spieler/Kamera, Kampf, Netzwerk, Audio, Fortschritt
  js/ui/                Menüs, Lobby, HUD, Minimap
  js/shared/            Von Client UND Server genutzt: Definitionen, Kollision, Kartendaten, Raum-Simulation, Bots
server/server.js        HTTP + WebSocket-Server (Räume, Reconnect, Rate-Limit, /health, /rooms)
```

* **Netcode:** Clients senden ihre Position 20×/s; der Server (40 Hz) ist autoritativ für Leben/Schild, Treffer (Hitscan mit Lag-Kompensation, Projektile, Explosionen), Items/Pickups, Türen/Kisten, Respawn und Match-Ende und sendet 20 Snapshots/s. Remote-Spieler werden mit 110 ms Interpolation dargestellt. Bei Verbindungsabbruch verbindet der Client automatisch neu und setzt die Session fort (45 s Gnadenfrist).
* **Bots:** A*-Pfadsuche auf einem Navigationsgitter, Sichtprüfung mit Raycasts, Deckung, Verfolgung, Vorhalt, Waffenwahl, Granaten, 3 Schwierigkeitsstufen.
* **Grafik:** prozedurale PBR-Materialien, Kartendaten werden pro Kachel zu wenigen Meshes gemerged, Instancing + LOD für Bäume/Gras, Schatten-Kaskade um den Spieler, Bloom, Umgebungs-Reflexionen aus dem Himmel, optionales GTAO (Ultra).
* **Ehrlicher Hinweis:** Die Bewegung der Spieler wird clientseitig berechnet (das ist für Spiele mit Freunden üblich) und vom Server nur grob geprüft (Geschwindigkeits-/Teleport-Check, Feuerrate, Waffenbesitz). Für ein öffentliches Spiel mit Fremden bräuchte man zusätzlich server-seitige Bewegungssimulation.

## 6. Tests

```bash
npm test        # headless Simulation (Bots, Waffen, Projektile, Pickups) mit Laufzeitmessung
npm run check   # Karten-Validierung (Spawns/Pickups auf dem Boden) + Lauftest durch Treppenschächte & Gebäude
```
