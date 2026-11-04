// Ironworks (Industriegebiet) und Fort Helios (futuristische Militärbasis).
export function buildIndustryMilitary(mb) {
  industry(mb);
  military(mb);
}

function industry(mb) {
  const I = 0.8;
  mb.road(95, -38, 95, 74, 10, { y: I + 0.04, mat: 'asphalt' });
  mb.road(72, 18, 168, 18, 10, { y: I + 0.04, mat: 'asphalt' });
  mb.road(120, -38, 120, 18, 8, { y: I + 0.04, mat: 'asphalt', lines: false });
  mb.label('IRONWORKS', 98, I + 7, -34, 0, 8, '#ffb347');

  // Fabrikhalle A mit Katwalk und Tresor
  const HA = { x: 125, z: -14, w: 42, d: 26 };
  mb.building({ ...HA, floors: 1, fh: 9.5, base: I, mat: 'corrugated', inMat: 'corrugatedIn', parapet: true, stairs: false, roofMat: 'metalDark', doors: [{ side: 's', off: -8, w: 8, h: 6 }, { side: 's', off: 12, w: 4 }, { side: 'w', off: 0, w: 6, h: 5 }, { side: 'n', off: 10, w: 4 }], lamps: false });
  mb.box('metalGrate', HA.x - 6, I + 5, HA.z - 4, 28, 0.25, 3, { noao: 1 });
  mb.box('metalGrate', HA.x + 8, I + 5, HA.z + 2, 3, 0.25, 14, { noao: 1 });
  for (const dx of [-18, -6, 6, 15]) { mb.box('metalDark', HA.x + dx, I, HA.z - 4, 0.4, 5, 0.4); }
  for (let k = 1; k <= 16; k++) mb.box('stairs', HA.x - 22 + 1 + k * 0.62 - 0.3, I, HA.z - 4, 0.62, k * 0.3, 2, { noao: 1 });
  mb.box('hazard', HA.x - 8, I, HA.z + 6, 6, 1.2, 4, { tile: 2 }); mb.box('metalDark', HA.x - 8, I + 1.2, HA.z + 6, 4, 2.4, 3);
  for (let i = 0; i < 4; i++) mb.box('metal', HA.x + 10 + i * 2.2, I, HA.z + 6, 1.6, 1.0 + (i % 2) * 0.5, 1.6, { tile: 1.5 });
  mb.anim('belt', { x: HA.x - 6, y: I + 1.0, z: HA.z + 9, len: 24, dir: 'x' });
  mb.box('metalDark', HA.x - 6, I, HA.z + 9, 24, 1.0, 1.6, { noao: 1 });
  for (const dx of [-14, 0, 14]) mb.light(HA.x + dx, I + 8.6, HA.z, 0xfff0d0, 1.4, 22);
  for (const dx of [-14, 0, 14]) mb.vis('lamp', HA.x + dx, I + 9.3, HA.z, 8, 0.08, 0.6, { noao: 1 });
  mb.anim('fan', { x: HA.x + 20, y: I + 7.5, z: HA.z - 13 + 0.5 });
  mb.pad(HA.x - 24, HA.z + 16, I, 20, 0, -4, 1.7); // aufs Dach
  // Tresor (hinterer Raum) – Tür öffnet der Hauptschalter
  const vx = HA.x + 14, vz = HA.z - 8;
  mb.box('techDark', vx, I, vz - 4.5, 10, 4, 0.5); mb.box('techDark', vx - 5, I, vz, 0.5, 4, 9); mb.box('techDark', vx + 5, I, vz, 0.5, 4, 9);
  mb.box('techDark', vx, I + 4, vz, 10.5, 0.5, 9.5);
  mb.box('techDark', vx - 3.5, I, vz + 4.5, 3, 4, 0.5); mb.box('techDark', vx + 3.5, I, vz + 4.5, 3, 4, 0.5);
  mb.door({ id: 'vault', x: vx, y: I, z: vz + 4.5, w: 4, h: 3.6, d: 0.6, mat: 'vaultDoor', locked: true });
  mb.box('techDark', vx, I + 3.6, vz + 4.5, 4, 0.4, 0.5);
  mb.light(vx, I + 3.4, vz, 0xffd27a, 1.5, 12);
  mb.chest(vx - 3, vz - 2, I, 3, 0.3); mb.chest(vx + 3, vz - 2, I, 3, -0.3);
  mb.pickup('weapon', 'lancer', vx, vz - 1, I, 70); mb.pickup('weapon', 'stormcaller', vx - 2.5, vz + 1.5, I, 70); mb.pickup('power', 'barrier', vx + 2.5, vz + 1.5, I, 60);
  mb.label('TRESOR', vx, I + 3.9, vz + 4.9, 0, 2.2, '#ffd27a');

  // Kontrollgebäude mit Hauptschalter
  const C = mb.building({ x: 152, z: 4, w: 18, d: 16, floors: 2, base: I, mat: 'techPanel', parapet: true, doors: [{ side: 'w' }, { side: 's' }], roofAccess: true });
  mb.switchObj({ id: 'power', x: 146, y: I + 0.15, z: -3.4, ry: 0, kind: 'lever', targets: ['vault'], label: 'Hauptschalter umlegen', event: 'power', once: true, color: 0xffa03d });
  mb.box('metalDark', 146, I + 0.15, -3.9, 1.8, 2.6, 0.5, { noao: 1 }); mb.vis('screenGreen', 150, I + 1.6, -3.85, 4, 1.4, 0.05, { noao: 1 });
  mb.vis('screenGreen', 154, I + 1.6, -3.85, 4, 1.4, 0.05, { noao: 1 });
  mb.pickup('weapon', 'pulse', 152, 8, I + 3.45, 40); mb.pickup('cons', 'medkit', 156, 2, I, 25); mb.pickup('gadget', 'teleporter', 152, 8, I, 70);
  mb.pickup('weapon', 'marksman', 150, 4, C.top, 45);

  // Lagerhalle B
  mb.building({ x: 128, z: 56, w: 30, d: 20, floors: 1, fh: 7, base: I, mat: 'corrugatedBlue', inMat: 'corrugatedIn', stairs: false, doors: [{ side: 'n', off: -6, w: 6, h: 5 }, { side: 'w', w: 4 }, { side: 'e', w: 4 }], parapet: true, lamps: true });
  for (let i = 0; i < 6; i++) { mb.crate(114 + (i % 3) * 1.4 + mb.r(0, 6), 52 + Math.floor(i / 3) * 4, I, 1.3, 'wood'); }
  mb.chest(140, 62, I, 2, 0); mb.pickup('weapon', 'breaker', 130, 60, I, 35); mb.pickup('ammo', 'shells', 118, 62, I, 25);

  // Silos, Tanks, Schornsteine
  for (let i = 0; i < 4; i++) { mb.cyl('siloMetal', 78 + (i % 2) * 11, I, 40 + Math.floor(i / 2) * 11, 4.4, 22, { seg: 20, tile: 4 }); mb.cyl('metalDark', 78 + (i % 2) * 11, I + 22, 40 + Math.floor(i / 2) * 11, 4.6, 0.8, { r2: 1.5, seg: 20, solid: false }); }
  mb.box('metalDark', 83.5, I + 13, 45, 11, 0.4, 0.5, { noao: 1 });
  for (let i = 0; i < 2; i++) { mb.cyl('tankMetal', 152, I, 40 + i * 17, 7, 10, { seg: 24, tile: 5 }); mb.cyl('hazard', 152, I + 0.1, 40 + i * 17, 7.05, 1.2, { solid: false, seg: 24, tile: 2 }); mb.vis('metalDark', 152, I + 10, 40 + i * 17, 10, 0.3, 1.0, { noao: 1 }); }
  mb.box('rust', 152, I + 5.2, 54.1, 14, 0.6, 0.6, { noao: 1 });
  for (const [x, z] of [[96, -30], [104, -30], [112, -28]]) { mb.cyl('brickDark', x, I, z, 2.2, 40, { r2: 1.5, seg: 14, tile: 5 }); mb.visc('hazard', x, I + 36, z, 1.62, 1.5, { seg: 14, tile: 1.2 }); mb.anim('smoke', { x, y: I + 40.5, z }); }
  // Kühlturm
  mb.cyl('concreteDark', 150, I, -24, 9, 26, { r2: 6.5, seg: 24, tile: 6, solid: true, crf: 1 }); mb.anim('smoke', { x: 150, y: I + 26, z: -24, big: 1 });
  mb.cyl('concreteDark', 168, I, -24, 6, 17, { r2: 4.3, seg: 20, tile: 6 });
  // Rohre
  for (let i = 0; i < 5; i++) { mb.box('pipe', 86 + i * 12, I + 7.0, 66, 0.8, 0.8, 0.8, { noao: 1 }); }
  mb.vis('pipe', 116, I + 7.4, 66, 66, 0.9, 0.9, { noao: 1 });
  for (let x = 86; x <= 146; x += 12) mb.box('metalDark', x, I, 66, 0.5, 7, 0.5, { noao: 1 });
  // Containerlager
  const cz0 = 34;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    if ((r + c) % 3 === 1) continue;
    const x = 112 + c * 6.8, z = cz0 + r * 3.1 + 10;
    mb.container(x, z, I, 0); if ((r + c) % 2 === 0) mb.container(x, z, I + 2.6, 0);
    if (c === 1 && r === 1) mb.container(x, z, I + 5.2, 0);
  }
  mb.box('stairs', 109, I, 41, 1, 0.9, 2.4, { noao: 1 }); mb.box('stairs', 108.2, I, 41, 0.7, 0.55, 2.4, { noao: 1 });
  mb.pickup('weapon', 'longshot', 118.8, 47.1, I + 7.8, 55); mb.pickup('cons', 'grenade', 125.6, 44, I + 5.2, 35);
  mb.container(168, -2, I, 1); mb.container(168, 6, I, 1); mb.container(168, -2, I + 2.6, 1);
  // Portalkran
  const KX = 138, KZ = 36;
  for (const sx of [-17, 17]) for (const sz of [-7, 7]) mb.box('craneYellow', KX + sx, I, KZ + sz, 1.6, 17, 1.6, { tile: 4 });
  mb.vis('craneYellow', KX, I + 17, KZ, 38, 1.6, 17, { noao: 1 }); mb.col(KX - 19, I + 17, KZ - 8.5, KX + 19, I + 18.6, KZ + 8.5, { nowall: 1 });
  mb.anim('crane', { x: KX, y: I + 14.5, z: KZ, span: 30 });
  // Eisenbahn
  mb.vis('rust', 172, I, 20, 0.25, 0.25, 160, { noao: 1 }); mb.vis('rust', 174, I, 20, 0.25, 0.25, 160, { noao: 1 });
  for (let z = -40; z < 80; z += 1.2) mb.vis('wood', 173, I - 0.02, z, 3.2, 0.1, 0.3, { noao: 1, cast: false });
  for (let i = 0; i < 3; i++) mb.box(['containerRed', 'tankMetal', 'containerBlue'][i], 173, I + 0.5, 28 + i * 14, 2.8, 3.3, 12, { tile: 4 });
  // Bewegliche Elemente: Presse + Plattform
  mb.anim('piston', { x: 96, y: I + 8, z: 4, h: 6 });
  mb.mover({ x: 84, z: 8, w: 4, d: 4, y0: I, y1: I + 9, speed: 3, pause: 3, mat: 'hazard' });
  mb.box('craneYellow', 84, I + 9, 4, 4, 0.4, 4, { noao: 1 });
  mb.pickup('weapon', 'hornet', 84, 4, I + 9.4, 40);
  // Deckung
  for (let i = 0; i < 12; i++) { const a = mb.r(0, 6.28); const x = 100 + mb.r(0, 60), z = mb.r(-30, 12); if (Math.abs(x - 125) < 24 && Math.abs(z + 14) < 16) continue; if (i % 2) mb.jersey(x, z, I, i % 3 === 0); else mb.barrel(x, z, I); }
  for (let i = 0; i < 7; i++) mb.barrel(100 + i * 1.1, -2, I, i % 2 ? 'barrelRed' : 'barrelYellow');
  for (let z = -34; z < 70; z += 14) { mb.lamp(89.5, z, I, 8); mb.lamp(100.5, z + 7, I, 8); }
  // Pickups
  mb.pickup('weapon', 'striker', 100, 14, I, 30); mb.pickup('weapon', 'hornet', 108, 24, I, 30); mb.pickup('weapon', 'magnum', 136, 24, I, 35); mb.pickup('weapon', 'stormcaller', 160, -26, I, 70);
  mb.pickup('ammo', 'light', 90, 0, I); mb.pickup('ammo', 'rockets', 160, -20, I, 40); mb.pickup('ammo', 'energy', 140, 12, I); mb.pickup('cons', 'medkit', 120, 24, I, 25);
  mb.pickup('cons', 'shieldpot', 100, -20, I, 25); mb.pickup('power', 'speed', 104, 40, I, 45); mb.pickup('power', 'jump', 162, 44, I, 45); mb.pickup('shard', 'data', 158, 68, I, 99999); mb.pickup('shard', 'data', 82, -34, I, 99999);
  for (const [x, z] of [[100, 20], [130, 24], [150, 32], [92, -20], [160, 66], [110, 66]]) mb.spawn(x, z, I);
  mb.pickup('gadget', 'drone', 86, 20, I, 60);
}

function military(mb) {
  const M = 3.0;
  const X0 = 84, X1 = 172, Z0 = -155, Z1 = -85;
  const wh = 7, wt = 1.2;
  // Perimeter-Mauern
  const wallBox = (x, z, w, d) => { mb.box('techWall', x, M, z, w, wh, d, { tile: 6 }); mb.vis('neonCyan', x, M + wh - 0.7, z, w + 0.04, 0.18, d + 0.04, { noao: 1 }); };
  wallBox((X0 + X1) / 2, Z0, X1 - X0, wt);
  wallBox(X0, (Z0 - 124) / 2, wt, -124 - Z0); wallBox(X0, (-116 + Z1) / 2, wt, Z1 + 116);
  wallBox(X1, (Z0 + Z1) / 2, wt, Z1 - Z0);
  // Südwand mit Tor bei x=128
  wallBox((X0 + 120) / 2, Z1, 120 - X0, wt); wallBox((136 + X1) / 2, Z1, X1 - 136, wt);
  mb.box('techWall', 128, M + 5, Z1, 16, 2, wt, { tile: 6 });
  mb.door({ id: 'gateS', x: 128, y: M, z: Z1, w: 16, h: 5, d: 1.0, mat: 'gateDoor', auto: true });
  mb.label('FORT HELIOS', 128, M + wh + 3, Z1 + 0.8, 0, 9, '#7ee8ff');
  // Westwand ist durchbrochen (Notausgang) + Tür, die der Schalter entriegelt
  mb.door({ id: 'gateW', x: X0, y: M, z: -120, w: 1.6, h: 5, d: 8, mat: 'gateDoor', locked: true });
  mb.box('techWall', X0, M + 5, -120, wt, 2, 8, { tile: 6 }); // Sturz
  // Löcher in der Westwand: Wand besteht aus 2 Teilen -> Lücke ersetzt Tor (siehe oben, wir lassen die Wand dort offen)
  // Wachtürme
  for (const [x, z] of [[X0 + 7, Z1 - 7], [X1 - 7, Z1 - 7], [X0 + 7, Z0 + 7], [X1 - 7, Z0 + 7]]) {
    const t = mb.building({ x, z, w: 12, d: 12, floors: 3, fh: 3.6, base: M, mat: 'techWall', stairs: true, roofAccess: true, doors: [{ side: z > -120 ? 'n' : 's' }], parMat: 'techWall' });
    mb.vis('neonCyan', x, t.top - 0.2, z, 12.1, 0.18, 12.1, { noao: 1 });
    mb.pickup(Math.abs(x - 128) > 40 && z > -120 ? 'weapon' : 'ammo', Math.abs(x - 128) > 40 && z > -120 ? 'longshot' : 'sniper', x, z, t.top, 60);
    mb.anim('searchlight', { x, y: t.top + 1, z, a: x * 0.1 });
  }
  // Hangar
  const hg = mb.building({ x: 112, z: -138, w: 32, d: 22, floors: 1, fh: 12, base: M, mat: 'techWhite', inMat: 'techWallIn', stairs: false, parapet: true, doors: [{ side: 's', off: 0, w: 14, h: 9 }, { side: 'e', off: 0, w: 4 }, { side: 'w', w: 4 }], lamps: false });
  mb.vis('neonCyan', 112, M + 12.1, -138, 32.3, 0.2, 22.3, { noao: 1 });
  mb.light(112, M + 10, -138, 0xdff4ff, 1.8, 28); mb.light(104, M + 10, -144, 0xdff4ff, 1.4, 22); mb.light(122, M + 10, -132, 0xdff4ff, 1.4, 22);
  // Jet im Hangar
  mb.cyl('techWhite', 112, M + 2.3, -139, 1.3, 15, { rx: 0, rz: Math.PI / 2, solid: false, seg: 14 });
  mb.box('techWhite', 112, M + 1.8, -139, 14, 1.8, 2.6, { noao: 1 }); mb.vis('techWhite', 114, M + 2.1, -139, 5, 0.25, 15, { noao: 1 });
  mb.vis('techDark', 105, M + 3.2, -139, 3, 3, 0.2, { noao: 1 }); mb.vis('neonCyan', 119.8, M + 2.3, -139, 0.3, 0.3, 0.9, { noao: 1 });
  mb.pickup('weapon', 'lancer', 98, -135, M, 60); mb.pickup('ammo', 'energy', 124, -144, M, 25); mb.chest(122, -146, M, 3, 3.14);
  // Kaserne
  mb.building({ x: 152, z: -100, w: 26, d: 12, floors: 2, base: M, mat: 'techWall', doors: [{ side: 's' }, { side: 'w' }], roofAccess: true });
  mb.pickup('cons', 'medkit', 150, -100, M, 25); mb.pickup('cons', 'shieldpot', 156, -102, M, 25); mb.pickup('weapon', 'striker', 146, -98, M, 30);
  // Kommandozentrale + Radar
  const cmd = mb.building({ x: 152, z: -138, w: 22, d: 20, floors: 3, base: M, mat: 'techWhite', doors: [{ side: 'w' }, { side: 's' }], roofAccess: true });
  mb.cyl('techDark', 152, cmd.top, -138, 1.2, 1.4, { seg: 8 });
  mb.anim('radar', { x: 152, y: cmd.top + 1.4, z: -138 });
  mb.pickup('weapon', 'marksman', 158, -138, cmd.top, 45); mb.pickup('gadget', 'jetpack', 146, -134, M + 7.3, 60); mb.chest(158, -134, M + 7.3, 2, 0);
  mb.switchObj({ id: 'baseSwitch', x: 143.6, y: M + 0.15, z: -138, ry: Math.PI / 2, kind: 'panel', targets: ['gateW'], label: 'Westtor entriegeln', color: 0x4de1ff });
  // Reaktor
  const rx = 128, rz = -112;
  const rc = mb.building({ x: rx, z: rz, w: 20, d: 20, floors: 2, base: M, mat: 'techWhite', baseMat: 'techWall', doors: [{ side: 's' }, { side: 'n' }, { side: 'e' }, { side: 'w' }], roofAccess: false, parapet: false, lamps: false });
  mb.cyl('reactorCore', rx, M + 0.2, rz, 2.6, 6.8, { seg: 16 });
  mb.visc('neonCyan', rx, M + 0.2, rz, 3.0, 0.4, { seg: 16 }); mb.visc('neonCyan', rx, M + 6.6, rz, 3.0, 0.4, { seg: 16 });
  mb.light(rx, M + 4, rz, 0x40e8ff, 2.4, 24); mb.glow(rx, M + 4, rz, 0x40e8ff, 10, 0.5);
  mb.anim('reactor', { x: rx, y: M + 4, z: rz });
  mb.pickup('power', 'barrier', rx + 6, rz + 6, M, 60); mb.pickup('weapon', 'pulse', rx - 6, rz + 6, M, 35); mb.pickup('cons', 'shieldpot', rx - 6, rz - 6, M, 25); mb.pickup('weapon', 'stormcaller', rx + 6, rz - 6, M + 3.6, 70);
  // Hubschrauberlandeplatz
  mb.vis('concreteDark', 100, M, -102, 18, 0.12, 18, { noao: 1, cast: false }); mb.visc('neonOrange', 100, M + 0.13, -102, 6.2, 0.03, { seg: 24 }); mb.visc('concreteDark', 100, M + 0.15, -102, 5.7, 0.03, { seg: 24 });
  mb.box('techWall', 100, M + 0.2, -102, 3.6, 2.2, 8, { tile: 3 }); mb.box('techWhite', 100, M + 0.2, -99.2, 3.2, 2.0, 3.4, { noao: 1 });
  mb.vis('techDark', 100, M + 2.5, -102, 0.8, 0.5, 0.8, { noao: 1 }); mb.anim('rotor', { x: 100, y: M + 3.0, z: -102, r: 6.5 });
  mb.vis('techWall', 100, M + 1.3, -108.5, 0.4, 0.4, 5, { noao: 1 });
  // Panzer & Deckung
  const tank = (x, z, ry) => { mb.box('militaryGreen', x, M, z, 7.2, 1.7, 3.8, { tile: 3 }); mb.box('militaryGreen', x, M + 1.7, z, 3.4, 1.2, 2.8, { tile: 3 }); mb.vis('metalDark', x + 4.2, M + 2.4, z, 5, 0.35, 0.35, { noao: 1 }); mb.vis('metalDark', x, M - 0.05, z + 2.0, 7.4, 0.9, 0.5, { noao: 1 }); mb.vis('metalDark', x, M - 0.05, z - 2.0, 7.4, 0.9, 0.5, { noao: 1 }); };
  tank(100, -125, 0); tank(168, -118, 0);
  for (let i = 0; i < 12; i++) { const x = 92 + mb.r(0, 76), z = -150 + mb.r(0, 56); if (Math.abs(x - 128) < 14 && Math.abs(z + 112) < 14) continue; if (z < -128 && x > 96 && x < 130) continue; if (x > 140 && z < -126) continue; if (x > 138 && z > -112) continue; if (i % 2) mb.sandbags(x, z, M, i % 3 === 0); else mb.jersey(x, z, M, i % 3 === 0); }
  for (let i = 0; i < 5; i++) mb.crate(94 + i * 1.5, -90, M, 1.3, 'militaryCrate');
  for (const [x, z] of [[100, -90], [156, -90], [100, -148], [140, -150], [128, -92], [128, -126]]) { mb.lamp(x, z, M, 8, 0xcfeaff); }
  // Flagge
  mb.cyl('metal', 124, M, -92, 0.12, 12, { solid: false, seg: 6 }); mb.anim('flag', { x: 124.1, y: M + 11, z: -92, color: 0x7ee8ff });
  // Pickups / Spawn
  mb.pickup('weapon', 'hornet', 120, -100, M, 30); mb.pickup('weapon', 'breaker', 136, -100, M, 35); mb.pickup('ammo', 'light', 108, -112, M); mb.pickup('ammo', 'sniper', 148, -118, M, 35);
  mb.pickup('cons', 'grenade', 118, -90, M); mb.pickup('cons', 'smoke', 140, -90, M); mb.pickup('power', 'speed', 128, -148, M, 45); mb.pickup('gadget', 'grapple', 96, -148, M, 60); mb.pickup('shard', 'data', 170, -152, M, 99999);
  for (const [x, z] of [[128, -96], [110, -110], [150, -118], [96, -110], [166, -112], [128, -146]]) mb.spawn(x, z, M);
  // Geheimer Schalter hinter der Hangar (versteckter Tresor-Kiste)
  mb.chest(90, -150, M, 3, 0.7);
}
