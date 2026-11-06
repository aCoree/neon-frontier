// Client-seitiges Kampfsystem: Inventar, Munition, Feuern, Nachladen, Waffenwechsel, Granaten. Treffer entscheidet der Server.
import * as THREE from 'three';
import { WEAPONS, AMMO, START_AMMO, START_LOADOUT, CONSUMABLES, FL } from '../shared/defs.js';
import { spreadDirs, clamp } from '../shared/util.js';

const _m = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();

export class Combat {
  constructor(ctx) {
    this.c = ctx;
    this.weapons = [...START_LOADOUT]; this.cur = 0; this.mags = {}; this.ammo = { ...START_AMMO };
    this.cons = { medkit: 1, shieldpot: 0, grenade: 1, smoke: 0 };
    this.reloading = false; this.reloadEnd = 0; this.nextFire = 0; this.lastFireT = -9; this.burst = 0; this.lastBurstT = 0; this.swapT = 0; this.beamOn = false;
    this.reset();
  }
  get id() { return this.weapons[this.cur]; }
  get def() { return WEAPONS[this.id]; }
  reset(training = false) {
    this.training = training;
    this.weapons = [...START_LOADOUT]; this.cur = 0; this.mags = { viper: WEAPONS.viper.mag, blade: 0 }; this.ammo = { ...START_AMMO };
    if (training) this.ammo = { light: 999, shells: 999, sniper: 999, rockets: 999, energy: 999 };
    this.reloading = false; this.cons = training ? { medkit: 4, shieldpot: 4, grenade: 5, smoke: 4 } : { medkit: 1, shieldpot: 0, grenade: 1, smoke: 0 };
  }
  reloadingHeavy() { return this.reloading && ['shotgun', 'launcher'].includes(this.def.cls); }
  firedRecently() { return performance.now() / 1000 - this.lastFireT < 0.14; }

  // Server-Inventar übernehmen
  syncInv(m) {
    const cur = this.id;
    const old = new Set(this.weapons);
    this.weapons = m.w.slice();
    for (const w of this.weapons) if (!old.has(w) || this.mags[w] === undefined) this.mags[w] = WEAPONS[w].mag;
    const i = this.weapons.indexOf(cur); this.cur = i >= 0 ? i : 0;
    if (i < 0) this.swapTo(Math.min(this.cur, this.weapons.length - 1), true);
    if (m.eq && this.weapons.includes(m.eq) && m.eq !== this.id) this.swapTo(this.weapons.indexOf(m.eq), true);   // Server hat eine Waffe ausgerüstet (Tauschen/Droppen)
    this.cons = { ...this.cons, ...m.c };
    if (this.training) for (const k of Object.keys(this.cons)) this.cons[k] = Math.max(this.cons[k], 3);
  }
  give(m) {
    if (m.kind === 'ammo' || m.kind === 'weapon') { const def = m.kind === 'weapon' ? WEAPONS[m.item] : null; const t = def ? def.ammo : m.item; if (t) this.ammo[t] = Math.min(AMMO[t].max, (this.ammo[t] || 0) + (m.n || 0)); }
  }
  swapTo(i, quiet = false) {
    if (i < 0 || i >= this.weapons.length || (i === this.cur && !quiet)) return false;
    this.cur = i; this.reloading = false; this.nextFire = performance.now() / 1000 + 0.3; this.c.onSwap && this.c.onSwap(this.id, quiet); this.c.send({ k: 'swap', w: this.id });
    return true;
  }
  cycle(d) { if (!this.weapons.length) return; this.swapTo((this.cur + d + this.weapons.length) % this.weapons.length); }

  reserve() { const a = this.def.ammo; return a ? this.ammo[a] || 0 : 0; }
  canReload() { const d = this.def; return !this.reloading && d.mag > 0 && (this.mags[this.id] ?? d.mag) < d.mag && (this.reserve() > 0 || this.training); }
  startReload() {
    if (!this.canReload()) return;
    const d = this.def; this.reloading = true; this.reloadEnd = performance.now() / 1000 + d.reload;
    this.c.onReload && this.c.onReload(d); this.c.send({ k: 'reload' });
  }

  update(dt, inp, p, now) {
    const c = this.c, d = this.def, id = this.id;
    // Waffen-Eingaben
    if (p.alive && c.ctrl) {
      for (let i = 0; i < 5; i++) if (inp.hit('Digit' + (i + 1))) this.swapTo(i);
      if (inp.wheel) this.cycle(inp.wheel > 0 ? 1 : -1);
      if (inp.hit('KeyR')) this.startReload();
      if (inp.hit('KeyG')) this.throwItem('grenade'); if (inp.hit('KeyH')) this.throwItem('smoke');
      if (inp.hit('KeyZ')) this.useCons('medkit'); if (inp.hit('KeyX')) this.useCons('shieldpot');
    }
    if (this.reloading && now >= this.reloadEnd) {
      this.reloading = false; const mag = this.mags[id] ?? 0, need = d.mag - mag, a = d.ammo;
      if (a) { const take = this.training ? need : Math.min(need, this.ammo[a] || 0); this.mags[id] = mag + take; if (!this.training) this.ammo[a] -= take; }
    }
    // Feuern
    let beam = false;
    if (p.alive && c.ctrl && !c.paused) {
      const want = d.auto ? inp.btn(0) : inp.btnHit(0);
      const left = d.mag > 0 ? (this.mags[id] ?? 0) : 1;
      if (want && now >= this.nextFire && !this.reloading && now > this.swapT) {
        if (left > 0) { this.fire(p, now); beam = d.kind === 'beam'; }
        else if (inp.btnHit(0) || d.auto) { if (this.canReload()) this.startReload(); else if (now - this.lastEmpty > 0.35) { this.lastEmpty = now; c.audio.empty(); } }
      } else if (want && d.kind === 'beam' && left > 0 && !this.reloading) beam = true;
      if (!want && d.mag > 0 && left <= 0 && this.canReload() && !this.reloading) this.startReload();
    }
    if (d.kind === 'beam' && !beam) c.fx.beams.get('me') && (c.fx.beams.get('me').t = 0);
    if (beam !== this.beamOn) { this.beamOn = beam; c.audio.laserLoop(beam); }
  }
  lastEmpty = 0;

  spreadFactor(p) {
    const d = this.def; let f = 1;
    if (p.aim) f *= d.adsSpread ?? 0.5;
    if (p.speedH > 1) f *= 1 + Math.min(0.9, p.speedH / 9);
    if (!p.grounded) f *= 1.8; if (p.crouch) f *= 0.7;
    f *= 1 + this.burst * 0.06;
    return clamp(f, 0.1, 3);
  }

  fire(p, now) {
    const c = this.c, d = this.def, id = this.id;
    this.nextFire = now + 1 / d.rate; this.lastFireT = now;
    if (now - this.lastBurstT > 0.35) this.burst = 0; this.burst = Math.min(10, this.burst + 1); this.lastBurstT = now;
    if (d.mag > 0) this.mags[id] = (this.mags[id] ?? d.mag) - 1;
    // Ursprung & Richtung
    const aim = c.aimPoint(d.range || 200);
    const mz = c.muzzlePos(_m);
    const eye = _e.set(p.x, p.y + (p.crouch ? 1.15 : 1.58), p.z);
    if (!c.world.los(eye.x, eye.y, eye.z, mz.x, mz.y, mz.z)) mz.copy(eye);
    _d.set(aim.x - mz.x, aim.y - mz.y, aim.z - mz.z); if (_d.lengthSq() < 2) c.camForward(_d); _d.normalize();
    const sp = this.spreadFactor(p), seed = (Math.random() * 1e9) | 0;
    const dir = [_d.x, _d.y, _d.z];
    if (d.kind === 'melee') { c.char.melee(); c.audio.shot('blade', null, true); c.send({ k: 'fire', w: id, o: [eye.x, eye.y, eye.z], d: dir, s: seed, sp: 1 }); return; }
    c.send({ k: 'fire', w: id, o: [mz.x, mz.y, mz.z], d: dir, s: seed, sp });
    c.char.shoot();
    // lokale Effekte
    const n = d.pellets || 1, dirs = spreadDirs(dir, d.spread * sp, n, seed);
    const col = d.color;
    c.fx.muzzle(mz, _d, col, d.cls === 'sniper' ? 1.4 : d.cls === 'shotgun' ? 1.5 : d.cls === 'launcher' ? 1.8 : d.cls === 'smg' ? 0.7 : 1, true);
    c.audio.shot(d.snd, null, true);
    if (d.kind === 'hitscan' || d.kind === 'beam') {
      let last = null;
      for (let i = 0; i < Math.min(n, 9); i++) {
        const di = dirs[i], t = c.world.raycast(mz.x, mz.y, mz.z, di[0], di[1], di[2], d.range), len = t >= 0 ? t : Math.min(d.range, 160);
        const end = new THREE.Vector3(mz.x + di[0] * len, mz.y + di[1] * len, mz.z + di[2] * len); last = end;
        if (d.kind === 'hitscan') c.fx.tracer(mz.clone(), end, col, { w: d.cls === 'sniper' ? 0.1 : 0.05, len: d.cls === 'sniper' ? 16 : 9, speed: 260 });
        if (t >= 0 && d.kind === 'hitscan') c.worldImpact(end, c.world.rh, d.color);
      }
      if (d.kind === 'beam' && last) { c.fx.beam('me', mz.clone(), last, col, 0.07); const t0 = c.world.raycast(mz.x, mz.y, mz.z, dir[0], dir[1], dir[2], d.range); if (t0 >= 0) { c.fx.impact(last, { x: c.world.rh.nx, y: c.world.rh.ny, z: c.world.rh.nz }, 'energy', col); } }
    }
    // Rückstoß
    const kick = (d.recoil || 1) * 0.0055 * (p.aim ? 0.7 : 1) * (this.burst > 6 ? 1.2 : 1);
    p.kick(kick, d.recoil * 0.0018);
    c.shakeAdd && c.shakeAdd(d.recoil * 0.012);
    if (d.cls === 'shotgun') { this.nextFire = now + 1 / d.rate; setTimeout(() => c.audio.reload('pump'), 250); }
    if (d.cls === 'sniper') setTimeout(() => c.audio.swap(null), 450);
  }

  throwItem(kind) {
    const c = this.c; if ((this.cons[kind] | 0) <= 0 || c.player.dashT > 0) return;
    if (performance.now() / 1000 - (this.lastThrow || 0) < 0.6) return; this.lastThrow = performance.now() / 1000;
    const p = c.player, cam = c.camForward(new THREE.Vector3()); cam.y += 0.12; cam.normalize();
    c.send({ k: 'throw', t: kind, o: [p.x, p.y + 1.6, p.z], d: [cam.x, cam.y, cam.z] });
    c.char.throwNade(); c.audio.throwSnd();
    if (!this.training) this.cons[kind]--;
  }
  useCons(kind) { if ((this.cons[kind] | 0) > 0) { const p = this.c.player; if ((kind === 'medkit' && this.c.hp < 100) || (kind === 'shieldpot' && this.c.shield < 100)) this.c.send({ k: 'use', t: kind }); } }
}
