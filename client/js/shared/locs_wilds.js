// Whisper Forest, Kristallhöhlen, Aurora Station (verlassene Forschungsstation), Heartland & Verbindungswege.
import { terrainY } from './mapdata.js';

export function buildWilds(mb) {
  forest(mb);
  caves(mb);
  station(mb);
  meadow(mb);
  roads(mb);
}

function forest(mb) {
  const T = (x, z) => terrainY(x, z);
  // Hütte am See
  const hx = -104, hz = 50, hy = T(hx, hz) + 0.1;
  mb.vis('concreteDark', hx, hy - 1.5, hz, 11, 1.6, 10, { noao: 1 });
  const cab = mb.building({ x: hx, z: hz, w: 9, d: 8, floors: 1, fh: 3.2, base: hy, mat: 'logs', inMat: 'woodIn', stairs: false, parapet: false, floorMat: 'plank', doors: [{ side: 'e' }, { side: 's', off: -2.2, w: 1.6 }], roofMat: 'woodRoof', lamps: false });
  mb.gable('woodRoof', hx, cab.top, hz, 9, 8, 2.2);
  mb.light(hx, hy + 2.5, hz, 0xffcc88, 1.0, 9); mb.vis('lampWarm', hx, hy + 3.0, hz, 1, 0.08, 0.4, { noao: 1 });
  mb.chest(hx - 3, hz - 2.5, hy, 2, 0); mb.pickup('weapon', 'marksman', hx + 2, hz + 1.5, hy, 40); mb.pickup('cons', 'medkit', hx, hz + 2.5, hy, 25);
  mb.vis('plank', hx + 12, -0.55, hz + 6, 14, 0.18, 2.4, { noao: 1 }); mb.box('plank', hx + 13, -0.5, hz + 8, 12, 0.2, 2.6, { tile: 2 });
  mb.pickup('shard', 'data', hx + 18, hz + 8, -0.3, 99999);
  // Wachturm
  const wx = -92, wz = -22, wy = T(wx, wz);
  const wt = mb.building({ x: wx, z: wz, w: 12, d: 11, floors: 4, fh: 3.7, base: wy, mat: 'logs', inMat: 'woodIn', stairs: true, roofAccess: true, floorMat: 'plank', doors: [{ side: 's' }], upperGaps: { n: [{ c: 0, w: 3, h: 2.2 }], e: [{ c: 0, w: 3, h: 2.2 }], w: [{ c: 0, w: 3, h: 2.2 }] }, parMat: 'logs' });
  mb.pickup('weapon', 'longshot', wx + 2, wz + 2, wt.top, 55); mb.pickup('ammo', 'sniper', wx - 2, wz + 2, wt.top, 30); mb.pickup('weapon', 'breaker', wx, wz + 1, wy, 35);
  mb.label('AUSSICHTSTURM', wx, wy + 5, wz + 5.7, 0, 4, '#ffffff');
  // Lagerfeuer
  const cx = -124, cz = 26, cy = T(cx, cz);
  mb.visc('rockDark', cx, cy, cz, 1.3, 0.35, { seg: 10 }); mb.anim('fire', { x: cx, y: cy + 0.4, z: cz }); mb.light(cx, cy + 1.2, cz, 0xff9a40, 2.0, 17, 0.5);
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; mb.box('wood', cx + Math.cos(a) * 3, cy, cz + Math.sin(a) * 3, 2.2, 0.55, 0.6, { ry: -a + 1.57 }); }
  mb.pickup('cons', 'medkit', cx + 1, cz + 4, cy, 25); mb.pickup('weapon', 'viper', cx - 2, cz + 4, cy, 25);
  // Ruinen
  for (const [dx, dz, w, d, h] of [[0, 0, 10, 0.8, 3.4], [-4.6, 3, 0.8, 7, 2.2], [4.6, 2, 0.8, 5, 1.4], [2, 6, 5, 0.8, 2.6]]) { const x = -66 + dx, z = 14 + dz; mb.box('rockBrick', x, T(x, z) - 0.2, z, w, h, d, { tile: 3 }); }
  for (let i = 0; i < 8; i++) { const x = -66 + mb.r(-5, 5), z = 14 + mb.r(-1, 8); mb.box('rockBrick', x, T(x, z) - 0.1, z, mb.r(0.8, 1.6), mb.r(0.5, 1.2), mb.r(0.8, 1.6), { ry: mb.r(0, 3), tile: 2 }); }
  mb.chest(-64, 20, T(-64, 20), 2, 1.6); mb.pickup('weapon', 'pulse', -67, 12, T(-67, 12), 40); mb.pickup('power', 'jump', -64, 14, T(-64, 14), 45);
  // Baumhaus (geheim, schwer zu erreichen: Sprungplattform in der Nähe)
  const bx = -130, bz = -34, by = T(bx, bz) + 7.5;
  mb.cyl('logsBark', bx, by - 7.5, bz, 1.2, 15, { seg: 8 });
  mb.box('plank', bx, by, bz, 7.5, 0.4, 7.5, { tile: 2 });
  for (const sg of [-1, 1]) { mb.box('logs', bx, by + 0.4, bz + sg * 3.6, 7.5, 1.1, 0.3, { noao: 1 }); mb.box('logs', bx + sg * 3.6, by + 0.4, bz, 0.3, 1.1, 7.5, { noao: 1 }); }
  mb.vis('woodRoof', bx, by + 3.4, bz, 8.4, 0.3, 8.4, { noao: 1 }); for (const [a, b] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) mb.vis('wood', bx + a, by + 0.4, bz + b, 0.3, 3.0, 0.3, { noao: 1 });
  mb.pad(bx - 12, bz + 4, T(bx - 12, bz + 4), 23, 0.5, -0.3, 1.8);
  mb.chest(bx + 1, bz - 1, by + 0.4, 3, 0); mb.pickup('shard', 'data', bx - 2, bz + 2, by + 0.4, 99999); mb.light(bx, by + 2.6, bz, 0xffcc88, 1.0, 10);
  mb.label('BAUMHAUS', bx, by + 2.8, bz + 4.4, 0, 3, '#c9ff9a');
  // Pilze/Glühwürmchen-Feld
  mb.anim('fireflies', { x: -100, y: T(-100, 0) + 1.5, z: 0, r: 22 });
  mb.anim('fireflies', { x: -120, y: T(-120, 50) + 1.5, z: 50, r: 16 });
  for (const [x, z] of [[-60, 40], [-140, 20], [-100, 20], [-118, -10], [-80, 60], [-140, 55], [-72, -12]]) mb.spawn(x, z, T(x, z));
  mb.pickup('weapon', 'striker', -108, 0, T(-108, 0), 30); mb.pickup('weapon', 'hornet', -84, 30, T(-84, 30), 30); mb.pickup('ammo', 'light', -125, 40, T(-125, 40)); mb.pickup('cons', 'shieldpot', -96, 20, T(-96, 20), 25);
  mb.pickup('cons', 'grenade', -70, 40, T(-70, 40)); mb.pickup('weapon', 'magnum', -132, 8, T(-132, 8), 35); mb.pickup('ammo', 'shells', -90, 44, T(-90, 44), 25);
  mb.pickup('power', 'speed', -112, -26, T(-112, -26), 45); mb.pickup('shard', 'data', -150, 40, T(-150, 40), 99999);
}

function caves(mb) {
  const surf = 5.0;
  const A = mb.shaft({ x: -150, z: 0, surf });
  const Bsh = mb.shaft({ x: -146, z: -60, surf });
  const F = A.floorY; // -4
  mb.label('KRISTALLHÖHLEN', -150, surf + 3.5, 5.5, 0, 6, '#b36bff');
  // Felsportal um den Eingang
  for (const [x, z, s] of [[-146, -4.6, 3], [-146, 4.6, 3], [-141, -2, 2.4], [-141, 2, 2.4]]) mb.prop('rock3', x, z, s, mb.r(0, 6), surf - 0.5);
  for (const [x, z, s] of [[-142, -64, 3], [-142, -56, 3]]) mb.prop('rock3', x, z, s, mb.r(0, 6), surf - 0.5);
  const H = 5.2;
  const rockBox = (x0, z0, x1, z1) => { // Kammer: Boden + Decke + 4 Wände (Wände später durch Durchgänge ergänzt)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    mb.box('rockDark', cx, F - 0.6, cz, x1 - x0 + 2, 0.6, z1 - z0 + 2);
    mb.box('rock', cx, F + H, cz, x1 - x0 + 2, 1, z1 - z0 + 2);
  };
  const wall = (x0, z0, x1, z1, gaps = []) => { // Wand mit Lücken [{c,w}] entlang der langen Achse
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = horiz ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let cur = -len / 2;
    const seg = (a, b) => { if (b - a < 0.05) return; const m = (a + b) / 2; mb.box('rock', horiz ? cx + m : cx, F, horiz ? cz : cz + m, horiz ? b - a : 1.2, H + 1, horiz ? 1.2 : b - a); };
    for (const g of gaps.sort((p, q) => p.c - q.c)) { seg(cur, g.c - g.w / 2); cur = g.c + g.w / 2; }
    seg(cur, len / 2);
  };
  // Kammer 1 (um Eingang A), Gang, Kammer 2
  const c1 = { x0: -186, x1: A.exitX, z0: -14, z1: 14 }, c2 = { x0: -190, x1: Bsh.exitX, z0: -78, z1: -48 };
  rockBox(c1.x0, c1.z0, c1.x1, c1.z1); rockBox(c2.x0, c2.z0, c2.x1, c2.z1);
  rockBox(-176, -48, -166, -14);
  wall(c1.x0, c1.z0, c1.x1, c1.z0, [{ c: -171.5 - (c1.x0 + c1.x1) / 2, w: 6 }]); wall(c1.x0, c1.z1, c1.x1, c1.z1);
  wall(c1.x0, c1.z0, c1.x0, c1.z1);
  wall(c1.x1, c1.z0, c1.x1, c1.z1, [{ c: A.exitZ - (c1.z0 + c1.z1) / 2, w: 4 }]);
  wall(c2.x0, c2.z0, c2.x1, c2.z0, [{ c: -180 - (c2.x0 + c2.x1) / 2, w: 3.4 }]); wall(c2.x0, c2.z1, c2.x1, c2.z1, [{ c: -171 - (c2.x0 + c2.x1) / 2, w: 6 }]);
  wall(c2.x0, c2.z0, c2.x0, c2.z1); wall(c2.x1, c2.z0, c2.x1, c2.z1, [{ c: Bsh.exitZ - (c2.z0 + c2.z1) / 2, w: 4 }]);
  wall(-176, -48, -176, -14); wall(-166, -48, -166, -14);
  // Kristalle, Felsen, Pfeiler
  const crystal = (x, z, h, mat, col) => {
    mb.cyl(mat, x, F, z, 0.5 + h * 0.06, h, { r2: 0.03, seg: 5, solid: true });
    mb.cyl(mat, x + 0.5, F, z + 0.3, 0.3 + h * 0.03, h * 0.65, { r2: 0.02, seg: 5, solid: false, rz: 0.2 });
    mb.glow(x, F + h * 0.5, z, col, 3.4, 0.7); if (h > 2.5) mb.light(x, F + h * 0.6, z, col, 1.6, 15);
  };
  const cols = [['crystalBlue', 0x3da8ff], ['crystalPurple', 0xb36bff], ['crystalGreen', 0x4dff9a], ['crystalPink', 0xff4dc8]];
  for (let i = 0; i < 26; i++) {
    const ch = i % 2 ? c1 : c2;
    const x = mb.r(ch.x0 + 2, ch.x1 - 3), z = mb.r(ch.z0 + 2, ch.z1 - 2);
    if (ch === c1 && x > -166 && Math.abs(z - A.exitZ) < 5) continue; if (ch === c2 && x > -160 && Math.abs(z - Bsh.exitZ) < 5) continue;
    const c = cols[i % 4]; crystal(x, z, mb.r(1.4, 4.6), c[0], c[1]);
  }
  for (let i = 0; i < 14; i++) {
    const ch = i % 2 ? c1 : c2; const x = mb.r(ch.x0 + 2, ch.x1 - 3), z = mb.r(ch.z0 + 2, ch.z1 - 2);
    if (ch === c1 && x > -168 && Math.abs(z - A.exitZ) < 6) continue; if (ch === c2 && x > -162 && Math.abs(z - Bsh.exitZ) < 6) continue;
    mb.cyl('rockDark', x, F, z, mb.r(0.7, 1.5), mb.r(1.2, 3.4), { r2: mb.r(0.3, 0.8), seg: 7, tile: 3 });
  }
  for (const x of [-183, -178]) mb.cyl('rock', x, F, -2, 1.4, H, { r2: 1.8, seg: 8, tile: 4 });
  mb.vis('waterCave', -172, F + 0.08, 4, 10, 0.05, 7, { noao: 1 });
  mb.anim('fireflies', { x: -172, y: F + 1.6, z: -62, r: 14, color: 0xb36bff });
  // Geheimkammer in Kammer 2 (Hebel öffnet Felswand)
  const sx = -182, sz = -86;
  mb.door({ id: 'caveSecret', x: -180, y: F, z: c2.z0 - 0.1, w: 3.4, h: 3.2, d: 1.2, mat: 'rockDoor', locked: true });
  mb.box('rock', -180, F + 3.2, c2.z0 - 0.1, 3.4, H - 3.2, 1.2);
  rockBox(-190, -90, -170, c2.z0); wall(-190, -90, -170, -90); wall(-190, -90, -190, c2.z0); wall(-170, -90, -170, c2.z0);
  mb.chest(-186, -84, F, 3, 0.4); mb.chest(-174, -84, F, 3, -0.4); mb.pickup('weapon', 'lancer', -180, -84, F, 70); mb.pickup('shard', 'data', -180, -88, F, 99999);
  crystal(-180, -88, 3.2, 'crystalPink', 0xff4dc8);
  mb.switchObj({ id: 'caveLever', x: -158, y: F, z: -66, ry: -Math.PI / 2, kind: 'lever', targets: ['caveSecret'], label: 'Kristall-Hebel ziehen', color: 0xb36bff });
  mb.vis('crystalPurple', -157.5, F + 0.4, -66, 0.5, 1, 0.5, { noao: 1 });
  mb.pickup('weapon', 'pulse', -170, 6, F, 35); mb.pickup('cons', 'medkit', -165, -8, F, 25); mb.pickup('weapon', 'breaker', -172, -58, F, 35); mb.pickup('ammo', 'energy', -184, -60, F, 30); mb.pickup('power', 'speed', -171, -30, F, 45);
  mb.spawn(-170, -4, F); mb.spawn(-172, -66, F);
}

function station(mb) {
  const y = 13.0, cx = -135, cz = -98;
  mb.vis('concreteDark', cx, y, cz, 66, 0.1, 54, { noao: 1, cast: false });
  mb.label('AURORA STATION', cx, y + 9, cz + 10.3, 0, 8, '#ff9a9a');
  const lab = mb.building({ x: cx, z: cz, w: 30, d: 20, floors: 2, fh: 3.8, base: y, mat: 'labWall', inMat: 'labIn', floorMat: 'tileFloor', doors: [{ side: 's', off: -6 }, { side: 'e' }, { side: 'w', off: 3 }, { side: 'n', off: 8 }], upperGaps: { s: [{ c: 6, w: 3, h: 2.4 }, { c: -9, w: 4, h: 3 }], n: [{ c: -5, w: 5, h: 3 }] }, roofAccess: true });
  mb.light(cx - 8, y + 2.6, cz, 0x9dffb0, 1.0, 12, 0.8); mb.light(cx + 8, y + 2.6, cz + 3, 0xff6a6a, 0.9, 12, 0.9);
  for (const dx of [-11, -5, 3, 9]) mb.box('techDark', cx + dx, y + 0.15, cz - 6, 2.4, 1.0, 1.2, { noao: 1 }), mb.vis('screenGreen', cx + dx, y + 1.2, cz - 6.3, 1.8, 0.8, 0.05, { noao: 1 });
  mb.pickup('weapon', 'pulse', cx - 4, cz + 3, y, 35); mb.pickup('cons', 'medkit', cx + 4, cz + 4, y, 25); mb.chest(cx + 12, cz - 6, y, 2, 3.14); mb.pickup('weapon', 'marksman', cx - 9, cz - 5, y + 3.8, 45); mb.pickup('shard', 'data', cx + 12, cz + 6, y + 3.8, 99999);
  // Gewächshaus-Kuppel
  mb.cyl('techWhite', cx - 24, y, cz + 14, 10.6, 0.8, { seg: 24, solid: true });
  mb.sph('glassDome', cx - 24, y + 0.8, cz + 14, 10, { half: 1 });
  mb.cyl('techWhite', cx - 24, y, cz + 14, 10.7, 0.15, { seg: 24, solid: false });
  for (let i = 0; i < 14; i++) { const a = mb.r(0, 6.28), r = mb.r(0, 8); mb.prop('bush', cx - 24 + Math.cos(a) * r, cz + 14 + Math.sin(a) * r, 1.6, 0, y + 0.8); }
  mb.light(cx - 24, y + 5, cz + 14, 0x8dff9a, 1.6, 20, 0.2); mb.glow(cx - 24, y + 5, cz + 14, 0x8dff9a, 14, 0.25);
  mb.col(cx - 24 - 10, y + 0.8, cz + 14 - 10, cx - 24 + 10, y + 1.0, cz + 14 + 10, { noray: 1, nowall: 1 });
  mb.pickup('power', 'jump', cx - 24, cz + 14, y + 0.8, 45); mb.pickup('weapon', 'hornet', cx - 20, cz + 10, y + 0.8, 30);
  // Antennenanlage
  mb.cyl('techWhite', cx + 22, y, cz - 14, 1.6, 0.9, { seg: 10 }); mb.anim('radar', { x: cx + 22, y: y + 0.9, z: cz - 14, big: 1 });
  for (let i = 0; i < 18; i++) { const t = 1 - i / 18; mb.vis('metal', cx + 18, y + i * 1.7, cz + 18, 2.4 * t + 0.3, 0.2, 0.2, { noao: 1 }); mb.vis('metal', cx + 18, y + i * 1.7, cz + 18, 0.2, 0.2, 2.4 * t + 0.3, { noao: 1 }); }
  mb.cyl('metal', cx + 17.4, y, cz + 17.4, 0.12, 30, { solid: false, seg: 5 }); mb.cyl('metal', cx + 18.6, y, cz + 18.6, 0.12, 30, { solid: false, seg: 5 });
  mb.col(cx + 16.8, y, cz + 16.8, cx + 19.2, y + 28, cz + 19.2); mb.glow(cx + 18, y + 31, cz + 18, 0xff2a2a, 5, 1); mb.light(cx + 18, y + 31, cz + 18, 0xff2a2a, 1.0, 14, 0.7);
  // Einsturzstelle
  for (let i = 0; i < 12; i++) mb.box('concrete', cx + 17 + mb.r(-5, 5), y, cz - 2 + mb.r(-4, 4), mb.r(1, 3.4), mb.r(0.5, 2.2), mb.r(1, 3), { ry: mb.r(0, 3), tile: 2 });
  mb.box('rust', cx + 20, y, cz + 2, 5, 1.2, 1, { rz: 0.3, solid: false, noao: 1 });
  for (let i = 0; i < 10; i++) mb.crate(cx + mb.r(-30, 30), cz + 22 + mb.r(-1, 1), y, mb.r(1, 1.5), 'militaryCrate');
  mb.fence(cx - 31, cz + 24, cx + 31, cz + 24, 2.4, 'metalDark'); mb.fence(cx - 31, cz - 26, cx + 31, cz - 26, 2.4, 'metalDark'); mb.fence(cx - 31, cz - 26, cx - 31, cz + 24, 2.4, 'metalDark');
  // Keller mit rotem Knopf
  const sh = mb.shaft({ x: -118, z: -78, surf: y });
  const F = sh.floorY;
  const bx0 = sh.hx0 - 26, bx1 = sh.hx0, bz0 = sh.exitZ - 8, bz1 = sh.exitZ + 8;
  mb.box('tileFloor', (bx0 + bx1) / 2, F - 0.6, (bz0 + bz1) / 2, bx1 - bx0 + 1, 0.6, bz1 - bz0 + 1, { tile: 4 });
  mb.box('labIn', (bx0 + bx1) / 2, F + 4.2, (bz0 + bz1) / 2, bx1 - bx0 + 1, 0.6, bz1 - bz0 + 1);
  mb.box('labIn', (bx0 + bx1) / 2, F, bz0 - 0.2, bx1 - bx0 + 1, 4.3, 0.4); mb.box('labIn', (bx0 + bx1) / 2, F, bz1 + 0.2, bx1 - bx0 + 1, 4.3, 0.4); mb.box('labIn', bx0 - 0.2, F, (bz0 + bz1) / 2, 0.4, 4.3, bz1 - bz0);
  mb.box('labIn', bx1 - 0.2, F, (bz0 + sh.hz0) / 2, 0.4, 4.3, sh.hz0 - bz0); mb.box('labIn', bx1 - 0.2, F, (bz1 + sh.hz1) / 2, 0.4, 4.3, bz1 - sh.hz1);
  for (let i = 0; i < 4; i++) {
    const tx = bx0 + 5 + i * 5, tz = bz0 + 4;
    mb.cyl('bioTank', tx, F, tz, 1.5, 3.6, { seg: 14, solid: true }); mb.light(tx, F + 2, tz, 0x66ff88, 0.9, 8, 0.3); mb.visc('metalDark', tx, F + 3.6, tz, 1.7, 0.3, { seg: 14 });
  }
  for (let i = 0; i < 3; i++) mb.box('techDark', bx1 - 6, F, bz1 - 3.5 - i * 3, 1.6, 1.0, 2.2, { noao: 1 });
  const px = bx0 + 3.5, pz = (bz0 + bz1) / 2 + 3;
  mb.box('techDark', px, F, pz, 2.2, 1.2, 2.2); mb.vis('glass', px, F + 1.2, pz, 2.0, 0.9, 2.0, { noao: 1 });
  mb.switchObj({ id: 'redButton', x: px + 1.2, y: F + 1.2, z: pz, ry: Math.PI / 2, kind: 'button', targets: [], label: 'ROTER KNOPF: NICHT DRÜCKEN!', event: 'lowgrav', color: 0xff2a2a });
  mb.cyl('redButtonCap', px, F + 1.2, pz, 0.45, 0.25, { solid: false, seg: 14 }); mb.glow(px, F + 1.6, pz, 0xff2a2a, 3, 0.9); mb.light(px, F + 2.2, pz, 0xff2a2a, 1.6, 9, 0.4);
  mb.label('NICHT DRÜCKEN', px, F + 3.0, bz0 + 0.3, 0, 4.4, '#ff4d4d');
  mb.light((bx0 + bx1) / 2, F + 3.6, (bz0 + bz1) / 2, 0xcfffe0, 1.0, 16); mb.vis('lamp', (bx0 + bx1) / 2, F + 4.1, (bz0 + bz1) / 2, 6, 0.08, 0.6, { noao: 1 });
  mb.chest(bx0 + 3, bz0 + 3, F, 3, 0.5); mb.pickup('weapon', 'stormcaller', bx0 + 14, bz1 - 3, F, 70); mb.pickup('shard', 'data', bx0 + 2, bz1 - 2, F, 99999); mb.pickup('cons', 'shieldpot', bx0 + 10, bz1 - 2, F, 25);
  for (const [x, z] of [[cx - 4, cz - 22], [cx + 24, cz + 14], [cx - 30, cz - 10], [cx + 6, cz + 20]]) mb.spawn(x, z, y);
  mb.pickup('weapon', 'striker', cx + 24, cz + 20, y, 30); mb.pickup('ammo', 'light', cx - 14, cz + 21, y); mb.pickup('gadget', 'scanner', cx + 20, cz - 4, y, 60);
}

function meadow(mb) {
  const T = (x, z) => terrainY(x, z);
  // Windturbinen
  const turbines = [[-30, 8], [-12, 32], [40, 6], [58, 28], [20, 50], [-40, 52]];
  for (const [x, z] of turbines) {
    const y = T(x, z);
    mb.cyl('turbineWhite', x, y - 0.3, z, 1.2, 38, { r2: 0.6, seg: 12, tile: 8 });
    mb.vis('turbineWhite', x + 1.2, y + 37.2, z, 3.2, 1.6, 1.6, { noao: 1 });
    mb.anim('turbine', { x: x + 2.9, y: y + 37.6, z, r: 17 });
    mb.glow(x, y + 38.8, z, 0xff2a2a, 3, 0.8);
  }
  // Solarfeld
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) {
    const x = 6 + j * 4.4, z = 70 + i * 6, y = T(x, z);
    mb.vis('solar', x, y + 1.35, z, 3.8, 0.12, 2.6, { rx: -0.5, noao: 1 }); mb.col(x - 1.9, y, z - 0.9, x + 1.9, y + 1.9, z + 0.9);
    mb.vis('metal', x, y, z + 0.3, 0.1, 1.2, 0.1, { noao: 1 });
  }
  // Scheune
  const bx = 62, bz = 8, by = T(bx, bz);
  const barn = mb.building({ x: bx, z: bz, w: 18, d: 13, floors: 1, fh: 6, base: by, mat: 'barnRed', inMat: 'woodIn', stairs: false, parapet: false, floorMat: 'plank', doors: [{ side: 's', off: 0, w: 5, h: 4.4 }, { side: 'w', w: 3 }], roofMat: 'woodRoof' });
  mb.gable('woodRoof', bx, barn.top, bz, 18, 13, 3.6);
  mb.box('hay', bx + 5, by, bz - 3, 3, 3.6, 3, { tile: 1.5 }); mb.box('hay', bx + 5, by + 3.6, bz - 3.5, 3, 2.4, 2, { tile: 1.5 }); mb.box('hay', bx - 5, by, bz - 3, 2.4, 1.5, 2.4, { tile: 1.5 });
  mb.pickup('weapon', 'breaker', bx - 2, bz, by, 35); mb.chest(bx + 6, bz + 3, by, 2, 3.14); mb.pickup('cons', 'medkit', bx - 6, bz + 3, by, 25); mb.pickup('weapon', 'striker', bx + 2, bz + 3, by + 5.9 * 0, 30);
  for (let i = 0; i < 7; i++) { const x = bx + mb.r(-22, 22), z = bz + 14 + mb.r(0, 8); mb.cyl('hay', x, T(x, z), z, 1.0, 1.1, { rx: 1.5708, solid: false, seg: 10 }); mb.col(x - 1, T(x, z), z - 1, x + 1, T(x, z) + 1.1, z + 1); }
  // Kapelle
  const kx = 30, kz = 44, ky = T(kx, kz);
  const ch = mb.building({ x: kx, z: kz, w: 10, d: 14, floors: 1, fh: 6, base: ky, mat: 'rockBrick', inMat: 'rockBrickIn', stairs: false, parapet: false, floorMat: 'tileFloor', doors: [{ side: 's', w: 3, h: 3.8 }], roofMat: 'woodRoof', upperGaps: {} });
  mb.gable('woodRoof', kx, ch.top, kz, 10, 14, 3.4, false);
  mb.box('rockBrick', kx, ch.top + 0.2, kz + 5.6, 3, 6.2, 3, { tile: 3 });
  mb.vis('glow', kx, ky + 3.2, kz - 7.02, 2, 3.4, 0.05, { noao: 1 }); mb.light(kx, ky + 3, kz - 5, 0xffb060, 1.6, 12, 0.4);
  mb.chest(kx, kz - 5.2, ky, 3, 0); mb.pickup('shard', 'data', kx, kz + 2, ky, 99999); mb.pickup('weapon', 'magnum', kx - 3, kz, ky, 35);
  mb.label('ALTE KAPELLE', kx, ky + 5, kz + 7.2, 0, 3, '#ffd9a0');
  // Brunnen & Vogelscheuche
  mb.cyl('rockBrick', 14, T(14, 26) - 0.2, 26, 1.6, 1.4, { seg: 12 }); mb.vis('plank', 14, T(14, 26) + 2.2, 26, 0.2, 1.8, 2.8, { noao: 1 });
  mb.vis('wood', -4, T(-4, 22), 22, 0.15, 2.6, 0.15, { noao: 1 }); mb.vis('wood', -4, T(-4, 22) + 1.9, 22, 2.2, 0.15, 0.15, { noao: 1 }); mb.vis('hay', -4, T(-4, 22) + 2.3, 22, 0.6, 0.6, 0.6, { noao: 1 });
  // Aussichtspunkt mit Bank
  mb.box('wood', 46, T(46, -22) + 0.0, -22, 2.4, 0.5, 0.7, { noao: 1 }); mb.lamp(48, -22, T(48, -22), 4.5);
  for (const [x, z] of [[8, 0], [-10, 20], [20, 10], [50, 40], [-20, 70], [30, 80], [-30, 38], [60, -20]]) mb.spawn(x, z, T(x, z));
  mb.pickup('weapon', 'striker', 8, 14, T(8, 14), 30); mb.pickup('weapon', 'hornet', -20, 40, T(-20, 40), 30); mb.pickup('weapon', 'pulse', 48, 18, T(48, 18), 35); mb.pickup('weapon', 'marksman', 20, 60, T(20, 60), 40);
  mb.pickup('ammo', 'light', 0, 30, T(0, 30)); mb.pickup('ammo', 'energy', 38, 20, T(38, 20)); mb.pickup('cons', 'medkit', -6, 6, T(-6, 6), 25); mb.pickup('cons', 'shieldpot', 30, 60, T(30, 60), 25);
  mb.pickup('cons', 'grenade', 14, 40, T(14, 40)); mb.pickup('cons', 'smoke', -24, 20, T(-24, 20)); mb.pickup('power', 'speed', 6, 46, T(6, 46), 45); mb.pickup('gadget', 'grapple', -2, 54, T(-2, 54), 60);
  mb.pickup('shard', 'data', 60, 58, T(60, 58), 99999); mb.pickup('shard', 'data', -50, 50, T(-50, 50), 99999);
  mb.pad(-6, 66, T(-6, 66), 18, 2, -3, 1.7);
  // Teleporter-Paar Wiese <-> Küste
  mb.tele.push({ id: 't3', x: 44, z: 50, y: T(44, 50), to: { x: 40, z: 126, y: 0.8 }, color: 0x5ad7ff });
  mb.tele.push({ id: 't4', x: 40, z: 126, y: 0.8, to: { x: 44, z: 50, y: T(44, 50) }, color: 0x5ad7ff });
}

function roads(mb) {
  mb.ribbon('asphalt', [[0, -36], [0, -10], [3, 20], [0, 50], [0, 80], [0, 100]], 9);
  mb.ribbon('roadLine', [[0, -36], [0, -10], [3, 20], [0, 50], [0, 80], [0, 100]], 0.18, { off: 0.1 });
  mb.ribbon('asphalt', [[72, -100], [100, -88], [128, -84]], 8);
  mb.ribbon('asphalt', [[38, -40], [60, -10], [76, 8], [95, 14]], 8);
  mb.ribbon('dirtRoad', [[0, 40], [-30, 36], [-60, 34], [-90, 40], [-104, 48]], 5);
  mb.ribbon('dirtRoad', [[-72, -100], [-100, -100], [-118, -90], [-135, -80]], 6);
  mb.ribbon('asphalt', [[-76, 106], [-90, 104], [-112, 100]], 7);
  mb.ribbon('dirtRoad', [[-100, 20], [-125, 6], [-150, 2]], 4);
  mb.ribbon('dirtRoad', [[-60, 14], [-90, -14], [-135, -50]], 4);
  mb.ribbon('dirtRoad', [[8, 60], [40, 56], [62, 20]], 4);
  mb.ribbon('dirtRoad', [[95, 74], [70, 90], [40, 100]], 6);
  // Freileitung entlang der Hauptstraße
  for (let z = -30; z < 96; z += 22) {
    const x = -6.5, y = terrainY(x, z);
    mb.cyl('wood', x, y, z, 0.18, 9, { solid: false, seg: 6 }); mb.vis('wood', x, y + 8.4, z, 3.2, 0.14, 0.14, { noao: 1 }); mb.col(x - 0.2, y, z - 0.2, x + 0.2, y + 9, z + 0.2);
  }
}
