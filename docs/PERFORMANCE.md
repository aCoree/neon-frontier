# NEON FRONTIER – Performance-Bericht (Stand 2026-11-05)

Alle Werte sind **tatsächlich gemessen**. Rohdaten: `docs/baseline-server.jsonl` (vorher), `docs/after-server.jsonl` (nachher).
Messumgebung: ein Mac, Server und Lasttest-Clients auf demselben Rechner (Loopback, keine Netzwerklatenz), Browser = Preview-Pane (Hardware-GPU, 120-Hz-Display, vsync-begrenzt).
Reproduzieren: `node server/tools/loadtest.mjs <Spieler> <Sekunden>` (Räume à 12 Spieler; `PER=8 BOTS=4` für Bots), Server-Metriken unter `/metrics`, Client-Monitor mit `?debug=1` + F3.

## 1. Audit – Ergebnis
| Bereich | Befund |
|---|---|
| Server | Ein Node-Prozess, 40-Hz-Tick pro Raum, Snapshots 20 Hz. **Nicht CPU-limitiert**: 100 simulierte Spieler = ~12 % eines Kerns. Der Tick kostet ≈ 0,07–0,3 ms. |
| Netz | Jeder Spieler bekam jedes Update jeder Entität (volle JSON-Snapshots): **~15,5 KB/s pro Spieler**. |
| Speicher | Jeder Raum hielt die komplette Render-Kartendaten (Parts, Props, Lichter) im RAM: 100 Spieler = **184 MB RSS**. Bei Gratis-Hostern (512 MB) wäre das der erste echte Engpass. |
| Client | Hauptlast = Draw Calls (~400–700/Frame inkl. Schatten + Bloom), nicht Dreiecke. JS-Zeit pro Frame ≈ 3 ms. |
| Hosting | Ein „Einbruch bei ~15 Spielern“ ließ sich auf diesem Rechner **nicht** reproduzieren. Wahrscheinlichste Ursache auf dem Gratis-Plan von Render: nur ~10 % CPU-Anteil + Kaltstarts. Das ist Infrastruktur, nicht Code – nicht getestet, weil ich keinen Zugriff auf deinen Render-Server habe. |

## 2. Server – vorher / nachher (Spieler = menschliche Clients, 12 pro Raum)
| Spieler | Down KB/s je Spieler | CPU % (1 Kern) | RSS MB | Heap MB |
|---|---|---|---|---|
| 12 | 15,5 → **7,4** | 3,8 → 5,7 | 100 → 85 | 25,7 → 14 |
| 24 | 15,4 → **7,3** | 7,3 → 5,8 | 102 → 105 | 27,3 → 17,3 |
| 60 | 15,8 → **7,6** | 8,8 → 8,7 | 156 → 129 | 57,5 → 28,3 |
| 100 | 15,4 → **7,3** | 11,9 → 13,4 | 184 → **134** | 83,1 → **33,2** |
Tick-Spitze (max) in allen Läufen ≤ 2,6 ms, **0 langsame Ticks, 0 Fehler** (5, 12, 24, 36, 60, 100 Spieler; zusätzlich 8/24 Spieler mit 4 Bots pro Raum).
Fazit: Bandbreite −52 %, RAM −27 % bei 100 Spielern, CPU etwa gleich (das Filtern pro Empfänger kostet etwas, die Ersparnis liegt bei Netz/RAM).
**Nicht getestet:** echte Internet-Latenz, echte Spieler-Bewegungsmuster, Render-Gratis-Plan, >12 Spieler pro Raum.

## 3. Client – vorher / nachher (Draw Calls pro Frame, min–max; Dreiecke max)
| Ort | vorher | nachher |
|---|---|---|
| Plaza | 373–663 / 485k | 321–515 / 423k |
| U-Bahn | 742 / 464k | 711 / 441k |
| Wald | 439–663 / 881k | 500–732 / 907k |
| Industrie | 465–679 / 441k | 413–672 / 436k |
Ehrlich: Die Draw-Call-Reduktion ist **klein** (0–20 %, im Wald minimal schlechter wegen der zusätzlichen Bäume). Frametime war auf dem Testgerät vsync-begrenzt (8,3 ms bei 120 Hz), deshalb zeigen FPS-Zahlen hier keinen Unterschied. Heap ≈ 66–90 MB. Die echte Draw-Call-Senkung (Pickups/Charaktere batchen) ist noch offen (siehe unten).
Neu und funktionsfähig getestet: FPS-Limit 30/60/120/unbegrenzt, dynamische Auflösung (0,55–1,0, UI bleibt scharf), Akku-Sparmodus (30 FPS, 75 % Auflösung, weniger Partikel/Schatten), Rendern pausiert bei unsichtbarem Tab, Audio wird dann suspendiert, lokale Simulation pausiert, Renderauflösung/Schatten/Partikel/Sichtweite einstellbar, Entwickler-Monitor (nur `?debug=1`, F3).

### 3b. Draw-Call-Reduktion (Runde 2, Qualität „Mittel“, gleiche Testpunkte, Draw Calls min–max / Dreiecke max)
| Ort | Runde 1 | Runde 2 |
|---|---|---|
| Plaza | 321–515 / 423k | 205–328 / 501k |
| U-Bahn | 711 / 441k | 448–561 / 634k |
| Wald | 500–732 / 907k | 259–354 / 828k |
| Industrie | 413–672 / 436k | 256–375 / 382k |

Was geändert wurde: Charaktere sind jetzt je **ein** SkinnedMesh pro Material (Rüstung/Stoff/Akzent/Visier) statt ~20 Einzelteile (Gelenke bleiben echte Bones, Animation/IK unverändert); Namensschild = 1 Sprite statt 3 Objekte; Pickups zeichnen Strahl und Ring über je ein InstancedMesh pro Typ; Waffenmodelle werden gebacken und gecacht (statische Teile je Material verschmolzen, bewegliche Teile wie Magazin/Pumpe/Klinge bleiben einzeln); Leuchtpunkte der Karte laufen über einen einzigen Points-Shader; Turbinen-Blätter sind je Rotor ein Mesh.
Ehrlich: Draw Calls sinken je nach Ort um etwa 20–50 % gegenüber Runde 1. Die **Dreieckszahl steigt dafür teils** (Plaza +18 %, U-Bahn +44 %), weil Skinned-Meshes nicht mehr einzeln wegsortiert werden können; im Wald und in der Industrie sinkt sie leicht. Die Zahlen stammen aus einem einzelnen Testlauf auf einem Gerät (vsync-begrenzt), sie sind kein Garantiewert für andere Geräte. Optik wurde in Menü, Skins-Ansicht und im Match geprüft; keine Konsolenfehler.

## 4. Noch offen (ehrliche Prioritätenliste)
| Problem | Ursache | Prio | Lösung |
|---|---|---|---|
| Draw Calls 200–560 | Rest: Karte (Distanz-Culling vorhanden), Animator-Objekte, Schatten-Pass | mittel | Schatten nur für nahe Objekte, weitere Animator-Teile verschmelzen |
| Server-Limit auf Gratis-Hosting unbekannt | 0,1 CPU-Anteil bei Render Free | hoch | Mit `/metrics` im echten Betrieb messen; ggf. Starter-Plan (~7 $/Monat) |
| Map-Streaming/Chunks | Welt wird einmal komplett gebaut (Distanz-Culling vorhanden, kein Nachladen) | mittel | erst nötig, wenn die Karte deutlich größer wird |
| Server nicht Multi-Instanz-fähig | Räume leben im Prozess-Speicher | mittel | Gateway + Matchmaking-Service, Räume pro Instanz registrieren |
| Bewegung clientseitig | Position kommt vom Client (nur Tempo-/Teleport-Check) | mittel | serverseitige Bewegungssimulation mit Input-Paketen |
| Mobile/Touch | keine Touch-Steuerung | mittel | Touch-UI + eigenes Layout |
| Konten, Profile, Rang, Seasons, Inventar, Währung, Freunde, Reports, Admin, Analytics, Backups | existiert noch nicht (Fortschritt liegt im Browser) | – | braucht eine persistente Datenbank, siehe unten |
