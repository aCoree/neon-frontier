// Lokaler Spieler: Bewegung (Laufen, Sprinten, Springen, Doppelsprung, Ducken, Dash), Gadgets, Third-Person-Kamera.
import * as THREE from 'three';
import { PLAYER, GADGETS, FL, WEAPONS } from '../shared/defs.js';
import { clamp, lerp, smoothstep } from '../shared/util.js';
import { SEA_LEVEL, zoneAt } from '../shared/mapdata.js';

const UP = new THREE.Vector3(0, 1, 0);

export class LocalPlayer {
  constructor(ctx) {
    this.c = ctx;
    Object.assign(this, { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, r: PLAYER.radius, h: PLAYER.height, stepUp: PLAYER.stepUp, grounded: false, ground: null, wall: false });
    this.yaw = 0; this.pitch = 0; this.crouch = false; this.crouchK = 0; this.sprint = false; this.aim = false; this.alive = false;
    this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3(); this.jumpsLeft = 1; this.coyote = 0; this.airT = 0;
    this.kickAcc = 0; this.lastKick = -9; this.shakeT = 0; this.camDist = 3.2; this.fovCur = 74; this.camPos = new THREE.Vector3(); this.pivot = new THREE.Vector3();
    this.stepAcc = 0; this.wasGrounded = true; this.lastLandVy = 0; this.padCd = 0; this.teleCd = 0; this.tpFlag = false;
    this.hook = null; this.fuel = 100; this.jetting = false; this.gcd = 0; this.beacon = null; this.knock = new THREE.Vector3(); this.speedH = 0;
    this.eyeY = 1.6; this.scoped = false; this.fl = 0; this.wade = false; this.shootHold = 0; this.deathCam = 0;
    this.lastFootsteps = 0;
  }

  spawn(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.vx = this.vy = this.vz = 0; this.yaw = yaw; this.pitch = 0; this.alive = true; this.grounded = false; this.crouch = false; this.crouchK = 0;
    this.hook = null; this.dashT = 0; this.jumpsLeft = 1; this.camDist = 3.2; this.tpFlag = true; this.deathCam = 0; this.h = PLAYER.height; this.kickAcc = 0;
  }
  get pos() { return { x: this.x, y: this.y, z: this.z }; }

  fwd(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  lookDir(out) { const cp = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp); }

  kick(k, rnd = 0) { this.pitch = clamp(this.pitch + k, -1.45, 1.45); this.yaw += (Math.random() - 0.5) * rnd; this.kickAcc += k; this.lastKick = performance.now(); }

  update(dt) {
    const c = this.c, inp = c.input, w = c.world, S = c.settings, T = c.T();
    const power = c.power;
    // ---------- Blick ----------
    if (this.alive && c.ctrl) {
      const sens = 0.0022 * S.sens * (this.aim ? (c.combat.def.zoom || 60) / 74 * 0.85 : 1);
      this.yaw -= inp.dx * sens; this.pitch = clamp(this.pitch - inp.dy * sens * (S.invertY ? -1 : 1), -1.45, 1.45);
    }
    // Rückstoß-Erholung
    if (this.kickAcc > 0 && performance.now() - this.lastKick > 110) { const rec = Math.min(this.kickAcc, Math.max(0.02, this.kickAcc * 6 * dt)); this.pitch -= rec * 0.7; this.kickAcc -= rec; }
    if (!this.alive) { this.deathCam += dt; this.vx *= 0.9; this.vz *= 0.9; }

    const ctrl = this.alive && c.ctrl;
    const fwdK = ctrl ? ((inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0)) : 0, rgtK = ctrl ? ((inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0)) : 0;
    const wantCrouch = ctrl && (inp.down('KeyC') || inp.down('ControlLeft'));
    // Aufstehen nur wenn Platz
    if (this.crouch && !wantCrouch) { const free = w.raycast(this.x, this.y + 1.1, this.z, 0, 1, 0, 0.72) < 0; if (free) this.crouch = false; }
    else if (wantCrouch) this.crouch = true;
    this.h = this.crouch ? PLAYER.crouchHeight : PLAYER.height;
    this.crouchK += ((this.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 14);
    this.aim = ctrl && inp.btn(2);
    const shooting = ctrl && inp.btn(0) && !c.combat.def.noAuto;
    this.sprint = ctrl && inp.down('ShiftLeft') && fwdK > 0 && !this.crouch && !this.aim && !(shooting && c.combat.def.kind !== 'melee') && !c.combat.reloadingHeavy();
    const wade = this.wade = this.y < SEA_LEVEL - 0.1 && w.terrain(this.x, this.z) < SEA_LEVEL - 0.1;
    let speed = this.crouch ? PLAYER.crouch : this.sprint ? PLAYER.sprint : PLAYER.walk;
    if (this.aim) speed *= 0.7; if (power.speed > 0) speed *= 1.35; if (wade) speed *= 0.62;
    if (c.combat.def.cls === 'launcher' || c.combat.def.cls === 'sniper') speed *= 0.95;
    // ---------- Dash ----------
    this.dashCd = Math.max(0, this.dashCd - dt); this.gcd = Math.max(0, this.gcd - dt);
    if (ctrl && inp.hit('KeyQ') && this.dashCd <= 0 && this.dashT <= 0) {
      this.fwd(this.dashDir); const sx = Math.cos(this.yaw) * -rgtK, sz = Math.sin(this.yaw) * rgtK;
      if (fwdK || rgtK) { this.dashDir.set(Math.sin(this.yaw) * fwdK + sx, 0, Math.cos(this.yaw) * fwdK + sz).normalize(); }
      this.dashT = PLAYER.dashTime; this.dashCd = PLAYER.dashCd; c.onDash && c.onDash(); if (this.crouch) this.crouch = false;
    }
    // ---------- Bewegung ----------
    const wish = new THREE.Vector3(Math.sin(this.yaw) * fwdK - Math.cos(this.yaw) * rgtK, 0, Math.cos(this.yaw) * fwdK + Math.sin(this.yaw) * rgtK);
    if (wish.lengthSq() > 0) wish.normalize();
    const grav = PLAYER.gravity * (c.lowGrav() ? 0.36 : 1) * (power.jump > 0 ? 0.8 : 1);
    if (this.hook) this.updateHook(dt);
    if (this.dashT > 0) {
      this.dashT -= dt; this.vx = this.dashDir.x * PLAYER.dashSpeed; this.vz = this.dashDir.z * PLAYER.dashSpeed; this.vy = Math.max(this.vy, 0) * 0.5 - 0.5;
      if (this.dashT <= 0) { this.vx *= 0.45; this.vz *= 0.45; }
    } else if (!this.hook) {
      const tvx = wish.x * speed, tvz = wish.z * speed;
      const acc = this.grounded ? (wish.lengthSq() > 0 ? 60 : 38) : 14;
      const dx = tvx - this.vx, dz = tvz - this.vz, dl = Math.hypot(dx, dz);
      if (dl > 1e-4) { const step = Math.min(dl, acc * dt); this.vx += dx / dl * step; this.vz += dz / dl * step; }
      if (!this.grounded && wish.lengthSq() === 0) { this.vx *= 1 - dt * 0.3; this.vz *= 1 - dt * 0.3; }
    }
    // Rückstoß durch Explosionen
    if (this.knock.lengthSq() > 0) { this.vx += this.knock.x; this.vy += this.knock.y; this.vz += this.knock.z; this.knock.set(0, 0, 0); this.grounded = false; }
    // Springen
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    if (ctrl && inp.hit('Space')) {
      if (this.coyote > 0 && this.dashT <= 0) { this.vy = PLAYER.jump * (power.jump > 0 ? 1.28 : 1) * (wade ? 0.8 : 1); this.grounded = false; this.coyote = 0; this.jumpsLeft = 1; c.onJump && c.onJump(false); if (this.hook) this.hook = null; }
      else if (this.jumpsLeft > 0 && !this.hook && c.gadget !== 'jetpack') { this.jumpsLeft--; this.vy = PLAYER.jump * 0.86 * (power.jump > 0 ? 1.2 : 1); c.onJump && c.onJump(true); }
      else if (this.hook) { this.hook = null; this.vy = Math.max(this.vy, 6); c.onGrappleEnd && c.onGrappleEnd(); }
    }
    // Jetpack
    this.jetting = false;
    if (ctrl && c.gadget === 'jetpack') {
      if (inp.down('Space') && !this.grounded && this.fuel > 0 && this.airT > 0.12) { this.jetting = true; this.vy = Math.min(8.5, this.vy + (44 - this.vy * 2) * dt * 1.0); this.fuel = Math.max(0, this.fuel - 36 * dt); if (wish.lengthSq() > 0) { this.vx += wish.x * 14 * dt; this.vz += wish.z * 14 * dt; } }
      else if (this.grounded) this.fuel = Math.min(100, this.fuel + 40 * dt); else this.fuel = Math.min(100, this.fuel + 6 * dt);
    }
    if (this.dashT <= 0 && !this.hook && !this.jetting) { this.vy -= grav * dt; if (this.vy < -42) this.vy = -42; }
    else if (this.jetting) this.vy -= grav * 0.2 * dt;
    if (wade && this.vy < -2) this.vy *= 0.6;
    // Plattformen / Pads / Teleporter
    this.padCd -= dt; this.teleCd -= dt;
    if (this.alive) {
      for (const p of c.map.pads) {
        if (this.padCd > 0) break;
        if (Math.abs(p.y - this.y) < 0.6 && Math.hypot(p.x - this.x, p.z - this.z) < p.r) { this.vy = p.vy; this.vx += p.vx; this.vz += p.vz; this.grounded = false; this.padCd = 0.5; this.jumpsLeft = 1; c.onPad && c.onPad(p); }
      }
      for (const t of c.map.tele) {
        if (this.teleCd > 0) break;
        if (Math.abs(t.y - this.y) < 1.0 && Math.hypot(t.x - this.x, t.z - this.z) < 1.3) { this.x = t.to.x; this.y = t.to.y + 0.1; this.z = t.to.z; this.vx = this.vy = this.vz = 0; this.teleCd = 2; this.tpFlag = true; c.onTeleport && c.onTeleport(t); }
      }
    }
    const wasG = this.grounded, preVy = this.vy;
    w.move(this, dt);
    // Mitnahme auf bewegten Plattformen passiert über das Anheben von y im Collider
    if (this.grounded && !wasG) { this.jumpsLeft = 1; if (preVy < -6) c.onLand && c.onLand(-preVy); }
    this.airT = this.grounded ? 0 : this.airT + dt;
    if (this.grounded) this.jumpsLeft = 1;
    this.speedH = Math.hypot(this.vx, this.vz);
    // Fallschaden/Void
    if (this.y < -45 && this.alive) c.onVoid && c.onVoid();
    // Schritte
    if (this.grounded && this.speedH > 1 && this.alive) {
      this.stepAcc += this.speedH * dt;
      const stride = this.sprint ? 2.5 : this.crouch ? 1.6 : 2.0;
      if (this.stepAcc > stride) { this.stepAcc = 0; c.onStep && c.onStep(this); }
    }
    // Gadget-Nutzung
    if (ctrl) this.gadgets(dt, T);
    // Flags
    let fl = 0;
    if (this.crouch) fl |= FL.CROUCH; if (this.sprint && this.speedH > 4) fl |= FL.SPRINT; if (!this.grounded) fl |= FL.AIR; if (this.dashT > 0) fl |= FL.DASH;
    if (c.combat.reloading) fl |= FL.RELOAD; if (this.aim) fl |= FL.AIM; if (this.hook) fl |= FL.GRAPPLE; if (this.jetting) fl |= FL.JET; if (c.combat.firedRecently()) fl |= FL.SHOOT;
    this.fl = fl;
  }

  // ---------- Gadgets ----------
  gadgets(dt, T) {
    const c = this.c, inp = c.input, g = c.gadget; if (!g) return;
    const usePressed = inp.hit('KeyF');
    if (g === 'grapple' && usePressed) {
      if (this.hook) { this.hook = null; c.onGrappleEnd && c.onGrappleEnd(); }
      else if (this.gcd <= 0) {
        const a = c.aimPoint(60);
        if (a && a.dist < 58 && a.hit) { this.hook = { x: a.x, y: a.y, z: a.z, t: 0 }; c.send({ k: 'gadget', t: 'hook', p: [a.x, a.y, a.z] }); c.onGrapple && c.onGrapple(this.hook); }
        else c.toast && c.toast('Kein Ziel in Reichweite');
      }
    } else if (g === 'teleporter' && usePressed) {
      if (!this.beacon) { this.beacon = { x: this.x, y: this.y, z: this.z }; c.send({ k: 'gadget', t: 'tele', p: [this.x, this.y, this.z] }); c.onBeacon && c.onBeacon(this.beacon); c.toast && c.toast('Anker gesetzt – F zum Zurückteleportieren'); }
      else if (this.gcd <= 0) { c.send({ k: 'gadget', t: 'teleback', p: [this.x, this.y, this.z] }); c.onTeleport && c.onTeleport({ x: this.x, y: this.y, z: this.z, local: true }); this.x = this.beacon.x; this.y = this.beacon.y + 0.1; this.z = this.beacon.z; this.vx = this.vy = this.vz = 0; this.tpFlag = true; this.beacon = null; this.gcd = GADGETS.teleporter.cd; c.onBeacon && c.onBeacon(null); }
    } else if (g === 'drone' && usePressed && this.gcd <= 0) { this.gcd = GADGETS.drone.cd; c.send({ k: 'gadget', t: 'drone' }); c.audio.droneSnd(); }
    else if (g === 'scanner' && usePressed && this.gcd <= 0) { this.gcd = GADGETS.scanner.cd; c.send({ k: 'gadget', t: 'scan' }); c.audio.scan(); }
  }
  updateHook(dt) {
    const h = this.hook, c = this.c; h.t += dt;
    const dx = h.x - this.x, dy = h.y - (this.y + 1), dz = h.z - this.z, d = Math.hypot(dx, dy, dz);
    if (d < 2.6 || h.t > 2.2) { this.hook = null; this.gcd = GADGETS.grapple.cd; this.vy = Math.max(this.vy, 3); c.onGrappleEnd && c.onGrappleEnd(); return; }
    const sp = 30; this.vx = lerp(this.vx, dx / d * sp, Math.min(1, dt * 7)); this.vy = lerp(this.vy, dy / d * sp + 2, Math.min(1, dt * 7)); this.vz = lerp(this.vz, dz / d * sp, Math.min(1, dt * 7)); this.grounded = false;
  }
  addKnock(x, y, z) { this.knock.set(x, y, z); }

  // ---------- Kamera ----------
  updateCamera(dt, cam, world, scopedWanted) {
    const c = this.c, S = c.settings;
    const eye = lerp(1.62, 1.2, this.crouchK);
    const dir = this.lookDir(new THREE.Vector3());
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.scoped = scopedWanted && this.aim && this.alive;
    let dist = this.scoped ? 0.0 : this.aim ? 1.9 : this.sprint ? 3.7 : this.dashT > 0 ? 4.3 : 3.3;
    let shoulder = this.scoped ? 0 : this.aim ? 0.48 : 0.62;
    this.camDist += (dist - this.camDist) * Math.min(1, dt * 9);
    let px = this.x, py = this.y + eye * 0.93, pz = this.z;
    if (!this.alive) { // Todeskamera: langsamer Orbit
      const t = this.deathCam, dd = 4.5 + Math.min(2, t * 0.6), a = this.yaw + Math.min(1.2, t * 0.4);
      const back = new THREE.Vector3(-Math.sin(a), 0.35, -Math.cos(a)).normalize();
      this.pivot.set(px, py, pz); const tw = world.raycast(px, py, pz, back.x, back.y, back.z, dd);
      const dc = tw >= 0 ? Math.max(0.6, tw - 0.3) : dd;
      cam.position.set(px + back.x * dc, py + back.y * dc, pz + back.z * dc); cam.lookAt(px, py, pz);
      cam.fov = lerp(cam.fov, 62, dt * 4); cam.updateProjectionMatrix(); return;
    }
    const ox = px + right.x * shoulder, oz = pz + right.z * shoulder;
    // Schulter-Offset kollisionsgeprüft
    let sh = shoulder; const sr = world.raycast(px, py, pz, right.x, 0, right.z, Math.abs(shoulder) + 0.25);
    if (sr >= 0) sh = Math.max(0, sr - 0.25);
    px += right.x * sh; pz += right.z * sh;
    this.pivot.set(px, py, pz);
    let d = this.camDist;
    const bx = -dir.x, by = -dir.y + 0.07, bz = -dir.z, bl = Math.hypot(bx, by, bz);
    const t = world.raycast(px, py, pz, bx / bl, by / bl, bz / bl, d + 0.3);
    if (t >= 0) d = Math.max(0.05, Math.min(d, t - 0.28));
    cam.position.set(px + bx / bl * d, py + by / bl * d, pz + bz / bl * d);
    // Screen-Shake
    const sk = c.shake() * S.shake;
    if (sk > 0.001) { cam.position.x += (Math.random() - 0.5) * sk * 0.35; cam.position.y += (Math.random() - 0.5) * sk * 0.35; cam.position.z += (Math.random() - 0.5) * sk * 0.35; }
    cam.rotation.set(this.pitch + (sk > 0.001 ? (Math.random() - 0.5) * sk * 0.03 : 0), this.yaw + Math.PI + (sk > 0.001 ? (Math.random() - 0.5) * sk * 0.03 : 0), 0, 'YXZ');
    // FOV
    const base = S.fov, def = c.combat.def;
    let fov = base + (this.sprint ? 7 : 0) + (this.dashT > 0 ? 12 : 0) + (this.hook ? 8 : 0);
    if (this.aim) fov = def.zoom ? Math.min(def.zoom * (base / 74), fov) : fov;
    if (this.aim && this.scoped) fov = def.zoom;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }
}
