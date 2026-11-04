// Entfernte Spieler/Bots: Interpolation, Animationszustände, Namensschilder; Drohnen; Pickup-Ansichten.
import * as THREE from 'three';
import { Character } from '../render/character.js';
import { makeWeaponModel } from '../render/weapons.js';
import { FL, WEAPONS, TEAMS, AMMO, CONSUMABLES, POWERUPS, GADGETS } from '../shared/defs.js';
import { lerp, lerpAngle, angDiff } from '../shared/util.js';

const DELAY = 0.11;

function plateTexture(text, color, sub) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '800 30px "Trebuchet MS", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 6; x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,0.7)'; x.strokeText(text, 128, 26);
  x.fillStyle = color; x.fillText(text, 128, 26);
  if (sub) { x.font = '700 18px Arial'; x.fillStyle = '#cfe6ff'; x.fillText(sub, 128, 52); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class RemoteEnt {
  constructor(info, scene, mode) {
    this.id = info.id; this.info = info; this.scene = scene; this.buf = [];
    this.char = new Character(info.skin, info.wskin);
    this.root = this.char.root; scene.add(this.root);
    this.team = info.team; this.alive = true; this.hp = 100; this.shield = 0; this.fl = 0; this.w = 'viper';
    this.vx = 0; this.vz = 0; this.vy = 0; this.speed = 0; this.px = null; this.pz = null; this.py = null; this.lastW = null; this.reloadWas = false;
    this.pos = new THREE.Vector3(); this.reveal = 0; this.kills = info.k || 0; this.deaths = info.d || 0; this.visible = true; this.losT = 0; this.los = true; this.footAcc = 0; this.landWas = true;
    this.teamColor = info.team >= 0 ? TEAMS[info.team].hex : null;
    if (this.teamColor != null) this.char.setTeamColor(this.teamColor);
    this.makePlate();
    this.root.visible = false;
  }
  makePlate() {
    const col = this.team >= 0 ? TEAMS[this.team].color : (this.info.bot ? '#ffd27a' : '#ffffff');
    const m = new THREE.SpriteMaterial({ map: plateTexture(this.info.name, col, 'Lv ' + (this.info.level || 1)), transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.plate = new THREE.Sprite(m); this.plate.scale.set(1.9, 0.48, 1); this.plate.renderOrder = 10;
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false, fog: false })); bg.scale.set(1.2, 0.1, 1); bg.position.set(0, -0.3, 0); bg.renderOrder = 10;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4dff8a, transparent: true, depthTest: false, fog: false })); this.bar.scale.set(1.16, 0.065, 1); this.bar.center.set(0, 0.5); this.bar.position.set(-0.58, -0.3, 0); this.bar.renderOrder = 11;
    this.shbar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4db8ff, transparent: true, depthTest: false, fog: false })); this.shbar.scale.set(1.16, 0.035, 1); this.shbar.center.set(0, 0.5); this.shbar.position.set(-0.58, -0.37, 0); this.shbar.renderOrder = 11;
    this.plate.add(bg, this.bar, this.shbar); this.scene.add(this.plate); this.bg = bg;
  }
  push(t, s) {
    this.buf.push({ t, ...s }); if (this.buf.length > 30) this.buf.shift();
    this.hp = s.hp; this.shield = s.sh; this.fl = s.fl;
    const dead = !!(s.fl & FL.DEAD);
    if (dead && this.alive) { /* Tod wird über Event behandelt */ }
  }
  teleportTo(x, y, z, yaw) { this.buf.length = 0; this.buf.push({ t: performance.now() / 1000 - 1, x, y, z, yaw, pitch: 0, fl: 0, w: this.w, hp: 100, sh: 0 }); this.pos.set(x, y, z); this.px = null; }
  update(dt, now, ctx) {
    const b = this.buf; if (!b.length) return;
    const rt = now - DELAY;
    let a = b[0], c = b[b.length - 1];
    for (let i = b.length - 1; i > 0; i--) if (b[i - 1].t <= rt) { a = b[i - 1]; c = b[i]; break; }
    let u = c.t > a.t ? (rt - a.t) / (c.t - a.t) : 1; u = Math.max(0, Math.min(1.4, u));
    const x = lerp(a.x, c.x, u), y = lerp(a.y, c.y, u), z = lerp(a.z, c.z, u), yaw = lerpAngle(a.yaw, c.yaw, Math.min(1, u)), pitch = lerp(a.pitch, c.pitch, Math.min(1, u));
    const ch = this.char, dead = !!(c.fl & FL.DEAD);
    this.pos.set(x, y, z);
    this.root.position.set(x, y, z); this.root.rotation.y = yaw; this.yaw = yaw;
    // Geschwindigkeit (geglättet)
    if (this.px !== null && dt > 0) { const k = Math.min(1, dt * 12); this.vx += ((x - this.px) / dt - this.vx) * k; this.vz += ((z - this.pz) / dt - this.vz) * k; this.vy += ((y - this.py) / dt - this.vy) * k; }
    this.px = x; this.pz = z; this.py = y;
    const sp = Math.hypot(this.vx, this.vz);
    if (dead && ch.alive) ch.die(0, 1); else if (!dead && !ch.alive) ch.revive();
    this.alive = !dead;
    const fl = c.fl;
    if (c.w !== this.lastW && WEAPONS[c.w]) { ch.setWeapon(c.w); this.lastW = c.w; ctx.onRemoteSwap && ctx.onRemoteSwap(this); }
    const rel = !!(fl & FL.RELOAD); if (rel && !this.reloadWas) { const d = WEAPONS[c.w]; ch.reload(d.reload); ctx.onRemoteReload && ctx.onRemoteReload(this, d); } this.reloadWas = rel;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    ch.update(dt, {
      speed: sp > 0.3 ? sp : 0, grounded: !(fl & FL.AIR), vy: this.vy, crouch: !!(fl & FL.CROUCH), sprint: !!(fl & FL.SPRINT), aim: !!(fl & FL.AIM), pitch,
      lf: this.vx * fx + this.vz * fz, ls: -this.vx * Math.cos(yaw) + this.vz * Math.sin(yaw), jetpack: !!(fl & FL.JET),
    });
    // Barriere / Spawn-Schutz Effekt
    this.root.visible = this.visible;
    // Schritte
    if (!(fl & FL.AIR) && sp > 1.2 && this.alive) { this.footAcc += sp * dt; const stride = (fl & FL.SPRINT) ? 2.6 : (fl & FL.CROUCH) ? 1.7 : 2.1; if (this.footAcc > stride) { this.footAcc = 0; ctx.onRemoteStep && ctx.onRemoteStep(this); } }
    if (this.landWas === false && !(fl & FL.AIR)) ctx.onRemoteLand && ctx.onRemoteLand(this);
    this.landWas = !(fl & FL.AIR);
    // Namensschild
    const showPlate = this.alive && this.visible && ctx.plateOK(this);
    this.plate.visible = showPlate;
    if (showPlate) {
      this.plate.position.set(x, y + (fl & FL.CROUCH ? 1.85 : 2.3), z);
      this.bar.scale.x = 1.16 * Math.max(0.001, this.hp / 100); this.bar.material.color.setHex(this.hp > 50 ? 0x4dff8a : this.hp > 25 ? 0xffd24a : 0xff4d4d);
      this.shbar.scale.x = 1.16 * Math.max(0.001, this.shield / 100);
      const d = ctx.camPos.distanceTo(this.root.position); const s = THREE.MathUtils.clamp(d * 0.12, 0.8, 3.0); this.plate.scale.set(1.9 * s * 0.75, 0.48 * s * 0.75, 1);
      this.bar.position.x = -0.58; this.bg.visible = this.shbar.visible = this.bar.visible = ctx.showBars(this);
    }
  }
  setVisible(v) { this.visible = v; this.root.visible = v; }
  dispose() { this.scene.remove(this.root); this.scene.remove(this.plate); this.plate.material.map.dispose(); }
}

// --------- Pickup-Ansichten ---------
const KIND_COL = { weapon: 0xffd24a, ammo: 0xfff08a, cons: 0x6bff9a, power: 0xb36bff, gadget: 0x4de1ff, shard: 0x4de8ff };
export class PickupView {
  constructor(scene) { this.scene = scene; this.items = new Map(); this.t = 0; this.shared = {}; this.timer = 0; }
  mat(hex, k = 2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }); }
  build(p) {
    const g = new THREE.Group(); const col = p.kind === 'weapon' ? (WEAPONS[p.item]?.color ?? 0xffd24a) : p.kind === 'ammo' ? new THREE.Color(AMMO[p.item]?.color || '#fff').getHex() : p.kind === 'cons' ? new THREE.Color(CONSUMABLES[p.item]?.color || '#fff').getHex() : p.kind === 'power' ? new THREE.Color(POWERUPS[p.item]?.color || '#fff').getHex() : p.kind === 'gadget' ? new THREE.Color(GADGETS[p.item]?.color || '#fff').getHex() : KIND_COL[p.kind];
    const body = new THREE.Group(); g.add(body);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e2228, metalness: 0.7, roughness: 0.4 });
    switch (p.kind) {
      case 'weapon': { const m = makeWeaponModel(p.item, 'default'); m.scale.setScalar(0.85); m.rotation.y = Math.PI / 2; m.position.set(0, 0, 0); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); body.add(m); body.userData.base = 0.9; break; }
      case 'ammo': { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.34), dark); const s = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.36), this.mat(col, 2)); s.position.y = 0.06; const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.35), this.mat(col, 1.4)); t2.position.set(0.12, 0.12, 0); body.add(b, s, t2); body.userData.base = 0.65; break; }
      case 'cons': {
        if (p.item === 'medkit') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 })); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.31), this.mat(0xff3050, 1.6)); const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.31), this.mat(0xff3050, 1.6)); c1.position.z = c2.position.z = 0; body.add(b, c1, c2); }
        else if (p.item === 'shieldpot') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.34, 12), new THREE.MeshStandardMaterial({ color: 0x4db8ff, emissive: 0x2a7fd0, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), dark); n.position.y = 0.24; body.add(b, n); }
        else if (p.item === 'grenade') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.5, metalness: 0.4 })); const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), this.mat(0xffb347, 1.8)); r.rotation.x = Math.PI / 2; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6), dark); t.position.y = 0.22; body.add(b, r, t); }
        else { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.4, metalness: 0.6 })); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.08, 12), this.mat(0xc9d2dc, 1.2)); t.position.y = 0.1; body.add(b, t); }
        body.userData.base = 0.7; break;
      }
      case 'power': { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.mat(col, 2.2)); const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 28), this.mat(col, 2)); const r2 = r1.clone(); r2.rotation.x = Math.PI / 2; body.add(o, r1, r2); body.userData.base = 0.95; body.userData.spin2 = [r1, r2]; break; }
      case 'gadget': { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshStandardMaterial({ color: 0x20262e, emissive: col, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.3 })); const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 28), this.mat(col, 2)); r1.rotation.x = Math.PI / 2; body.add(o, r1); body.userData.base = 0.95; break; }
      case 'shard': { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), this.mat(0x4de8ff, 2.4)); o.scale.y = 1.6; body.add(o); body.userData.base = 1.0; break; }
    }
    // Leuchtsäule + Boden-Ring
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.34, 3.0, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: p.kind === 'shard' ? 0.22 : 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); beam.position.y = 1.5; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8), transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.position.set(p.x, p.y, p.z); g.userData = { p, body, ring, beam, ph: Math.random() * 6 };
    body.position.y = body.userData.base ?? 0.8;
    return g;
  }
  add(p) { if (this.items.has(p.id)) return; const g = this.build(p); g.visible = false; this.scene.add(g); this.items.set(p.id, { g, on: true, p }); }
  setOn(id, on) { const it = this.items.get(id); if (it) it.on = on; }
  remove(id) { const it = this.items.get(id); if (!it) return; this.scene.remove(it.g); this.items.delete(id); }
  clear() { for (const it of this.items.values()) this.scene.remove(it.g); this.items.clear(); }
  update(dt, t, cam) {
    this.timer -= dt; const doVis = this.timer <= 0; if (doVis) this.timer = 0.2;
    for (const it of this.items.values()) {
      const g = it.g;
      if (doVis) { const dx = it.p.x - cam.x, dz = it.p.z - cam.z, d = dx * dx + dz * dz; it.near = d < 45 * 45; g.visible = it.on && d < 85 * 85; it.far = d > 45 * 45; }
      if (!g.visible) continue;
      const u = g.userData;
      if (!it.far) {
        u.body.rotation.y = t * 1.4 + u.ph; u.body.position.y = (u.body.userData.base ?? 0.8) + Math.sin(t * 2 + u.ph) * 0.09;
        if (u.body.userData.spin2) { u.body.userData.spin2[0].rotation.z = t * 2; u.body.userData.spin2[1].rotation.y = t * 1.6; }
        u.ring.scale.setScalar(1 + Math.sin(t * 3 + u.ph) * 0.08);
      }
    }
  }
}

// --------- Drohnen ---------
export class DroneView {
  constructor(scene) { this.scene = scene; this.map = new Map(); }
  sync(list, team, now) {
    const seen = new Set();
    for (const [id, x, y, z, own, tm] of list) {
      seen.add(id); let d = this.map.get(id);
      if (!d) {
        const g = new THREE.Group(); const dark = new THREE.MeshStandardMaterial({ color: 0x20262e, metalness: 0.8, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), dark); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4dffb8).multiplyScalar(3), toneMapped: false })); eye.position.z = 0.18;
        const rot = new THREE.Group(); for (let i = 0; i < 4; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.05), dark); arm.rotation.y = i * Math.PI / 2 + 0.78; arm.position.y = 0.12; rot.add(arm); }
        g.add(body, eye, rot); g.userData.rot = rot; this.scene.add(g); d = { g, tx: x, ty: y, tz: z }; this.map.set(id, d); g.position.set(x, y, z);
      }
      d.tx = x; d.ty = y; d.tz = z;
    }
    for (const [id, d] of this.map) if (!seen.has(id)) { this.scene.remove(d.g); this.map.delete(id); }
  }
  update(dt, t) { for (const d of this.map.values()) { d.g.position.x += (d.tx - d.g.position.x) * Math.min(1, dt * 10); d.g.position.y += (d.ty - d.g.position.y) * Math.min(1, dt * 10); d.g.position.z += (d.tz - d.g.position.z) * Math.min(1, dt * 10); d.g.userData.rot.rotation.y = t * 30; } }
  pos(id) { const d = this.map.get(id); return d ? d.g.position : null; }
}
