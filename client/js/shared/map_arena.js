// ARENA ZERO – kompakte Neon-Arena für Duelle (1v1) und kleine Teams (2v2/3v3). Ranked wird immer hier gespielt.
// Aufbau: 88 × 68 m Kampffläche in einem Stadion. Cyan-Seite im Westen, Pink-Seite im Osten, alles punktsymmetrisch (fair für beide).
//   · Kern in der Mitte (3,2 m hoch, vier Treppen, Barriere-Powerup auf dem Dach)
//   · vier Aussichts-Plattformen (4 m) mit Scharfschützen-Waffen – erreichbar über Treppe oder Sprungplatte
//   · Spawn-Buchten an den Stirnseiten, dazwischen Container, Säulen, Betonsperren und Kisten als Deckung
// Reine Daten wie die Weltkarte: Server und Client erzeugen dasselbe Ergebnis (fester Seed).
import { MB } from './mapbuilder.js';

const X = 44, Z = 34, WT = 2.4, WH = 14;               // Innenmaße der Arena, Wanddicke und -höhe
const CY = 0x3de6ff, PK = 0xff3da8, WHITE = 0xe8f4ff, AMBER = 0xffb347;
const sideMat = (x) => (x < 0 ? 'neonCyan' : 'neonPink');
const sideCol = (x) => (x < 0 ? CY : PK);
const ZONE = { id: 'arena', name: 'Arena Zero' };

// Treppe: ab der Kante (ex,ez) in Richtung dir ('+x','-x','+z','-z') nach unten, Breite w, Oberkante y1 (die Kante selbst liegt auf y1)
function flight(mb, ex, ez, dir, w, y1, rise = 0.4, run = 0.55) {
  const n = Math.max(1, Math.round(y1 / rise) - 1), ax = dir[1], sg = dir[0] === '-' ? -1 : 1;
  for (let k = 1; k <= n; k++) {
    const h = y1 - k * rise, d = (k - 0.5) * run * sg;
    if (ax === 'x') mb.box('stairs', ex + d, 0, ez, run, h, w, { noao: 1 }); else mb.box('stairs', ex, 0, ez + d, w, h, run, { noao: 1 });
  }
  return n * run;
}
// Leuchtring aus kurzen, gedrehten Leistenstücken (ein Ribbon würde in Kurven einseitig verschwinden)
function ring(mb, mat, cx, cz, r, w = 0.3, n = Math.max(28, Math.round(r * 7))) {
  const len = 2 * Math.PI * r / n * 1.08;
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; mb.vis(mat, cx + Math.cos(a) * r, 0.025, cz + Math.sin(a) * r, len, 0.02, w, { ry: -(a + Math.PI / 2), noao: 1, cast: false }); }
}

export function buildArena() {
  const mb = new MB(4242), terrainY = () => 0;
  mb.terrainY = terrainY;
  const quad = (fn) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) fn(sx, sz); };

  // ================= Boden =================
  mb.vis('techDark', 0, -0.4, 0, 2 * X + 6, 0.42, 2 * Z + 6, { tile: 3.2, noao: 1, cast: false });
  mb.vis('techWall', 0, -0.2, 0, 2 * X, 0.21, 2 * Z, { tile: 11, noao: 1, cast: false });
  for (const [x, c] of [[-1, 'neonCyan'], [1, 'neonPink']]) {       // Seitenstreifen in Teamfarbe
    mb.vis(c, x * (X - 6), 0.025, 0, 0.3, 0.02, 2 * Z - 4, { noao: 1, cast: false }); mb.vis(c, x * 12, 0.025, 0, 0.18, 0.02, 2 * Z - 4, { noao: 1, cast: false });
  }
  mb.vis('roadLine', 0, 0.02, 0, 0.3, 0.02, 2 * Z, { noao: 1, cast: false });
  ring(mb, 'neonCyan', 0, 0, 11.5, 0.28); ring(mb, 'neonPink', 0, 0, 12.1, 0.14);
  for (const x of [-1, 1]) { ring(mb, sideMat(x), x * 40, 0, 5.2, 0.3); ring(mb, sideMat(x), x * 40, 0, 3.6, 0.15); }
  for (const x of [-1, 1]) for (const z of [-1, 1]) ring(mb, sideMat(x), x * 27, z * 19, 2.3, 0.18, 32);   // Markierung unter den Plattformen

  // ================= Außenwand + Stadion =================
  mb.box('techDark', 0, 0, -(Z + WT / 2), 2 * X + 2 * WT, WH, WT, { tile: 7 });
  mb.box('techDark', 0, 0, Z + WT / 2, 2 * X + 2 * WT, WH, WT, { tile: 7 });
  mb.box('techDark', -(X + WT / 2), 0, 0, WT, WH, 2 * Z, { tile: 7 });
  mb.box('techDark', X + WT / 2, 0, 0, WT, WH, 2 * Z, { tile: 7 });
  for (const sz of [-1, 1]) { // Leuchtbänder Nord/Süd (links cyan, rechts pink)
    for (const sx of [-1, 1]) { mb.vis(sideMat(sx), sx * X / 2, 9.2, sz * (Z - 0.07), X, 0.4, 0.14, { noao: 1, cast: false }); mb.vis(sideMat(sx), sx * X / 2, 0.2, sz * (Z - 0.07), X, 0.22, 0.14, { noao: 1, cast: false }); mb.vis(sideMat(sx), sx * X / 2, 4.6, sz * (Z - 0.07), X, 0.12, 0.14, { noao: 1, cast: false }); }
  }
  for (const sx of [-1, 1]) { mb.vis(sideMat(sx), sx * (X - 0.07), 9.2, 0, 0.14, 0.4, 2 * Z, { noao: 1, cast: false }); mb.vis(sideMat(sx), sx * (X - 0.07), 0.2, 0, 0.14, 0.22, 2 * Z, { noao: 1, cast: false }); mb.vis(sideMat(sx), sx * (X - 0.07), 4.6, 0, 0.14, 0.12, 2 * Z, { noao: 1, cast: false }); }
  for (let i = -40; i <= 40; i += 8) for (const sz of [-1, 1]) mb.vis('metalDark', i, 0, sz * (Z - 0.17), 0.7, WH, 0.34, { noao: 1 });          // Rippen
  for (let i = -28; i <= 28; i += 8) for (const sx of [-1, 1]) mb.vis('metalDark', sx * (X - 0.17), 0, i, 0.34, WH, 0.7, { noao: 1 });
  for (const sz of [-1, 1]) mb.vis('metalDark', 0, WH - 0.2, sz * (Z - 1.3), 2 * X, 0.5, 2.6, { noao: 1 });        // Traufe
  for (const sx of [-1, 1]) mb.vis('metalDark', sx * (X - 1.3), WH - 0.2, 0, 2.6, 0.5, 2 * Z, { noao: 1 });
  // Ecktürme
  quad((sx, sz) => {
    const cx = sx * (X + WT + 1.2), cz = sz * (Z + WT + 1.2);
    mb.box('techWall', cx, 0, cz, 6, 20, 6, { tile: 6 }); mb.vis(sideMat(sx), cx, 20, cz, 6.4, 0.5, 6.4, { noao: 1 }); mb.vis(sideMat(sx), cx - sx * 3.08, 6, cz, 0.12, 12, 5.2, { noao: 1 });
    mb.glow(cx, 21.2, cz, sideCol(sx), 9, 1); mb.light(cx, 22, cz, sideCol(sx), 1.0, 40);
    mb.anim('searchlight', { x: cx, y: 20.8, z: cz, a: (sx + 1) * 1.6 + (sz + 1) * 0.8 });
  });
  // Tribünen (rein optisch) – steigen hinter der Wand auf; Sitzpunkte leuchten schwach
  const seat = [0x6fd8ff, 0xff7ad0, 0xffe39a, 0xb6a0ff];
  for (let t = 0; t < 5; t++) {
    const h = 9 + t * 4.2, d = 5, off = WT + 2.5 + t * d;
    for (const sz of [-1, 1]) {
      mb.vis('concreteDark', 0, 0, sz * (Z + off), 2 * X + 14 + t * 6, h, d, { noao: 1 }); mb.vis('metalDark', 0, h, sz * (Z + off), 2 * X + 14 + t * 6, 0.25, d, { noao: 1 });
      for (let x = -X - 4; x <= X + 4; x += 5.5) if (((x + t * 3) | 0) % 3 !== 1) mb.glow(x + (t % 2) * 1.8, h + 0.45, sz * (Z + off) + (mb.rng() - 0.5) * 2.2, seat[(mb.rng() * 4) | 0], 1.5, 0.5);
    }
    for (const sx of [-1, 1]) {
      mb.vis('concreteDark', sx * (X + off), 0, 0, d, h, 2 * Z + 14 + t * 6, { noao: 1 }); mb.vis('metalDark', sx * (X + off), h, 0, d, 0.25, 2 * Z + 14 + t * 6, { noao: 1 });
      for (let z = -Z - 4; z <= Z + 4; z += 5.5) if (((z + t * 3) | 0) % 3 !== 1) mb.glow(sx * (X + off) + (mb.rng() - 0.5) * 2.2, h + 0.45, z + (t % 2) * 1.8, seat[(mb.rng() * 4) | 0], 1.5, 0.5);
    }
  }
  // Wandschilder
  mb.label('ARENA ZERO', 0, 11.2, -Z + 0.2, 0, 11, '#7ee8ff'); mb.label('ARENA ZERO', 0, 11.2, Z - 0.2, Math.PI, 11, '#ff7ad0');
  mb.label('SEKTOR CYAN', -X + 0.2, 11.2, 0, Math.PI / 2, 9, '#3de6ff'); mb.label('SEKTOR PINK', X - 0.2, 11.2, 0, -Math.PI / 2, 9, '#ff3da8');

  // ================= Spawn-Buchten (Stirnseiten) =================
  for (const x of [-1, 1]) {
    const c = sideMat(x);
    for (const z of [-1, 1]) {
      mb.box('techWall', x * (X - 4.5), 0, z * 7.7, 9, 3.4, 0.7, { tile: 4 }); mb.vis(c, x * (X - 4.5), 3.4, z * 7.7, 9.1, 0.16, 0.8, { noao: 1 });
      mb.box('techDark', x * (X - 9.25), 0, z * 7.7, 0.9, 4.2, 0.9, { tile: 3 }); mb.vis(c, x * (X - 9.25), 4.2, z * 7.7, 1.1, 0.2, 1.1, { noao: 1 });
    }
    mb.vis('techWhite', x * (X - 3), 0.03, 0, 6, 0.04, 14, { tile: 3, noao: 1, cast: false });
    mb.vis('hazard', x * (X - 6.2), 0.04, 0, 0.7, 0.03, 14.8, { noao: 1, cast: false });
    mb.glow(x * (X - 3), 4.2, 0, sideCol(x), 6, 0.9); mb.light(x * (X - 3), 4.5, 0, sideCol(x), 1.1, 20);
    mb.label(x < 0 ? 'CYAN' : 'PINK', x * (X - 0.35), 6.8, 0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 6, x < 0 ? '#3de6ff' : '#ff3da8');
    const yaw = x < 0 ? Math.PI / 2 : -Math.PI / 2;      // schaut zur Mitte
    for (const z of [-4.6, 0, 4.6]) mb.spawn(x * (X - 4), z, undefined, yaw);
    // Ausrüstung in der Bucht (jeder Spieler hat sie in seiner Nähe)
    mb.pickup('weapon', 'striker', x * (X - 2.2), 5.2 * x, 0, 25); mb.pickup('cons', 'medkit', x * (X - 2.2), -5.2 * x, 0, 25); mb.pickup('ammo', 'light', x * (X - 2.2), 0, 0, 20);
    // Banner
    mb.cyl('metalDark', x * (X - 9.8), 0, 9.6, 0.1, 7, { solid: false, seg: 6 }); mb.anim('flag', { x: x * (X - 9.8) - x * 0.1, y: 5.4, z: 9.6, color: sideCol(x) });
    mb.cyl('metalDark', x * (X - 9.8), 0, -9.6, 0.1, 7, { solid: false, seg: 6 }); mb.anim('flag', { x: x * (X - 9.8) - x * 0.1, y: 5.4, z: -9.6, color: sideCol(x) });
  }
  // weitere Startpunkte für größere Teams
  quad((sx, sz) => { mb.spawn(sx * 30, sz * 27, undefined, sx < 0 ? Math.PI / 2 : -Math.PI / 2); mb.spawn(sx * 14, sz * 29, undefined, sz < 0 ? 0 : Math.PI); });
  mb.spawn(-22, 0, undefined, Math.PI / 2); mb.spawn(22, 0, undefined, -Math.PI / 2);

  // ================= Kern =================
  mb.box('techWhite', 0, 0, 0, 9, 3.2, 9, { tile: 4.5 });
  for (const sx of [-1, 1]) { mb.vis(sideMat(sx), sx * 4.56, 0.2, 0, 0.1, 0.18, 9.2, { noao: 1 }); mb.vis(sideMat(sx), sx * 4.56, 3.05, 0, 0.1, 0.16, 9.2, { noao: 1 }); mb.vis(sideMat(sx), 0, 3.1, sx * 4.56, 9.2, 0.14, 0.1, { noao: 1 }); }
  for (const [d, ex, ez] of [['+x', 4.5, 0], ['-x', -4.5, 0], ['+z', 0, 4.5], ['-z', 0, -4.5]]) flight(mb, ex, ez, d, 2.6, 3.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box('techDark', sx * 4.35, 3.2, sz * 3.0, 0.3, 0.9, 2.3, { noao: 1 });  // Dach-Brüstung
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box('techDark', sz * 3.0, 3.2, sx * 4.35, 2.3, 0.9, 0.3, { noao: 1 });
  mb.pickup('power', 'barrier', 0, 0, 3.2, 50);
  mb.anim('holo', { x: 0, y: 8.4, z: 0, color: 0x7ee8ff }); mb.glow(0, 8.4, 0, 0x7ee8ff, 6, 0.9); mb.light(0, 7.5, 0, 0x7ee8ff, 1.2, 26);
  mb.pad(-7.3, 0, 0, 13, 5.7, 0, 1.5); mb.pad(7.3, 0, 0, 13, -5.7, 0, 1.5);   // Katapulte auf das Kerndach

  // ================= Plattformen (Aussichtspunkte) =================
  quad((sx, sz) => {
    const px = sx * 27, pz = sz * 19, PW = 10, PD = 8, TOP = 4.0, c = sideMat(sx);
    mb.box('techDark', px, TOP - 0.4, pz, PW, 0.4, PD, { tile: 3 });
    mb.vis(c, px, TOP - 0.05, pz - PD / 2 - 0.02, PW + 0.1, 0.1, 0.06, { noao: 1 }); mb.vis(c, px, TOP - 0.05, pz + PD / 2 + 0.02, PW + 0.1, 0.1, 0.06, { noao: 1 });
    mb.vis(c, px - PW / 2 - 0.02, TOP - 0.05, pz, 0.06, 0.1, PD, { noao: 1 }); mb.vis(c, px + PW / 2 + 0.02, TOP - 0.05, pz, 0.06, 0.1, PD, { noao: 1 });
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) mb.cyl('metalDark', px + dx * (PW / 2 - 0.5), 0, pz + dz * (PD / 2 - 0.5), 0.5, TOP - 0.4, { seg: 10 });
    flight(mb, px - sx * PW / 2, pz, sx > 0 ? '-x' : '+x', 2.6, TOP);   // Treppe zeigt zur Mitte
    // Brüstung: außen und an beiden Längsseiten (Lücke für die Sprungplatte auf der Wandseite)
    mb.box('metal', px + sx * (PW / 2 - 0.15), TOP, pz, 0.3, 1.1, PD, { noao: 1 });
    mb.box('metal', px - sx * 0.0 + sx * (PW / 4 - 0.6), TOP, pz - sz * (PD / 2 - 0.15), PW / 2 + 1.2, 1.1, 0.3, { noao: 1 });
    mb.box('metal', px - sx * (PW / 4 - 0.6), TOP, pz - sz * (PD / 2 - 0.15), PW / 2 - 1.2, 1.1, 0.3, { noao: 1 });
    mb.box('metal', px - sx * (PW / 2 - 3.2), TOP, pz + sz * (PD / 2 - 0.15), PW - 6.4 + 3.0, 1.1, 0.3, { noao: 1 });
    mb.pad(px, pz + sz * 8.6, 0, 15.5, 0, -sz * 7.0, 1.4);      // von der Wandseite hinauf
    // Fracht
    const gun = (sx * sz > 0) ? 'longshot' : 'stormcaller';
    mb.pickup('weapon', gun, px + sx * 1.5, pz, TOP, 40); mb.pickup('cons', 'shieldpot', px - sx * 1.5, pz - sz * 1.2, TOP, 30);
    mb.glow(px, TOP + 3, pz, sideCol(sx), 4, 0.5); mb.light(px, TOP + 4.2, pz, sideCol(sx), 0.9, 18);
  });

  // ================= Deckung auf der Fläche =================
  quad((sx, sz) => {
    const c = sideMat(sx);
    mb.container(sx * 33, sz * 11, 0, 1, sz > 0 ? 'containerBlue' : 'containerRed');                 // lange Seite in z
    mb.container(sx * 33, sz * 18.5, 0, 1, sx > 0 ? 'containerGray' : 'containerYellow');
    mb.jersey(sx * 13.5, sz * 10, 0, false); mb.jersey(sx * 17.5, sz * 24.5, 0, false);
    mb.jersey(sx * 22, sz * 5, 0, true);
    for (const [x, z] of [[sx * 17, sz * 7.5], [sx * 8.5, sz * 17]]) { mb.cyl('techWall', x, 0, z, 1.35, 6, { seg: 16, tile: 3 }); mb.visc(c, x, 4.4, z, 1.42, 0.2, { seg: 16 }); mb.visc(c, x, 0.5, z, 1.42, 0.14, { seg: 16 }); mb.glow(x, 4.5, z, sideCol(sx), 3, 0.7); }
    mb.crate(sx * 6, sz * 26, 0, 1.3, 'crate'); mb.crate(sx * 7.5, sz * 26, 0, 1.3, 'crate'); mb.crate(sx * 6.7, sz * 26, 1.3, 1.3, 'crate'); mb.crate(sx * 5.2, sz * 27.4, 0, 1.0, 'crate');
    mb.box('concrete', sx * 23, 0, sz * 29.5, 6, 1.3, 0.55, { tile: 2 });
    mb.box('concrete', sx * 40, 0, sz * 21, 0.55, 1.3, 6, { tile: 2 });
    mb.barrel(sx * 36.5, sz * 28.5, 0, 'barrelRed'); mb.barrel(sx * 37.6, sz * 28, 0, 'barrelYellow');
    // Pickups verteilt (alle Positionen punktsymmetrisch)
    mb.pickup('weapon', 'hornet', sx * 18, sz * 27, 0, 30); mb.pickup('cons', 'grenade', sx * 29.5, sz * 5.5, 0, 25); mb.pickup('ammo', 'shells', sx * 11.5, sz * 5.5, 0, 25);
    mb.pickup(sx * sz > 0 ? 'cons' : 'cons', sx * sz > 0 ? 'medkit' : 'shieldpot', sx * 15, sz * 12.5, 0, 30);
    mb.pickup('cons', 'medkit', sx * 24, sz * 12, 0, 30); mb.pickup('ammo', 'energy', sx * 25.5, sz * 13.5, 0, 25);
  });

  for (const x of [-1, 1]) mb.pickup('weapon', 'breaker', x * 14, 0, 0, 35);

  // ================= Lichter über der Fläche =================
  const truss = (z) => { mb.vis('metalDark', 0, 16.2, z, 2 * X + 4, 0.5, 0.5, { noao: 1, cast: false }); for (let x = -40; x <= 40; x += 10) { mb.vis('lamp', x, 15.9, z, 1.6, 0.14, 0.6, { noao: 1, cast: false }); } };
  truss(-16); truss(16);
  for (const x of [-32, -16, 0, 16, 32]) for (const z of [-16, 16]) { mb.light(x, 14.5, z, x < 0 ? CY : x > 0 ? PK : WHITE, 1.15, 30); mb.glow(x, 15.6, z, x < 0 ? CY : x > 0 ? PK : WHITE, 3.5, 0.7); }
  for (const x of [-38, 38]) for (const z of [-26, 26]) mb.light(x, 8, z, x < 0 ? CY : PK, 0.9, 22);
  mb.light(0, 9, -26, WHITE, 0.8, 24); mb.light(0, 9, 26, WHITE, 0.8, 24); mb.light(-22, 6, 0, CY, 0.8, 18); mb.light(22, 6, 0, PK, 0.8, 18);
  mb.glow(0, 15.6, 0, AMBER, 4, 0.6);

  // ================= Ergebnis (gleiche Form wie die Weltkarte) =================
  const pois = [
    { n: 'Arena Zero', x: 0, z: 0, major: 1 },
    { n: 'Kern', x: 0, z: 0 }, { n: 'Cyan-Bucht', x: -40, z: 0 }, { n: 'Pink-Bucht', x: 40, z: 0 },
    { n: 'Plattform Nordwest', x: -27, z: -19 }, { n: 'Plattform Nordost', x: 27, z: -19 }, { n: 'Plattform Südwest', x: -27, z: 19 }, { n: 'Plattform Südost', x: 27, z: 19 },
    { n: 'Container-Gasse West', x: -33, z: 0 }, { n: 'Container-Gasse Ost', x: 33, z: 0 },
  ];
  return {
    id: 'arena', name: 'Arena Zero', seed: 4242, size: 120, extent: 60, bound: 47, terrainR: 90, style: 'arena', noSupply: true,
    zoneAt: () => ZONE, pois, seaLevel: -60, zones: [ZONE], lake: null, terrainY, holes: mb.holes, boxes: mb.boxes, cyls: mb.cyls, parts: mb.parts, props: [],
    spawns: mb.spawns, pickups: mb.pickups, chests: mb.chests, doors: mb.doors, switches: mb.switches,
    movers: mb.movers, pads: mb.pads, tele: mb.tele, lights: mb.lights, glows: mb.glows, anims: mb.anims,
    labels: mb.labels, secrets: mb.secretSpots, zonesFx: mb.zonesFx,
  };
}
