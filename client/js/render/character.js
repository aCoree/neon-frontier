// Prozeduraler Charakter mit Skelett (Gelenk-Gruppen), IK-Armen, Lauf-/Spring-/Duck-/Dash-/Trefferanimationen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SKINS, WEAPONS } from '../shared/defs.js';
import { makeWeaponModel, HOLD } from './weapons.js';
import { clamp, lerp, angDiff, smoothstep } from '../shared/util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildExtras, tickExtras, disposeExtras } from './skinfx.js';

const gcache = new Map();
const RB = (w, h, d, r = 0.02) => { const k = `${w}|${h}|${d}|${r}`; let g = gcache.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); gcache.set(k, g); } return g; };
const CAP = (r, l) => { const k = `cap${r}|${l}`; let g = gcache.get(k); if (!g) { g = new THREE.CapsuleGeometry(r, l, 4, 10); gcache.set(k, g); } return g; };
const SPH = (r, w = 16, h = 12) => { const k = `sph${r}|${w}`; let g = gcache.get(k); if (!g) { g = new THREE.SphereGeometry(r, w, h); gcache.set(k, g); } return g; };

const UA = 0.31, FA = 0.29; // Armsegmente
const DOWN = new THREE.Vector3(0, -1, 0);
const POLE_R = new THREE.Vector3(-0.55, -1, -0.35), POLE_L = new THREE.Vector3(0.55, -1, -0.35);
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class Character {
  constructor(skinId = 'vanguard', wskinId = 'default') {
    this.skin = SKINS.find(s => s.id === skinId) || SKINS[0];
    this.wskinId = wskinId;
    this.root = new THREE.Group(); this.root.name = 'char';
    this.phase = 0; this.crouchK = 0; this.legYaw = 0; this.sprintK = 0; this.aimK = 0;
    this.shotT = 0; this.reloadT = 0; this.reloadDur = 0; this.hitT = 0; this.hitX = 0; this.hitZ = 0; this.dashT = 0; this.throwT = 0; this.meleeT = 0; this.equipT = 1;
    this.deadT = 0; this.alive = true; this.landT = 0; this.wasGrounded = true; this.vyPrev = 0; this.spawnT = 1; this.scarfLag = 0; this.grappleK = 0; this.jetK = 0;
    this.weaponId = null; this.weaponGroup = null; this.recoil = 0;
    this.build();
  }

  mkMats() {
    const s = this.skin;
    this.mArmor = new THREE.MeshStandardMaterial({ color: s.armor, roughness: 0.38, metalness: s.metal });
    this.mSuit = new THREE.MeshStandardMaterial({ color: s.suit, roughness: 0.8, metalness: 0.05 });
    this.mAccent = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.accent).multiplyScalar(1.5), toneMapped: false });
    this.mVisor = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.visor).multiplyScalar(1.2), toneMapped: false });
    this.mDark = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.6 });
    this.mSkin = new THREE.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.7 });
  }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m;
  }
  joint(parent, x = 0, y = 0, z = 0) { const g = new THREE.Bone(); g.position.set(x, y, z); parent.add(g); this.bones.push(g); return g; }

  build() {
    this.bones = []; this.mkMats();
    const { mArmor: A, mSuit: S, mAccent: AC, mDark: D } = this;
    this.rig = this.joint(this.root);                         // Fall-/Ausweichdrehung um die Füße
    this.hips = this.joint(this.rig, 0, 0.92, 0);
    this.mesh(RB(0.34, 0.2, 0.22, 0.05), S, this.hips, 0, 0, 0);
    this.mesh(RB(0.36, 0.07, 0.24, 0.03), D, this.hips, 0, 0.1, 0);
    this.mesh(RB(0.07, 0.07, 0.02, 0.01), AC, this.hips, 0, 0.1, 0.125, false);
    // Beine
    this.legs = [];
    for (const sx of [-1, 1]) {
      const thigh = this.joint(this.hips, sx * 0.1, -0.05, 0);
      this.mesh(CAP(0.078, 0.28), S, thigh, 0, -0.21, 0);
      this.mesh(RB(0.13, 0.16, 0.15, 0.04), A, thigh, 0, -0.2, 0.01);
      const shin = this.joint(thigh, 0, -0.42, 0);
      this.mesh(CAP(0.064, 0.28), S, shin, 0, -0.21, 0);
      this.mesh(RB(0.11, 0.24, 0.12, 0.035), A, shin, 0, -0.22, 0.045);
      this.mesh(SPH(0.075, 10, 8), A, shin, 0, 0.0, 0.05);
      const foot = this.joint(shin, 0, -0.42, 0);
      this.mesh(RB(0.11, 0.09, 0.27, 0.04), D, foot, 0, -0.01, 0.05);
      this.mesh(RB(0.112, 0.012, 0.1, 0.005), AC, foot, 0, 0.0, 0.14, false);
      this.legs.push({ thigh, shin, foot, side: sx });
    }
    // Oberkörper
    this.spine = this.joint(this.hips, 0, 0.1, 0);
    this.mesh(RB(0.3, 0.2, 0.2, 0.05), S, this.spine, 0, 0.06, 0);
    this.chest = this.joint(this.spine, 0, 0.14, 0);
    this.mesh(RB(0.34, 0.34, 0.21, 0.06), S, this.chest, 0, 0.14, 0);
    this.mesh(RB(0.37, 0.27, 0.26, 0.07), A, this.chest, 0, 0.17, 0.015);
    this.mesh(RB(0.12, 0.02, 0.02, 0.008), AC, this.chest, 0, 0.2, 0.15, false);
    this.mesh(RB(0.02, 0.18, 0.02, 0.008), AC, this.chest, 0.11, 0.17, 0.145, false);
    this.mesh(RB(0.02, 0.18, 0.02, 0.008), AC, this.chest, -0.11, 0.17, 0.145, false);
    this.mesh(RB(0.3, 0.3, 0.14, 0.05), D, this.chest, 0, 0.15, -0.16);   // Rucksack
    this.mesh(RB(0.22, 0.04, 0.03, 0.01), AC, this.chest, 0, 0.12, -0.235, false);
    this.mesh(RB(0.06, 0.2, 0.05, 0.02), A, this.chest, 0.1, 0.16, -0.24);
    this.mesh(RB(0.06, 0.2, 0.05, 0.02), A, this.chest, -0.1, 0.16, -0.24);
    this.jetFlames = [];
    // Hals & Kopf
    this.neck = this.joint(this.chest, 0, 0.32, 0.0);
    this.mesh(CAP(0.045, 0.06), this.mSkin, this.neck, 0, 0.02, 0);
    this.head = this.joint(this.neck, 0, 0.1, 0.01);
    this.buildHead();
    // Arme (IK)
    this.arms = [];
    for (const sx of [-1, 1]) { // -1 = rechts (Charakter blickt +Z)
      const sh = this.joint(this.chest, sx * 0.235, 0.27, 0);
      this.mesh(SPH(0.095, 12, 10), A, sh, sx * 0.03, 0.02, 0);
      this.mesh(RB(0.08, 0.025, 0.12, 0.01), AC, sh, sx * 0.06, 0.085, 0, false);
      const up = this.joint(sh, 0, 0, 0);
      this.mesh(CAP(0.055, 0.2), S, up, 0, -0.15, 0);
      this.mesh(RB(0.09, 0.1, 0.1, 0.03), A, up, 0, -0.1, 0);
      const fo = this.joint(up, 0, -UA, 0);
      this.mesh(CAP(0.05, 0.18), S, fo, 0, -0.14, 0);
      this.mesh(RB(0.085, 0.14, 0.095, 0.03), A, fo, 0, -0.11, 0);
      const hand = this.joint(fo, 0, -FA, 0);
      this.mesh(SPH(0.058, 10, 8), D, hand, 0, -0.01, 0);
      this.arms.push({ sh, up, fo, hand, side: sx });
    }
    this.armR = this.arms[0]; this.armL = this.arms[1];
    // Waffen-Anker an der Brust
    this.anchor = this.joint(this.chest, -0.1, 0.27, 0.26);
    this.setWeapon('viper');
    // Schal (Phantom)
    if (this.skin.scarf) {
      this.scarf = this.joint(this.neck, 0, 0.0, -0.1);
      for (let i = 0; i < 3; i++) { const seg = this.mesh(RB(0.16, 0.05, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: this.skin.accent, emissive: this.skin.accent, emissiveIntensity: 0.6, roughness: 0.7 }), this.scarf, 0, -i * 0.01, -0.15 - i * 0.28, false); seg.rotation.x = 0; }
    }
    this.optimize();
    buildExtras(this);
    this.tmpMat = new THREE.Matrix4();
  }

  // Draw-Calls sparen: alle starren Körperteile werden zu EINEM Skinned-Mesh pro Materialklasse verschmolzen (statt ~50 Einzelmeshes).
  // Die Gelenke bleiben echte Bones – die bestehende Animation/IK steuert sie weiter über rotation/position.
  optimize() {
    const root = this.root; root.updateMatrixWorld(true);
    const inSkip = (o) => { for (let p = o; p; p = p.parent) if (p === this.anchor || p === this.scarf) return true; return false; };
    const idx = new Map(this.bones.map((bn, i) => [bn, i]));
    const groups = { armor: [], cloth: [], accent: [], visor: [] }, removed = [];
    root.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh || inSkip(m) || !idx.has(m.parent)) return;
      const cls = m.material === this.mArmor ? 'armor' : m.material === this.mAccent ? 'accent' : m.material === this.mVisor ? 'visor' : 'cloth';
      let ge = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); ge.applyMatrix4(m.matrixWorld); ge.deleteAttribute('uv');
      const n = ge.attributes.position.count, bi = idx.get(m.parent), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), c = m.material.color;
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      ge.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); ge.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (cls === 'cloth') ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      groups[cls].push(ge); removed.push(m);
    });
    for (const m of removed) m.parent.remove(m);
    const skeleton = new THREE.Skeleton(this.bones); skeleton.calculateInverses();
    this.mCloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.2 });
    const mats = { armor: this.mArmor, cloth: this.mCloth, accent: this.mAccent, visor: this.mVisor };
    for (const [cls, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const geo = mergeGeometries(list); list.forEach(x => x.dispose());
      const sm = new THREE.SkinnedMesh(geo, mats[cls]);
      root.add(sm); sm.bind(skeleton, new THREE.Matrix4());
      sm.frustumCulled = false;   // Skinned-Meshes haben eine eigene, einmal berechnete Kugel → sonst verschwindet der Körper je nach Position/Blickwinkel. 4 Meshes je Figur: Kosten vernachlässigbar.
      sm.castShadow = cls === 'armor' || cls === 'cloth';
      sm.matrixAutoUpdate = false; sm.matrixWorldAutoUpdate = false; sm.matrixWorld.identity();   // Bones tragen bereits die Weltposition
    }
  }

  buildHead() {
    const A = this.mArmor, V = this.mVisor, AC = this.mAccent, D = this.mDark, h = this.head, k = this.skin.head;
    if (k === 'robot') {
      this.mesh(RB(0.26, 0.24, 0.26, 0.05), A, h, 0, 0.05, 0);
      this.mesh(RB(0.2, 0.07, 0.03, 0.02), V, h, 0, 0.07, 0.135, false);
      this.mesh(RB(0.05, 0.1, 0.05, 0.015), D, h, 0.14, 0.04, 0); this.mesh(RB(0.05, 0.1, 0.05, 0.015), D, h, -0.14, 0.04, 0);
      this.mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), D, h, 0.08, 0.28, 0); this.mesh(SPH(0.03, 8, 6), AC, h, 0.08, 0.39, 0, false);
      return;
    }
    this.mesh(SPH(0.125, 18, 14), this.mSkin, h, 0, 0.04, 0);
    const helm = this.mesh(SPH(0.145, 18, 14), A, h, 0, 0.065, -0.01); helm.scale.set(1, 0.95, 1.03);
    if (k === 'hood') { helm.scale.set(1.05, 1.0, 1.1); this.mesh(RB(0.16, 0.05, 0.04, 0.02), V, h, 0, 0.04, 0.12, false); const pt = this.mesh(new THREE.ConeGeometry(0.1, 0.22, 8), A, h, 0, 0.1, -0.12); pt.rotation.x = 1.2; return; }
    // Visier
    this.mesh(RB(0.21, 0.075, 0.06, 0.03), V, h, 0, 0.055, 0.1, false);
    this.mesh(RB(0.24, 0.03, 0.1, 0.01), D, h, 0, 0.11, 0.07);
    if (k === 'crest') { this.mesh(RB(0.03, 0.12, 0.28, 0.012), AC, h, 0, 0.2, -0.02, false); }
    if (k === 'halo') { const t = this.mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 28), AC, h, 0, 0.32, -0.02, false); t.rotation.x = Math.PI / 2 + 0.15; }
    if (k === 'antenna') { for (const sx of [-1, 1]) { this.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 5), D, h, sx * 0.09, 0.28, -0.03); this.mesh(SPH(0.025, 8, 6), AC, h, sx * 0.09, 0.43, -0.03, false); } }
    if (k === 'horns') { for (const sx of [-1, 1]) { const c = this.mesh(new THREE.ConeGeometry(0.035, 0.28, 8), AC, h, sx * 0.1, 0.24, 0.0); c.rotation.z = -sx * 0.5; c.rotation.x = -0.25; } this.mesh(RB(0.14, 0.025, 0.1, 0.01), D, h, 0, 0.2, 0.08); }
    this.mesh(RB(0.05, 0.05, 0.04, 0.02), D, h, 0.15, 0.03, 0); this.mesh(RB(0.05, 0.05, 0.04, 0.02), D, h, -0.15, 0.03, 0);
  }

  setTeamColor(hex) {
    this.teamHex = hex;
    if (hex == null) this.mAccent.color.set(this.skin.accent).multiplyScalar(1.5);
    else this.mAccent.color.set(hex).multiplyScalar(1.8);
  }

  setWeapon(id) {
    if (this.weaponGroup) { this.anchor.remove(this.weaponGroup); }
    this.weaponId = id;
    this.weaponGroup = makeWeaponModel(id, this.wskinId);
    this.anchor.add(this.weaponGroup);
    this.def = WEAPONS[id]; this.hold = HOLD[this.def.cls];
    this.equipT = 0;
  }
  setWeaponSkin(id) { this.wskinId = id; if (this.weaponId) { const w = this.weaponId; this.setWeapon(w); this.equipT = 1; } }
  get muzzle() { return this.weaponGroup.userData.muzzle; }

  // --- Trigger ---
  shoot() { this.shotT = 0.12; this.recoil = Math.min(1.5, this.recoil + (this.def.recoil || 1) * 0.28); if (this.def.cls === 'shotgun') this.pumpT = 0.6; }
  reload(dur) { this.reloadT = dur; this.reloadDur = dur; }
  hit(lx, lz) { this.hitT = 0.32; this.hitX = lx; this.hitZ = lz; }
  dash() { this.dashT = 0.26; }
  throwNade() { this.throwT = 0.55; }
  melee() { this.meleeT = 0.42; }
  die(lx = 0, lz = 0) { if (!this.alive) return; this.alive = false; this.deadT = 0; this.fallDir = lz >= 0 ? -1 : 1; }
  revive() { this.alive = true; this.deadT = 0; this.rig.rotation.set(0, 0, 0); this.rig.position.set(0, 0, 0); this.root.scale.setScalar(1); this.spawnT = 0; this.root.visible = true; }

  // IK: Schulter-Wurzel (chest-lokal), Ziel (chest-lokal), Pol -> setzt up/fo Quaternions
  solveArm(arm, target, pole) {
    const S = arm.sh.position;
    _v.copy(target).sub(S); let d = _v.length();
    const maxR = UA + FA - 0.005, minR = Math.abs(UA - FA) + 0.02;
    d = clamp(d, minR, maxR); _v.normalize();
    const along = (UA * UA - FA * FA + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, UA * UA - along * along));
    _p.copy(pole).addScaledVector(_v, -pole.dot(_v)).normalize();
    _m.copy(S).addScaledVector(_v, along).addScaledVector(_p, hgt);          // Ellbogen (chest-lokal)
    _u.copy(_m).sub(S).normalize();
    _q1.setFromUnitVectors(DOWN, _u); arm.up.quaternion.copy(_q1);
    _u.copy(S).addScaledVector(_v, d).sub(_m).normalize();                    // Ellbogen->Hand
    _q2.setFromUnitVectors(DOWN, _u); arm.fo.quaternion.copy(_q1).invert().multiply(_q2);
  }

  update(dt, s) {
    const R = this.root;
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    // ---------- Tod ----------
    if (!this.alive) {
      this.deadT += dt;
      const k = smoothstep(0, 0.5, this.deadT);
      this.rig.rotation.x = this.fallDir * 1.5 * k; this.rig.position.y = 0.0;
      this.rig.position.z = -this.fallDir * 0.2 * k;
      const lim = k;
      for (const a of this.arms) { a.up.rotation.set(0.3 * lim, 0, a.side * 0.9 * lim); a.fo.rotation.set(-0.3, 0, 0); }
      for (const l of this.legs) { l.thigh.rotation.x = 0.1; l.shin.rotation.x = 0.2; }
      if (this.deadT > 3.2) R.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 3.2) * 1.5));
      if (this.deadT > 4.7) R.visible = false;
      this.weaponGroup.visible = this.deadT < 0.4;
      return;
    }
    this.weaponGroup.visible = this.throwT <= 0.05;
    const def = this.def, hold = this.hold;
    // ---------- Locomotion ----------
    const speed = s.speed || 0, grounded = s.grounded !== false;
    const lf = s.lf || 0, ls = s.ls || 0;
    this.crouchK += ((s.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    this.sprintK += ((s.sprint && speed > 4 ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    this.aimK += ((s.aim ? 1 : 0) - this.aimK) * Math.min(1, dt * 12);
    let ang = speed > 0.4 ? Math.atan2(ls, lf) : 0; let backward = 1;
    if (Math.abs(ang) > Math.PI / 2) { ang -= Math.sign(ang) * Math.PI; backward = -1; }
    const targetYaw = speed > 0.4 ? -ang * 0.85 : 0;
    this.legYaw += angDiff(this.legYaw, targetYaw) * Math.min(1, dt * 10);
    this.hips.rotation.y = this.legYaw; this.spine.rotation.y = -this.legYaw * 0.85;
    const crouchSpeedK = this.crouchK > 0.5 ? 1.5 : 1;
    this.phase += dt * speed * 2.3 * backward * crouchSpeedK * (grounded ? 1 : 0);
    const run = clamp(speed / 8.4, 0, 1), moving = clamp(speed / 1.5, 0, 1);
    const A = (0.22 + 0.7 * run) * moving, K = (0.5 + 0.9 * run) * moving;
    const bob = Math.abs(Math.sin(this.phase)) * (0.02 + 0.05 * run) * moving;
    // Landung / Sprung
    if (grounded && !this.wasGrounded) this.landT = clamp(-this.vyPrev / 12, 0.2, 1) * 0.28;
    this.wasGrounded = grounded; this.vyPrev = s.vy || 0;
    this.landT = Math.max(0, this.landT - dt);
    const landDip = Math.sin(this.landT / 0.28 * Math.PI) * 0.1 * (this.landT > 0 ? 1 : 0);
    this.dashT = Math.max(0, this.dashT - dt); const dashK = this.dashT / 0.26;
    const hipsY = 0.92 - 0.4 * this.crouchK - bob - landDip - dashK * 0.18;
    this.hips.position.y = hipsY; this.hips.position.z = 0.0;
    for (const l of this.legs) {
      const ph = this.phase + (l.side > 0 ? Math.PI : 0);
      let th = -Math.sin(ph) * A, sh = Math.max(0, Math.cos(ph)) * K * 1.1 + 0.05;
      if (!grounded) {
        const vy = s.vy || 0, rising = vy > 0;
        th = lerp(th, (l.side > 0 ? -0.9 : -0.2) * (rising ? 1 : 0.6), 0.85); sh = rising ? 1.2 : 0.6;
        if (s.jetpack) { th = (l.side > 0 ? 0.1 : -0.1); sh = 0.35; }
      }
      th += this.crouchK * -1.0 + dashK * (l.side > 0 ? -0.9 : 0.6);
      sh += this.crouchK * 1.7;
      l.thigh.rotation.x = th; l.shin.rotation.x = sh; l.foot.rotation.x = -(th + sh) * 0.55 + 0.1;
      l.thigh.rotation.z = l.side * 0.04 + (grounded ? 0 : l.side * 0.12);
    }
    // ---------- Oberkörper ----------
    this.hitT = Math.max(0, this.hitT - dt); const hk = this.hitT / 0.32, hkk = Math.sin(hk * Math.PI);
    const pitch = clamp(s.pitch || 0, -1.25, 1.25);
    this.shotT = Math.max(0, this.shotT - dt); this.recoil = Math.max(0, this.recoil - dt * 6);
    const lean = 0.07 * run + 0.35 * this.sprintK + 0.2 * this.crouchK + dashK * 0.7;
    this.chest.rotation.x = lean - pitch * 0.5 - this.hitZ * 0.35 * hkk + this.recoil * 0.03;
    this.chest.rotation.z = -this.hitX * 0.25 * hkk + ls * 0.01 * run;
    this.chest.rotation.y = this.hitX * 0.2 * hkk;
    this.spine.rotation.x = -pitch * 0.15;
    this.head.rotation.x = -pitch * 0.35 - this.chest.rotation.x * 0.35;
    this.neck.rotation.x = -pitch * 0.15;
    this.rig.rotation.x = dashK * 0.0; this.rig.rotation.z = 0;
    // Waffen-Anker-Pose
    let px = hold.pos[0], py = hold.pos[1], pz = hold.pos[2], rx = hold.rot[0], ry = hold.rot[1], rz = hold.rot[2];
    this.pumpT = Math.max(0, (this.pumpT || 0) - dt);
    const sprintLow = this.sprintK * (hold.twoHand ? 1 : 0.4);
    py -= 0.1 * sprintLow; rx += 0.7 * sprintLow; px += 0.06 * sprintLow;
    px = lerp(px, -0.02, this.aimK * 0.7); py = lerp(py, py + 0.03, this.aimK); pz = lerp(pz, pz + 0.02, this.aimK);
    // Equip
    this.equipT = Math.min(1, this.equipT + dt * 4); const eq = 1 - this.equipT; py -= eq * eq * 0.35; rx += eq * 1.2;
    // Rückstoß
    pz -= this.recoil * 0.05; rx -= this.recoil * 0.05 * (def.cls === 'melee' ? 0 : 1);
    // Nachladen
    let leftTarget = null, rt = 0;
    const wg = this.weaponGroup, ud = wg.userData;
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt); rt = 1 - this.reloadT / this.reloadDur;
      const bell = Math.sin(rt * Math.PI);
      if (def.cls === 'shotgun') { rz += 0.25 * bell; rx += 0.25 * bell; }
      else if (def.cls === 'launcher') { rx += 0.5 * bell; py -= 0.05 * bell; }
      else { rz += 0.5 * bell; rx += 0.25 * bell; py += 0.03 * bell; }
      if (ud.magMesh && def.cls !== 'shotgun' && def.cls !== 'launcher') { const o = smoothstep(0.2, 0.45, rt) * (1 - smoothstep(0.55, 0.75, rt)); ud.magMesh.position.y = (ud.magMesh.userData.y0 ??= ud.magMesh.position.y) - o * 0.28; ud.magMesh.visible = !(rt > 0.3 && rt < 0.5); }
    } else if (ud.magMesh) { ud.magMesh.visible = true; if (ud.magMesh.userData.y0 !== undefined) ud.magMesh.position.y = ud.magMesh.userData.y0; }
    if (ud.pump) ud.pump.position.z = (ud.pump.userData.z0 ??= ud.pump.position.z) - Math.sin(Math.min(1, (this.pumpT || 0) / 0.6) * Math.PI) * 0.1;
    // Nahkampf
    this.meleeT = Math.max(0, this.meleeT - dt);
    if (this.meleeT > 0) { const u = 1 - this.meleeT / 0.42; const sw = u < 0.35 ? -smoothstep(0, 0.35, u) * 0.8 : -0.8 + smoothstep(0.35, 0.7, u) * 2.4 * (1 - smoothstep(0.7, 1, u) * 0.6); rx = -0.9 + sw * 1.2 * (u < 0.35 ? 1 : 1); ry = -0.5 + smoothstep(0.3, 0.7, u) * 1.0; rz = -0.6 * Math.sin(u * Math.PI); px += 0.08 * Math.sin(u * Math.PI); pz += 0.25 * Math.sin(u * Math.PI); }
    this.anchor.position.set(px, py, pz); this.anchor.rotation.set(rx, ry, rz);
    this.anchor.updateMatrix();
    // Granatenwurf (rechter Arm FK) / Gadget
    this.throwT = Math.max(0, this.throwT - dt);
    // ---------- Arme ----------
    const poleR = POLE_R, poleL = POLE_L;
    const target = new THREE.Vector3();
    if (this.throwT > 0.05) {
      const u = 1 - this.throwT / 0.55;
      const a = u < 0.45 ? -2.5 * smoothstep(0, 0.45, u) : -2.5 + 3.4 * smoothstep(0.45, 0.8, u);
      this.armR.up.rotation.set(a, 0, -0.15); this.armR.fo.rotation.set(-0.5 + 0.4 * smoothstep(0.45, 0.8, u), 0, 0);
      this.armL.up.quaternion.identity(); this.armL.up.rotation.set(-0.5, 0, 0.2); this.armL.fo.rotation.set(-0.9, 0, 0);
    } else {
      // rechte Hand am Griff
      target.set(0, 0, 0).applyMatrix4(this.anchor.matrix); this.solveArm(this.armR, target, poleR);
      if (hold.twoHand) {
        let gl = ud.gripL.position.clone();
        if (this.reloadT > 0 || rt > 0) {
          const mg = ud.mag.position.clone();
          const t = rt;
          if (def.cls === 'shotgun') { const c = (Math.sin(t * 6 * Math.PI) * 0.5 + 0.5); gl.lerp(new THREE.Vector3(0.0, -0.05, 0.05), c * smoothstep(0, 0.1, t) * (1 - smoothstep(0.92, 1, t))); }
          else { const w = smoothstep(0.0, 0.2, t) * (1 - smoothstep(0.8, 1.0, t)); gl.lerp(mg, w); gl.y -= Math.sin(clamp((t - 0.25) / 0.5, 0, 1) * Math.PI) * 0.14 * w; }
        }
        target.copy(gl).applyMatrix4(this.anchor.matrix); this.solveArm(this.armL, target, poleL);
      } else {
        this.armL.up.quaternion.identity(); this.armL.up.rotation.set(0.2 + run * 0.4 * Math.sin(this.phase), 0, 0.15); this.armL.fo.rotation.set(-0.5, 0, 0);
      }
    }
    // Seltene Skins: Extras animieren
    if (this.skin.extras) tickExtras(this, dt, speed);
    // Schal
    if (this.scarf) { this.scarfLag += (clamp(speed / 8, 0, 1) - this.scarfLag) * Math.min(1, dt * 4); this.scarf.rotation.x = -0.3 * this.scarfLag + Math.sin(performance.now() * 0.006) * 0.05 + (grounded ? 0 : 0.35); }
    // Muzzle flash Skalierung / Klinge
    if (ud.blade) ud.blade.scale.y = 1 + Math.sin(performance.now() * 0.02) * 0.04;
  }

  getMuzzleWorld(out) { this.weaponGroup.userData.muzzle.getWorldPosition(out); return out; }
  dispose() { disposeExtras(this); }
}
