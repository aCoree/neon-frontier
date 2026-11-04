// Bot-KI: Wahrnehmung, Pfadsuche (A*), Deckung, Verfolgung, Zielen mit Fehlerstreuung, Waffenwahl, Granaten.
import { WEAPONS, DIFFS, PLAYER, FL, THROWABLES } from '../defs.js';
import { clamp, lerp, angDiff, TAU } from '../util.js';

const PREF = { pistol: 12, rifle: 18, smg: 9, shotgun: 6, dmr: 28, sniper: 48, launcher: 20, plasma: 16, laser: 14, melee: 1.8 };
const LOADOUT = {
  easy: ['striker', 'hornet', 'breaker', 'pulse'], normal: ['striker', 'hornet', 'breaker', 'marksman', 'pulse', 'magnum', 'lancer'],
  hard: ['striker', 'hornet', 'breaker', 'marksman', 'pulse', 'magnum', 'lancer', 'stormcaller', 'longshot', 'striker'],
};

export class Bots {
  constructor(room) { this.room = room; this.budget = 0; }
  rnd() { return this.room.rng(); }

  init(e) {
    e.ai = { state: 'roam', tgt: null, seen: false, lastSeen: null, path: null, pi: 0, repathAt: 0, goal: null, strafe: 1, strafeAt: 0, nextPercept: 0, reactAt: 0, mag: {}, reloadUntil: 0, stuckT: 0, lastX: 0, lastZ: 0, checkAt: 0, jumpAt: 0, burstEnd: 0, pauseUntil: 0, grenadeAt: 0, wantW: 'viper', wAt: 0, cover: null, hurtAt: -9, hurtBy: null, shootFl: 0, yawV: 0, desiredYaw: 0, healAt: 0, dummyT: this.rnd() * 6, fireNext: 0, crouchUntil: 0 };
    e.r = PLAYER.radius; e.h = PLAYER.height; e.grounded = true; e.stepUp = PLAYER.stepUp;
  }
  onSpawn(e) {
    const ai = e.ai; ai.path = null; ai.tgt = null; ai.seen = false; ai.lastSeen = null; ai.cover = null; ai.reloadUntil = 0;
    if (e.dummy) return;
    const set = LOADOUT[e.diff] || LOADOUT.normal;
    const p1 = set[Math.floor(this.rnd() * set.length)];
    if (!e.owned.includes(p1)) e.owned.push(p1);
    if (this.rnd() < 0.35) { const p2 = set[Math.floor(this.rnd() * set.length)]; if (!e.owned.includes(p2)) e.owned.push(p2); }
    e.w = p1; ai.mag = {}; for (const w of e.owned) ai.mag[w] = WEAPONS[w].mag;
    e.cons.grenade = this.rnd() < 0.6 ? 2 : 0; e.cons.medkit = 1;
    ai.nextPercept = this.room.T + 0.4 + this.rnd() * 0.5;
  }
  onWeapon(e, w) { e.ai.mag[w] = WEAPONS[w].mag; }
  onDeath(e) { e.ai.path = null; e.ai.tgt = null; }
  onHurt(v, att) {
    const ai = v.ai, T = this.room.T; ai.hurtAt = T; ai.hurtBy = att.id;
    if (!ai.tgt || !ai.seen) { ai.tgt = att.id; ai.lastSeen = { x: att.x, y: att.y, z: att.z, t: T }; ai.reactAt = Math.max(ai.reactAt, T + (DIFFS[v.diff] || DIFFS.normal).react * 0.6); }
  }

  update(dt) {
    this.budget = 3;
    for (const e of this.room.ents.values()) if (e.isBot && e.alive) this.think(e, dt);
  }

  eye(e) { return e.y + (e.crouch ? 1.15 : 1.58); }
  inSmoke(x, y, z) { for (const s of this.room.smokes) if (Math.hypot(x - s.x, y - s.y - 1, z - s.z) < s.r) return true; return false; }
  visible(e, t) {
    const ex = e.x, ey = this.eye(e), ez = e.z, tx = t.x, ty = t.y + 1.2, tz = t.z;
    if (this.inSmoke(tx, ty, tz) || this.inSmoke(ex, ey, ez)) return false;
    return this.room.world.los(ex, ey, ez, tx, ty, tz);
  }

  perceive(e, ai, D) {
    const room = this.room, T = room.T;
    let best = null, bd = 1e9;
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    for (const t of room.ents.values()) {
      if (t === e || !t.alive || !room.isEnemy(e, t) || t.dummy) continue;
      const dx = t.x - e.x, dz = t.z - e.z, dy = t.y - e.y, d = Math.hypot(dx, dz);
      if (d > D.view) continue;
      const heard = t.lastShot > T - 0.5 && d < 45;
      const dot = (dx * fx + dz * fz) / (d || 1);
      const inFov = dot > 0.34 || d < 9 || (T - ai.hurtAt < 2 && ai.hurtBy === t.id);
      if (!inFov && !heard) continue;
      if (Math.abs(dy) > 25) continue;
      if (!this.visible(e, t)) { if (heard && d < bd) { ai.lastSeen = { x: t.x, y: t.y, z: t.z, t: T - 1 }; } continue; }
      if (d < bd) { bd = d; best = t; }
    }
    // Trainings-Dummies zählen als Ziele (Bots greifen sie nicht an)
    if (best) {
      if (ai.tgt !== best.id || !ai.seen) ai.reactAt = T + D.react * (0.6 + this.rnd() * 0.9);
      ai.tgt = best.id; ai.seen = true; ai.lastSeen = { x: best.x, y: best.y, z: best.z, t: T };
    } else if (ai.seen) { ai.seen = false; }
  }

  pickWeapon(e, ai, dist) {
    let best = e.w, bs = -1e9;
    for (const w of e.owned) {
      const def = WEAPONS[w]; if (def.cls === 'melee' && dist > 3) continue;
      const mag = ai.mag[w] ?? def.mag;
      const pref = PREF[def.cls] ?? 15;
      let s = (def.dmg * (def.pellets || 1) * def.rate) / 20 - Math.abs(dist - pref) * 0.25;
      if (def.cls === 'melee') s = dist < 3 ? 12 : -50;
      if (mag <= 0 && def.mag > 0) s -= 8;
      if (def.cls === 'launcher' && dist < 8) s -= 20;
      if (def.cls === 'sniper' && dist < 15) s -= 15;
      if (s > bs) { bs = s; best = w; }
    }
    return best;
  }

  repath(e, ai, gx, gz) {
    if (this.budget <= 0) return false; this.budget--;
    const p = this.room.nav.path(e.x, e.z, gx, gz);
    ai.path = p; ai.pi = p && p.length > 1 ? 1 : 0; ai.goal = { x: gx, z: gz }; ai.repathAt = this.room.T + 1.4 + this.rnd();
    return !!p;
  }
  pickRoamGoal(e, ai) {
    const room = this.room, nav = room.nav;
    // Pickups mit Mehrwert bevorzugen
    if (this.rnd() < 0.6) {
      let list = room.pickups.filter(p => p.on && p.kind !== 'shard' && p.kind !== 'gadget' && Math.abs(p.y - e.y) < 1.2 && nav.isWalk(p.x, p.z));
      if (e.diff === 'easy') list = list.filter(p => p.kind !== 'power');
      list.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
      const c = list.slice(0, 5); if (c.length) { const p = c[Math.floor(this.rnd() * c.length)]; return { x: p.x, z: p.z }; }
    }
    const humans = [...room.ents.values()].filter(t => !t.isBot && t.alive && room.isEnemy(e, t));
    if (humans.length && this.rnd() < 0.4) { const h = humans[Math.floor(this.rnd() * humans.length)]; const g = nav.randomWalk(() => this.rnd(), h.x, h.z, 25); if (g) return g; }
    const g = nav.randomWalk(() => this.rnd(), e.x, e.z, 70) || nav.randomWalk(() => this.rnd(), 0, 0, 180); return g;
  }
  findCover(e, ai, from) {
    const nav = this.room.nav, world = this.room.world; let best = null, bs = 1e9;
    for (let i = 0; i < 14; i++) {
      const c = nav.randomWalk(() => this.rnd(), e.x, e.z, 14); if (!c) continue;
      if (world.los(from.x, from.y + 1.5, from.z, c.x, c.y + 1.1, c.z)) continue;
      const d = Math.hypot(c.x - e.x, c.z - e.z) + Math.hypot(c.x - from.x, c.z - from.z) * -0.05;
      if (d < bs) { bs = d; best = c; }
    }
    return best;
  }

  think(e, dt) {
    const room = this.room, ai = e.ai, T = room.T, D = DIFFS[e.diff] || DIFFS.normal, W = room.world;
    if (e.dummy) return this.dummy(e, ai, dt);
    if (T < e.spawnInv - 2.4 || room.state !== 'playing') return;
    if (T >= ai.nextPercept) { ai.nextPercept = T + 0.16 + this.rnd() * 0.12; this.perceive(e, ai, D); }
    let tgt = ai.tgt ? room.ents.get(ai.tgt) : null;
    if (tgt && !tgt.alive) { ai.tgt = null; tgt = null; ai.seen = false; }
    const seen = !!(tgt && ai.seen);
    const hurt = e.hp < 40 && e.shield <= 0;
    let state = 'roam';
    if (seen && hurt && e.diff !== 'easy') state = 'cover';
    else if (seen && T >= ai.reactAt) state = 'combat';
    else if (seen) state = 'react';
    else if (ai.lastSeen && T - ai.lastSeen.t < 6 && tgt) state = 'hunt';
    else if (hurt && e.cons.medkit > 0) state = 'heal';
    ai.state = state;
    let moveX = 0, moveZ = 0, speed = 0, wantJump = false, crouch = false, sprint = false;
    let lookYaw = e.yaw, lookPitch = 0, aimOK = false;
    const eyeY = this.eye(e);
    const dist = tgt ? Math.hypot(tgt.x - e.x, tgt.z - e.z) : 0;

    // ---- Waffenwahl ----
    if (T >= ai.wAt) { ai.wAt = T + 1.2 + this.rnd(); const w = this.pickWeapon(e, ai, dist || 20); if (w !== e.w) { e.w = w; ai.fireNext = T + 0.35; } }
    const def = WEAPONS[e.w]; const mag = ai.mag[e.w] ?? def.mag;
    // Nachladen
    if (def.mag > 0 && mag <= 0 && T >= ai.reloadUntil) { ai.reloadUntil = T + def.reload; ai.mag[e.w] = def.mag; }
    const reloading = T < ai.reloadUntil;
    if (def.mag > 0 && mag < def.mag * 0.3 && !seen && T >= ai.reloadUntil) { ai.reloadUntil = T + def.reload; ai.mag[e.w] = def.mag; }

    if (state === 'combat' || state === 'react' || state === 'cover') {
      const tx = tgt.x, ty = tgt.y + 1.2, tz = tgt.z;
      // Zielen (mit Vorhalt)
      let ax = tx, ay = ty, az = tz;
      if (def.kind === 'proj' || def.kind === 'hitscan') {
        const sp = def.proj ? def.proj.speed : 400, tt = Math.hypot(tx - e.x, tz - e.z) / sp;
        const lead = def.proj ? 1 : 0.35; ax += tgt.vx * tt * lead; az += tgt.vz * tt * lead;
        if (def.kind === 'proj' && def.proj.type === 'rocket') ay = tgt.y + 0.3;
      }
      const dx = ax - e.x, dy = ay - eyeY, dz = az - e.z, hd = Math.hypot(dx, dz) || 1;
      lookYaw = Math.atan2(dx, dz); lookPitch = Math.atan2(dy, hd);
      if (state === 'combat') {
        const pref = (PREF[def.cls] ?? 15) * (e.diff === 'easy' ? 1.1 : 1);
        if (def.cls === 'melee' || dist > pref * 1.3) {
          if (T >= ai.repathAt || !ai.path) this.repath(e, ai, tgt.x, tgt.z);
          const m = this.follow(e, ai, dt); moveX = m.x; moveZ = m.z; speed = PLAYER.sprint * 0.9 * D.speed; sprint = true;
        } else if (dist < pref * 0.55) {
          const bx = e.x - tgt.x, bz = e.z - tgt.z, bl = Math.hypot(bx, bz) || 1; moveX = bx / bl; moveZ = bz / bl; speed = PLAYER.walk * 0.9 * D.speed;
        } else {
          if (T >= ai.strafeAt) { ai.strafeAt = T + 0.7 + this.rnd() * 1.4; ai.strafe = this.rnd() < 0.5 ? -1 : 1; if (this.rnd() < 0.15) ai.crouchUntil = T + 0.9; if (e.diff !== 'easy' && this.rnd() < 0.2) wantJump = true; }
          moveX = Math.cos(lookYaw) * ai.strafe; moveZ = -Math.sin(lookYaw) * ai.strafe; speed = PLAYER.walk * 0.8 * D.speed;
        }
        crouch = T < ai.crouchUntil;
      } else if (state === 'cover') {
        if (!ai.cover || T > ai.cover.until) { const c = this.findCover(e, ai, tgt); ai.cover = c ? { ...c, until: T + 5 } : null; if (c) this.repath(e, ai, c.x, c.z); }
        if (ai.cover) { const m = this.follow(e, ai, dt); moveX = m.x; moveZ = m.z; speed = PLAYER.sprint * D.speed; sprint = true; if (Math.hypot(ai.cover.x - e.x, ai.cover.z - e.z) < 1.5) { speed = 0; crouch = true; } }
        else { const bx = e.x - tgt.x, bz = e.z - tgt.z, bl = Math.hypot(bx, bz) || 1; moveX = bx / bl; moveZ = bz / bl; speed = PLAYER.sprint * D.speed; }
      }
      // Schießen
      const yawErr = Math.abs(angDiff(e.yaw, lookYaw));
      aimOK = yawErr < 0.2 + 0.1 * (def.cls === 'shotgun');
      if ((state === 'combat' || (state === 'cover' && e.diff === 'hard')) && aimOK && !reloading && mag > 0 && T >= ai.fireNext) {
        const visible = this.visible(e, tgt);
        if (visible) this.shoot(e, ai, def, tgt, dx, dy, dz, D, dist);
      }
      // Granaten
      if (state === 'combat' && e.cons.grenade > 0 && T >= ai.grenadeAt && dist > 9 && dist < 26 && e.diff !== 'easy') {
        ai.grenadeAt = T + 9 + this.rnd() * 8;
        const R = dist, el = Math.asin(clamp(R * 22 / (19 * 19), 0.05, 0.98)) / 2 + 0.05;
        const hx = Math.sin(lookYaw), hz = Math.cos(lookYaw);
        room.throwItem(e, 'grenade', [e.x, eyeY, e.z], [hx * Math.cos(el), Math.sin(el) - 0.18, hz * Math.cos(el)]);
        e.cons.grenade = Math.max(0, e.cons.grenade);
      }
    } else if (state === 'hunt') {
      if (T >= ai.repathAt || !ai.path) this.repath(e, ai, ai.lastSeen.x, ai.lastSeen.z);
      const m = this.follow(e, ai, dt); moveX = m.x; moveZ = m.z; speed = PLAYER.sprint * 0.95 * D.speed; sprint = true;
      lookYaw = speed > 0.1 ? Math.atan2(moveX, moveZ) : e.yaw;
      if (Math.hypot(ai.lastSeen.x - e.x, ai.lastSeen.z - e.z) < 3) { ai.lastSeen = null; ai.tgt = null; }
    } else if (state === 'heal') {
      speed = 0; crouch = true; if (T >= ai.healAt) { ai.healAt = T + 2; room.onUse(e.member || { }, e, { t: 'medkit' }); }
    } else {
      // Streifen
      if (!ai.goal || !ai.path || ai.pi >= ai.path.length || T >= ai.repathAt + 8) { const g = this.pickRoamGoal(e, ai); if (g) this.repath(e, ai, g.x, g.z); }
      const m = this.follow(e, ai, dt); moveX = m.x; moveZ = m.z; speed = m.has ? PLAYER.sprint * 0.72 * D.speed : 0;
      if (m.has) lookYaw = Math.atan2(moveX, moveZ);
      if (e.cons.medkit > 0 && e.hp < 70 && T >= ai.healAt) { ai.healAt = T + 3; room.onUse(e.member || {}, e, { t: 'medkit' }); }
    }

    // ---- Drehung ----
    const turn = (e.diff === 'hard' ? 12 : e.diff === 'normal' ? 8 : 5) * dt;
    const dyaw = angDiff(e.yaw, lookYaw); e.yaw += clamp(dyaw, -turn, turn);
    e.pitch += clamp(lookPitch - e.pitch, -turn, turn);
    if (e.yaw > Math.PI) e.yaw -= TAU; if (e.yaw < -Math.PI) e.yaw += TAU;

    // ---- Bewegung ----
    const wasCrouch = e.crouch; e.crouch = crouch;
    const gs = room.lowgravUntil > T ? 0.38 : 1;
    const sp = speed * (crouch ? 0.55 : 1) * (e.power.speed > T ? 1.35 : 1);
    const ml = Math.hypot(moveX, moveZ) || 1;
    const tvx = (moveX / ml) * sp, tvz = (moveZ / ml) * sp;
    const acc = e.grounded ? 14 : 3;
    e.vx += (tvx - e.vx) * Math.min(1, acc * dt); e.vz += (tvz - e.vz) * Math.min(1, acc * dt);
    // Stuck-Erkennung
    if (T >= ai.checkAt) {
      ai.checkAt = T + 0.7;
      const moved = Math.hypot(e.x - ai.lastX, e.z - ai.lastZ); ai.lastX = e.x; ai.lastZ = e.z;
      if (sp > 1 && moved < 0.3) { ai.stuckT++; if (e.grounded) wantJump = true; if (ai.stuckT > 2) { ai.path = null; ai.stuckT = 0; ai.repathAt = 0; ai.cover = null; if (state === 'roam') ai.goal = null; } } else ai.stuckT = 0;
    }
    e.h = crouch ? PLAYER.crouchHeight : PLAYER.height;
    if (wantJump && e.grounded) { e.vy = PLAYER.jump * (e.power.jump > T ? 1.3 : 1); e.grounded = false; }
    e.vy -= PLAYER.gravity * gs * dt;
    W.move(e, dt);
    if (e.y < -40) room.damage(e, 9999, e, { w: 'fall' });
    // Flags
    let fl = 0; if (crouch) fl |= FL.CROUCH; if (sprint && sp > 6) fl |= FL.SPRINT; if (!e.grounded) fl |= FL.AIR; if (reloading) fl |= FL.RELOAD; if (aimOK && state === 'combat') fl |= FL.AIM; if (T < ai.shootFl) fl |= FL.SHOOT;
    e.fl = fl;
  }

  follow(e, ai, dt) {
    const p = ai.path; if (!p || ai.pi >= p.length) return { x: 0, z: 0, has: false };
    let wp = p[ai.pi];
    while (ai.pi < p.length - 1 && Math.hypot(wp.x - e.x, wp.z - e.z) < 1.1) { ai.pi++; wp = p[ai.pi]; }
    if (ai.pi >= p.length - 1 && Math.hypot(wp.x - e.x, wp.z - e.z) < 1.0) { ai.path = null; return { x: 0, z: 0, has: false }; }
    const dx = wp.x - e.x, dz = wp.z - e.z, l = Math.hypot(dx, dz) || 1;
    if (wp.y - e.y > 0.55 && l < 2.0) { /* Stufe – Auto-Step */ }
    return { x: dx / l, z: dz / l, has: true };
  }

  shoot(e, ai, def, tgt, dx, dy, dz, D, dist) {
    const room = this.room, T = room.T;
    // Fehlerstreuung
    const err = D.aim * (0.6 + dist / 45) * (1 + Math.hypot(tgt.vx, tgt.vz) * 0.06);
    let ex = (this.rnd() + this.rnd() - 1) * err, ey = (this.rnd() + this.rnd() - 1) * err;
    const hd = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz) + ex, pit = Math.atan2(dy, hd) + ey;
    const dir = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)];
    const seed = (Math.floor(this.rnd() * 1e9)) | 0;
    const eyeY = this.eye(e);
    // Rhythmus: Salven
    if (def.auto) {
      if (T >= ai.pauseUntil && T >= ai.burstEnd) { ai.burstEnd = T + (0.5 + this.rnd() * 0.9) * (0.5 + D.fire); ai.pauseUntil = ai.burstEnd + (0.25 + this.rnd() * 0.7) / D.fire; }
      if (T > ai.burstEnd) return;
    }
    const interval = 1 / def.rate * (def.auto ? 1.02 : (1.1 + this.rnd() * 0.8) / D.fire);
    ai.fireNext = T + interval;
    room.fire(e, e.w, [e.x, eyeY, e.z], dir, seed, 1, 0);
    ai.mag[e.w] = (ai.mag[e.w] ?? def.mag) - 1; ai.shootFl = T + 0.15;
    if (def.cls === 'melee') ai.mag[e.w] = 99;
  }

  dummy(e, ai, dt) {
    const T = this.room.T;
    e.fl = 0; e.yaw = e.yaw || 0; e.h = PLAYER.height;
    if (e.home && ((parseInt(e.id.slice(1)) % 2) === 0)) {
      const nx = e.home[0] + Math.sin(T * 0.7 + ai.dummyT) * 3.2;
      e.vx = (nx - e.x) / Math.max(dt, 0.01); e.x = nx; e.vz = 0; e.fl = FL.SPRINT;
      e.yaw = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    e.y = this.room.groundY(e.x, e.z) + 0.02;
  }
}
