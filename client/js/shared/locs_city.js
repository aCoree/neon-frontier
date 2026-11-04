// Neon Heights (Stadt), U-Bahn, Saltwind Bay (Küste) und Proving Grounds (Training).
const B = 0.4; // Stadt-Plateauhöhe

export function buildCityArea(mb) {
  city(mb);
  subway(mb);
  coast(mb);
  training(mb);
}

function city(mb) {
  const R = { y: B + 0.04 };
  mb.road(-72, -100, 72, -100, 12, R); mb.road(0, -162, 0, -38, 12, R);
  mb.road(-72, -135, 72, -135, 8, R); mb.road(-72, -65, 72, -65, 8, R);
  mb.road(-35, -162, -35, -38, 8, R); mb.road(35, -162, 35, -38, 8, R);
  // Gehwege / Bordstein-Flächen für optische Tiefe
  for (const [x, z, w, d] of [[-55, -150, 30, 20], [55, -150, 30, 20], [-19, -150, 26, 20], [19, -150, 26, 20]])
    mb.vis('sidewalk', x, B, z, w, 0.14, d, { noao: 1, cast: false });

  // Gebäude
  const door = (...s) => s.map(side => ({ side }));
  const T1 = mb.tower({ x: -19, z: -150, w: 22, d: 20, floors: 6, base: B, mat: 'facadeA', height: 62, towerMat: 'glassTower', neon: 'neonCyan', doors: door('s', 'e', 'w') });
  const T2 = mb.tower({ x: 19, z: -150, w: 22, d: 20, floors: 6, base: B, mat: 'facadeB', height: 78, towerMat: 'glassTower', neon: 'neonPink', doors: door('s', 'w', 'e'), shift: 0 });
  mb.building({ x: -55, z: -150, w: 24, d: 18, floors: 4, base: B, mat: 'brick', doors: door('s', 'e') });
  mb.building({ x: 55, z: -150, w: 24, d: 18, floors: 3, base: B, mat: 'facadeB', doors: door('s', 'w') });
  mb.building({ x: -19, z: -118, w: 22, d: 22, floors: 3, base: B, mat: 'brick', doors: door('n', 's', 'e') });
  mb.building({ x: 19, z: -118, w: 22, d: 22, floors: 4, base: B, mat: 'facadeA', doors: door('n', 's', 'w') });
  mb.building({ x: -54, z: -118, w: 26, d: 22, floors: 3, base: B, mat: 'facadeB', doors: door('n', 's', 'e') });
  mb.building({ x: 54, z: -118, w: 26, d: 22, floors: 5, base: B, mat: 'facadeA', doors: door('n', 's', 'w') });
  // Nexus Tower mit Panorama-Aufzug
  const NX = -52, NZ = -80;
  const nx = mb.tower({ x: NX, z: NZ, w: 22, d: 20, floors: 5, base: B, mat: 'facadeA', height: 44, towerMat: 'glassTower', neon: 'neonCyan', tiers: [{ h: 22, s: 0.78 }, { h: 14, s: 0.5 }, { h: 8, s: 0.28 }], doors: door('s', 'e', 'n') });
  const deckY = nx.top + 22;
  const ex = NX - 11 - 4, ez = NZ;
  mb.mover({ x: ex, z: ez, w: 3.6, d: 3.6, y0: B, y1: deckY - 0.4, speed: 4.2, pause: 4, mat: 'techWhite' });
  for (const [a, b] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) mb.box('metalDark', ex + a, B, ez + b, 0.25, deckY + 3, 0.25, { noao: 1 });
  mb.vis('glassClear', ex, B + 0.5, ez + 1.95, 4, deckY, 0.06, { noao: 1 });
  mb.vis('glassClear', ex - 1.95, B + 0.5, ez, 0.06, deckY, 4, { noao: 1 });
  mb.box('metalDark', ex, deckY + 3, ez, 4.2, 0.3, 4.2, { noao: 1 });
  const bx = -52 - 22 * 0.78 / 2;
  mb.box('techWhite', (bx + ex + 1.8) / 2, deckY - 0.4, ez, bx - (ex + 1.8) + 0.4, 0.4, 3.4, { noao: 1 });
  mb.box('neonCyan', (bx + ex + 1.8) / 2, deckY - 0.45, ez, Math.abs(bx - (ex + 1.8)) + 0.2, 0.08, 3.6, { solid: false, noao: 1 });
  for (const sg of [-1, 1]) mb.box('metalDark', (bx + ex + 1.8) / 2, deckY, ez + sg * 1.65, Math.abs(bx - (ex + 1.8)), 1.1, 0.12, { noao: 1 });
  // Geländer auf dem Deck
  const dw = 22 * 0.78, dd = 20 * 0.78;
  for (const sg of [-1, 1]) {
    mb.box('metalDark', NX, deckY, NZ + sg * dd / 2, dw, 1.1, 0.14, { noao: 1 });
    mb.box('metalDark', NX + sg * dw / 2, deckY, NZ, 0.14, 1.1, dd, { noao: 1 });
  }
  mb.label('NEXUS TOWER', NX, deckY - 8, NZ + 10.2, 0, 7, '#7ee8ff');
  mb.pickup('weapon', 'longshot', NX + 3, NZ + 2, deckY, 45);
  mb.pickup('cons', 'shieldpot', NX - 3, NZ - 2, deckY, 30);
  mb.pickup('gadget', 'scanner', NX, NZ - 4, deckY, 60);
  mb.chest(NX - 5, NZ + 3, deckY, 2, 0);
  mb.spawn(ex - 3, ez + 5);

  mb.building({ x: -19, z: -82, w: 22, d: 22, floors: 2, base: B, mat: 'stuccoWhite', baseMat: 'shop', doors: door('n', 's', 'w') });
  const H = mb.building({ x: 19, z: -82, w: 22, d: 22, floors: 6, base: B, mat: 'facadeA', baseMat: 'shop', doors: door('n', 's', 'e'), roofAccess: true });
  mb.light(19, H.top + 3, -82, 0xff4488, 1.2, 18);
  mb.pickup('weapon', 'marksman', 19, -82 + 6, H.top, 40);
  mb.building({ x: 54, z: -82, w: 26, d: 20, floors: 3, base: B, mat: 'brick', doors: door('n', 'w', 's') });
  mb.building({ x: -19, z: -48, w: 22, d: 16, floors: 3, base: B, mat: 'stuccoWhite', doors: door('n', 's') });
  mb.building({ x: 19, z: -48, w: 22, d: 16, floors: 2, base: B, mat: 'brick', doors: door('n', 's') });

  // Neonschilder
  const sign = (x, y, z, w, h, mat, axis, text, col) => {
    mb.vis(mat, x, y, z, axis === 'x' ? w : 0.25, h, axis === 'x' ? 0.25 : w, { noao: 1 });
    mb.glow(x, y + h / 2, z, col, Math.max(w, h) * 1.4, 0.5);
    if (text) mb.label(text, x, y + h / 2, z + (axis === 'x' ? 0.2 : 0), axis === 'x' ? 0 : Math.PI / 2, Math.min(w * 0.8, 6), '#ffffff');
  };
  sign(-19, B + 9, -106.8, 9, 2, 'neonPink', 'x', 'CYBER BAR', 0xff3da8);
  sign(19, B + 11, -106.8, 9, 2, 'neonCyan', 'x', 'DATA HUB', 0x3de0ff);
  sign(-19, B + 7, -93.2, 8, 1.8, 'neonOrange', 'x', 'RAMEN 24H', 0xffa03d);
  sign(54, B + 8, -106.8, 8, 2, 'neonGreen', 'x', 'ARCADE', 0x3dff88);

  // Plaza
  mb.vis('sidewalk', 0, B, -100, 30, 0.16, 30, { noao: 1, cast: false });
  mb.cyl('concrete', 0, B, -100, 5.6, 0.9, { seg: 24, tile: 4 });
  mb.visc('neonCyan', 0, B + 0.88, -100, 4.9, 0.05, { seg: 24 });
  mb.cyl('metal', 0, B, -100, 0.7, 5.5, { seg: 10 });
  mb.anim('holo', { x: 0, y: B + 8.4, z: -100, color: 0x55eaff });
  mb.glow(0, B + 3, -100, 0x55eaff, 8, 0.4); mb.light(0, B + 6, -100, 0x55eaff, 1.6, 26);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; mb.box('wood', Math.cos(a) * 9.5, B + 0.16, -100 + Math.sin(a) * 9.5, 2.4, 0.5, 0.8, { ry: -a + Math.PI / 2 }); }
  mb.label('NEON HEIGHTS', 0, B + 10.5, -100, 0, 7, '#7ee8ff');
  for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 1) continue; mb.lamp(i * 11, -106.6, B); mb.lamp(i * 11, -93.4, B); }
  for (let i = 0; i < 9; i++) { mb.lamp(6.6, -160 + i * 14, B); mb.lamp(-6.6, -160 + i * 14, B); }
  // Autos & Deckung
  const cars = [[-28, -97, 'carRed'], [22, -103, 'carBlue'], [40, -102.5, 'carWhite'], [-14, -103, 'carYellow'], [3, -120, 'carBlack', true], [-3.2, -78, 'carRed', true], [3.1, -150, 'carWhite', true], [-45, -97, 'carBlue'], [60, -97, 'carRed'], [-61, -103, 'carWhite']];
  for (const [x, z, c, r] of cars) mb.car(x, z, B, c, !!r);
  for (const [x, z, r] of [[-8, -92, 0], [8, -108, 0], [-8, -108, 0], [8, -92, 0], [0, -86, 1], [0, -114, 1], [-33, -100, 1], [33, -100, 1]]) mb.jersey(x, z, B, !!r);
  for (const [x, z] of [[-62, -134], [62, -136], [-33, -64], [33, -66], [-30, -160], [30, -158]]) { mb.crate(x, z, B, 1.3); mb.crate(x + 1.4, z, B, 1.2); mb.crate(x + 0.5, z, B + 1.2, 1.1); }
  for (const [x, z] of [[-45, -142], [46, -143], [-66, -108], [66, -108], [-2, -43], [10, -140]]) mb.prop('bush', x, z, 1.2, 0);
  // Pickups
  mb.pickup('weapon', 'striker', 6, -108, undefined, 30); mb.pickup('weapon', 'hornet', -27, -134, undefined, 30);
  mb.pickup('weapon', 'breaker', 45, -134, undefined, 35); mb.pickup('ammo', 'light', -6, -92, undefined, 20); mb.pickup('ammo', 'shells', 12, -66);
  mb.pickup('cons', 'medkit', -8, -108, undefined, 25); mb.pickup('cons', 'shieldpot', 30, -92, undefined, 25); mb.pickup('cons', 'grenade', -44, -100); mb.pickup('cons', 'smoke', 40, -66);
  mb.pickup('power', 'speed', 0, -127, undefined, 45); mb.pickup('weapon', 'magnum', -60, -66, undefined, 35);
  mb.pickup('ammo', 'energy', 62, -135); mb.pickup('gadget', 'jetpack', -9.2, -150, T1.top, 60); mb.pickup('power', 'barrier', 28.8, -150, T2.top, 60);
  mb.pickup('cons', 'medkit', -28.8, -150, T1.top, 30);
  // Dachzugänge: Sprungplattformen zur Nexus-Stadt
  mb.pad(-6, -42, B, 19, 0, 0, 1.7);
  mb.pad(70, -100, B, 21, -3, 0, 1.7);
  for (const [x, z] of [[0, -100], [-45, -102], [45, -98], [-19, -90], [19, -112], [-30, -150], [30, -125], [-50, -62], [58, -64], [0, -60], [-60, -130], [60, -140]]) mb.spawn(x, z, B);
  // Geheimnis: Hinterhof-Kiste hinter der Ramen-Bar
  mb.chest(-26, -92.5, B, 1, 0);
  mb.pickup('shard', 'data', -62, -90.5, B, 99999);
  mb.pickup('shard', 'data', 66, -150, B + 0.01, 99999);
}

function subway(mb) {
  const F = -8.6, hallZ0 = -60, hallZ1 = -44, cz = (hallZ0 + hallZ1) / 2;
  const sE = mb.shaft({ x: 58, z: cz, surf: B });
  const sW = mb.shaft({ x: -58, z: cz, surf: B, flip: true });
  const x0 = sW.hx1, x1 = sE.hx0; // Halle zwischen den Schächten
  const len = x1 - x0, cx = (x0 + x1) / 2, H = 4.4;
  mb.box('concreteDark', cx, F - 0.6, cz, len + 1, 0.6, hallZ1 - hallZ0 + 1);
  mb.box('concrete', cx, F, hallZ0 - 0.2, len + 1, H + 0.4, 0.4);
  mb.box('concrete', cx, F, hallZ1 + 0.2, len + 1, H + 0.4, 0.4);
  mb.box('concreteDark', cx, F + H, cz, len + 1, 0.5, hallZ1 - hallZ0 + 1);
  // Stirnwände neben den Schachtausgängen
  for (const [xx, sh] of [[x1 - 0.2, sE], [x0 + 0.2, sW]]) {
    mb.box('concrete', xx, F, (hallZ0 + sh.hz0) / 2, 0.4, H, sh.hz0 - hallZ0);
    mb.box('concrete', xx, F, (hallZ1 + sh.hz1) / 2, 0.4, H, hallZ1 - sh.hz1);
  }
  // Bahnsteige (flach, begehbar) & Gleisbett
  mb.box('tileFloor', cx, F, hallZ0 + 3, len, 0.45, 6, { tile: 4 });
  mb.box('tileFloor', cx, F, hallZ1 - 3, len, 0.45, 6, { tile: 4 });
  mb.vis('rust', cx, F + 0.02, cz, len, 0.06, 1.5, { noao: 1 }); mb.vis('rust', cx, F + 0.02, cz - 2, len, 0.06, 0.2, { noao: 1 }); mb.vis('rust', cx, F + 0.02, cz + 2, len, 0.06, 0.2, { noao: 1 });
  // Züge (Deckung)
  for (const [a, b] of [[-36, -12], [14, 38]]) {
    mb.box('trainBody', (a + b) / 2, F + 0.3, cz, b - a, 3.4, 3.2, { tile: 6 });
    mb.vis('neonCyan', (a + b) / 2, F + 2.4, cz - 1.62, b - a - 1, 0.5, 0.05, { noao: 1 });
    mb.vis('neonCyan', (a + b) / 2, F + 2.4, cz + 1.62, b - a - 1, 0.5, 0.05, { noao: 1 });
    mb.vis('neonOrange', a + 0.05, F + 1.0, cz, 0.1, 0.6, 1.2, { noao: 1 });
  }
  // Pfeiler, Lampen
  for (let x = x0 + 8; x < x1 - 4; x += 8) {
    for (const z of [hallZ0 + 6.4, hallZ1 - 6.4]) mb.box('concrete', x, F, z, 0.8, H, 0.8);
    mb.vis('lamp', x, F + H - 0.1, cz, 0.4, 0.1, 10, { noao: 1 });
    if (((x - x0) / 8) % 2 === 0) mb.light(x, F + H - 0.8, cz, 0xcfe8ff, 1.1, 14);
  }
  for (let x = x0 + 4; x < x1; x += 14) { mb.vis('neonCyan', x, F + 3.1, hallZ0 + 0.08, 4, 0.12, 0.05, { noao: 1 }); mb.vis('neonPink', x + 7, F + 3.1, hallZ1 - 0.08, 4, 0.12, 0.05, { noao: 1 }); }
  mb.label('CENTRAL STATION', cx - 20, F + 3.4, hallZ0 + 0.1, 0, 5, '#ffffff'); mb.label('CENTRAL STATION', cx + 20, F + 3.4, hallZ1 - 0.1, Math.PI, 5, '#ffffff');
  for (const x of [-48, -24, 0, 24, 48]) { mb.box('wood', x, F + 0.45, hallZ0 + 1.2, 2.4, 0.5, 0.7, { noao: 1 }); mb.box('wood', x + 4, F + 0.45, hallZ1 - 1.2, 2.4, 0.5, 0.7, { noao: 1 }); }
  mb.box('techDark', 4, F + 0.45, hallZ1 - 0.9, 1.2, 2, 0.9, { noao: 1 }); mb.vis('neonCyan', 4, F + 1.6, hallZ1 - 0.44, 0.9, 0.7, 0.04, { noao: 1 });
  // Geheimer Tresorraum nördlich (Hebel am Westende)
  const vx = -4, vz0 = hallZ0 - 11;
  const d = mb.door({ id: 'subvault', x: vx, y: F + 0.45, z: hallZ0 - 0.2, w: 3.4, h: 3.0, d: 0.5, mat: 'techDark', locked: true });
  mb.box('concreteDark', vx, F - 0.6, vz0 + 5.5, 14, 0.6, 11);
  mb.box('concrete', vx, F, vz0 - 0.2, 14.8, H, 0.4); mb.box('concrete', vx - 7.2, F, vz0 + 5.5, 0.4, H, 11); mb.box('concrete', vx + 7.2, F, vz0 + 5.5, 0.4, H, 11);
  mb.box('concreteDark', vx, F + H, vz0 + 5.5, 15, 0.5, 11.4);
  mb.box('concrete', vx - 4.4, F, hallZ0 - 0.2, 5.4, H, 0.4); mb.box('concrete', vx + 4.4, F, hallZ0 - 0.2, 5.4, H, 0.4); mb.box('concrete', vx, F + 3.45, hallZ0 - 0.2, 3.4, H - 3.45, 0.4);
  mb.chest(vx - 3, vz0 + 3, F, 3, 0.5); mb.chest(vx + 3, vz0 + 3, F, 3, -0.5);
  mb.pickup('weapon', 'stormcaller', vx, vz0 + 8, F, 80); mb.pickup('power', 'barrier', vx - 4, vz0 + 8, F, 60); mb.pickup('shard', 'data', vx + 4, vz0 + 8, F, 99999);
  mb.light(vx, F + 3.4, vz0 + 5.5, 0xffd27a, 1.4, 14); mb.vis('lampWarm', vx, F + H - 0.1, vz0 + 5.5, 4, 0.1, 0.6, { noao: 1 });
  mb.label('VAULT 7', vx, F + 3.1, hallZ0 - 0.5, 0, 3, '#ffd27a');
  mb.switchObj({ id: 'subLever', x: x0 + 6, y: F + 0.45, z: hallZ0 + 0.3, ry: 0, kind: 'lever', targets: ['subvault'], label: 'Hebel ziehen', color: 0xffc04d });
  mb.pickup('weapon', 'pulse', 30, cz + 4.5, F + 0.45, 40); mb.pickup('cons', 'medkit', -30, cz + 6, F + 0.45, 25); mb.pickup('ammo', 'energy', -2, cz - 6, F + 0.45, 30);
  mb.pickup('weapon', 'hornet', 46, cz, F, 30); mb.pickup('weapon', 'breaker', -46, cz, F, 35);
  mb.spawn(-30, cz + 6, F + 0.45); mb.spawn(30, cz - 6, F + 0.45);
  mb.tele.push({ id: 't1', x: 0, z: cz + 6, y: F + 0.45, to: { x: 0, z: -138, y: B }, color: 0xb36bff });
  mb.tele.push({ id: 't2', x: 0, z: -138, y: B, to: { x: 0, z: cz + 6, y: F + 0.45 }, color: 0xb36bff });
}

function coast(mb) {
  const y = 0.8;
  mb.road(-80, 106, 80, 106, 9, { y: y + 0.04, mat: 'asphalt' });
  mb.vis('plank', 0, y, 131, 150, 0.16, 6, { noao: 1, cast: false, tile: 3 });
  const colors = ['stuccoWhite', 'stuccoBlue', 'stuccoYellow', 'stuccoPink'];
  const house = (x, z, w, d, i, floors = 2) => {
    const b = mb.building({ x, z, w, d, floors, fh: 3.4, base: y, mat: colors[i % 4], parapet: false, stairs: false, doors: [{ side: z < 106 ? 's' : 'n' }, { side: 'e', off: 0 }], roofMat: 'tile' });
    mb.gable('tile', x, b.top, z, w, d, 2.2);
    mb.vis('wood', x, y + 2.4, z + (z < 106 ? d / 2 + 0.7 : -d / 2 - 0.7), 3, 0.15, 1.2, { noao: 1 });
  };
  [-64, -46, -28, 26, 44, 62].forEach((x, i) => house(x, 94, 12, 11, i));
  [-62, -44, 40, 60].forEach((x, i) => house(x, 118, 11, 10, i + 2));
  // Taverne
  const tv = mb.building({ x: 0, z: 94, w: 22, d: 13, floors: 2, fh: 3.6, base: y, mat: 'stuccoYellow', parapet: false, doors: [{ side: 's' }, { side: 'n' }], roofMat: 'tile', roofAccess: true });
  mb.gable('tile', 0, tv.top, 94, 22, 13, 2.8);
  mb.label('TAVERNE ZUM ROTEN ANKER', 0, y + 3.2, 100.7, 0, 6, '#ffd27a');
  mb.pickup('weapon', 'breaker', 0, 94, y, 30); mb.pickup('cons', 'medkit', 5, 92, y, 25); mb.chest(-7, 93, y, 2, 0.2);
  // Leuchtturm
  const LX = 58, LZ = 138;
  const lh = mb.building({ x: LX, z: LZ, w: 11, d: 11, floors: 8, fh: 3.8, base: y, mat: 'lighthouse', baseMat: 'lighthouse', parapet: true, stairs: true, roofAccess: true, tile: 8, doors: [{ side: 'n' }], lamps: true });
  const topY = lh.top;
  mb.box('metalDark', LX, topY + 1.0, LZ, 6.2, 0.4, 6.2, { noao: 1 });
  mb.vis('glassLantern', LX, topY + 1.4, LZ, 5, 3.2, 5, { noao: 1 });
  mb.vis('lighthouse', LX, topY + 4.6, LZ, 6, 0.5, 6, { noao: 1 });
  mb.cyl('metalDark', LX, topY + 5.0, LZ, 0.2, 2.5, { solid: false });
  mb.anim('beacon', { x: LX, y: topY + 3, z: LZ, color: 0xfff0b0 });
  mb.light(LX, topY + 3, LZ, 0xfff0b0, 2.2, 38, 0.2);
  mb.pickup('weapon', 'longshot', LX + 3.5, LZ + 3.5, topY, 50);
  mb.secretSpots.push({ id: 'duck', x: LX - 3.5, y: topY, z: LZ - 3.5 });
  mb.label('SALTWIND', LX, y + 20, LZ - 5.7, Math.PI, 3.2, '#ffffff');
  // Mole
  const px = 12;
  mb.box('plank', px, 0.35, 160, 5, 0.25, 50, { tile: 3 });
  for (let z = 138; z <= 184; z += 4) for (const s of [-2.2, 2.2]) mb.vis('wood', px + s, -4, z, 0.4, 4.6, 0.4, { noao: 1 });
  mb.box('plank', px, 0.35, 184, 13, 0.25, 6, { tile: 3 });
  mb.box('wood', px - 4, 0.6, 164, 1.4, 1, 1.4, { noao: 1 });
  mb.chest(px + 1, 184, 0.6, 2, 0);
  mb.pickup('shard', 'data', px - 5, 185, 0.6, 99999);
  mb.pickup('cons', 'grenade', px, 150, 0.6, 30); mb.pickup('weapon', 'marksman', px, 176, 0.6, 40);
  mb.lamp(px - 2.2, 145, 0.5, 5.5); mb.lamp(px + 2.2, 165, 0.5, 5.5); mb.lamp(px - 2.2, 180, 0.5, 5.5);
  // Boote
  const boat = (x, z, ry, c) => {
    mb.box(c, x, -0.4, z, 3.4, 1.0, 9, { tile: 3 });
    mb.vis('wood', x, 0.6, z - 1, 2.8, 0.15, 6, { noao: 1 });
    mb.box('techWhite', x, 0.7, z + 1.5, 2.4, 1.8, 2.4, { noao: 1 });
  };
  boat(-4, 160, 0, 'stuccoBlue'); boat(24, 170, 0, 'containerRed'); boat(-22, 176, 0, 'containerYellow');
  // Strand-Deko
  for (let i = 0; i < 9; i++) {
    const x = -52 + i * 13 + mb.r(-3, 3), z = 139 + mb.r(-1, 2);
    mb.cyl('metal', x, y, z, 0.07, 2.4, { solid: false, seg: 5 }); mb.cyl(i % 2 ? 'umbrellaA' : 'umbrellaB', x, y + 2.1, z, 2.0, 0.5, { r2: 0.1, solid: false, seg: 10 });
    mb.vis('towel', x + 1.4, y + 0.03, z + 0.5, 0.9, 0.05, 1.9, { noao: 1 });
  }
  mb.box('wood', -30, y, 128, 3, 0.6, 1, { tile: 1 });
  for (const x of [-60, 52]) { mb.vis('wood', x, y, 142, 0.18, 2.2, 0.18, { noao: 1 }); mb.vis('wood', x + 8, y, 142, 0.18, 2.2, 0.18, { noao: 1 }); mb.vis('towel', x + 4, y + 1.6, 142, 8, 0.8, 0.04, { noao: 1 }); }
  for (let i = 0; i < 12; i++) mb.lamp(-66 + i * 12, 128.5, y, 4.6);
  for (const [x, z] of [[-10, 108], [16, 104], [-34, 110], [38, 110]]) mb.car(x, z, y + 0.04, ['carWhite', 'carBlue', 'carYellow', 'carRed'][Math.abs(x) % 4], false);
  [[-55, 128], [-20, 126], [20, 128], [48, 126], [-8, 112]].forEach(([x, z]) => mb.spawn(x, z, y));
  mb.pickup('weapon', 'magnum', -38, 130, y, 35); mb.pickup('weapon', 'pulse', -20, 100, y, 35); mb.pickup('ammo', 'light', 30, 108, y);
  mb.pickup('cons', 'shieldpot', 8, 128, y, 25); mb.pickup('power', 'jump', -52, 132, y, 45); mb.pickup('ammo', 'sniper', 40, 134, y, 35); mb.pickup('shard', 'data', -72, 136, y, 99999);
  mb.pad(-70, 110, y, 18, 4, 0, 1.6);
}

function training(mb) {
  const cx = -112, cz = 96, y = 0.9;
  mb.vis('concreteDark', cx, y, cz, 52, 0.12, 40, { noao: 1, cast: false });
  mb.label('PROVING GROUNDS', cx, y + 6, cz - 21, 0, 9, '#ffa94d');
  // Zaun
  mb.fence(cx - 27, cz - 21, cx + 27, cz - 21, 3, 'metalDark'); mb.fence(cx - 27, cz + 21, cx + 27, cz + 21, 3, 'metalDark');
  mb.fence(cx - 27, cz - 21, cx - 27, cz + 21, 3, 'metalDark'); mb.fence(cx + 27, cz - 21, cx + 27, cz - 4, 3, 'metalDark'); mb.fence(cx + 27, cz + 4, cx + 27, cz + 21, 3, 'metalDark');
  // Schießbahnen: Wand + Zielscheiben
  mb.box('concrete', cx, y, cz - 18, 40, 4, 1, { tile: 3 });
  for (let i = 0; i < 7; i++) {
    const x = cx - 18 + i * 6;
    mb.cyl('targetBoard', x, y + 1.2, cz - 17.4, 1.0, 0.1, { rx: Math.PI / 2, solid: false, seg: 16 });
    mb.vis('metalDark', x, y, cz - 17.5, 0.15, 1.2, 0.15, { noao: 1 });
  }
  // Waffenregal
  mb.box('metalDark', cx, y, cz + 14, 40, 1.0, 0.8, { noao: 1 });
  mb.vis('neonOrange', cx, y + 1.0, cz + 14, 40, 0.06, 0.8, { noao: 1 });
  const ws = ['viper', 'magnum', 'striker', 'hornet', 'breaker', 'marksman', 'longshot', 'stormcaller', 'pulse', 'lancer', 'blade'];
  ws.forEach((w, i) => mb.pickup('weapon', w, cx - 18 + i * 3.6, cz + 12.6, y, 4));
  [['light', -22], ['shells', -17], ['sniper', -12], ['rockets', -7], ['energy', -2]].forEach(([a, dx]) => mb.pickup('ammo', a, cx + dx, cz + 9, y, 5));
  [['medkit', 4], ['shieldpot', 7], ['grenade', 10], ['smoke', 13]].forEach(([c, dx]) => mb.pickup('cons', c, cx + dx, cz + 9, y, 5));
  [['speed', 18], ['jump', 21], ['barrier', 24]].forEach(([c, dx]) => mb.pickup('power', c, cx + dx - 6, cz + 7, y, 8));
  ['grapple', 'jetpack', 'teleporter', 'drone', 'scanner'].forEach((g, i) => mb.pickup('gadget', g, cx - 12 + i * 3, cz + 4, y, 6));
  // Hindernisparcours
  for (let i = 0; i < 5; i++) mb.box('hazard', cx - 22 + i * 3.2, y, cz - 6, 0.6, 0.8 + i * 0.35, 5, { tile: 1.5 });
  mb.box('containerYellow', cx + 12, y, cz - 8, 6.1, 2.6, 2.45); mb.box('containerBlue', cx + 12, y + 2.6, cz - 8, 6.1, 2.6, 2.45);
  for (let i = 0; i < 6; i++) mb.box('stairs', cx + 16.5 + i * 0.6, y, cz - 8, 0.6, 0.5 + i * 0.5, 2, { noao: 1 });
  mb.pad(cx + 20, cz - 12, y, 20, 0, 0, 1.6);
  mb.box('techWhite', cx + 8, y + 9, cz - 12, 8, 0.5, 8, { noao: 1 });
  mb.pickup('gadget', 'grapple', cx + 8, cz - 12, y + 9.5, 10);
  for (let i = 0; i < 3; i++) mb.box('concrete', cx - 4 + i * 2.5, y, cz + 1 - i * 2, 1.4, 1.2 + i * 0.7, 1.4, { tile: 2 });
  mb.lamp(cx - 24, cz - 14, y, 7); mb.lamp(cx + 24, cz - 14, y, 7); mb.lamp(cx - 24, cz + 14, y, 7); mb.lamp(cx + 24, cz + 14, y, 7);
  mb.light(cx, y + 6, cz, 0xfff4d8, 1.2, 40);
  // Trainings-Dummy-Positionen (Bots im Trainingsmodus)
  mb.zonesFx.push({ id: 'dummies', pts: [[cx - 14, cz - 12], [cx - 6, cz - 12], [cx + 2, cz - 12], [cx + 6, cz - 2], [cx - 18, cz], [cx - 8, cz - 4]] });
  mb.spawn(cx, cz + 17, y, Math.PI); mb.spawn(cx + 10, cz + 17, y, Math.PI); mb.spawn(cx - 12, cz + 17, y, Math.PI);
  mb.secretSpots.push({ id: 'trainstart', x: cx, y, z: cz + 17 });
}
