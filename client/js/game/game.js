// Haupt-Spiellogik im Client: Zustand, Netzwerk-Events, Entitäten, Effekte, Schleife.
import * as THREE from 'three';
import { WEAPONS, MODES, TEAMS, FL, GADGETS, THROWABLES, CONSUMABLES, xpForLevel, SKINS, AMMO, EMOTES } from '../shared/defs.js';
import { World, rayCylinder } from '../shared/world.js';
import { moverY, zoneAt } from '../shared/mapdata.js';
import { clamp, lerp, angDiff } from '../shared/util.js';
import { Character } from '../render/character.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { Combat } from './combat.js';
import { Net, LocalNet, resolveServerUrl } from './net.js';
import { RemoteEnt, PickupView, DroneView, EmoteView } from './entities.js';
import { Progress } from './progress.js';
import { audio } from './audio.js';
import { FX } from '../render/fx.js';
import { Account } from './account.js';

const MENU_POS = { x: 3, y: 0.58, z: -93 };
const KIND_COLORS = { concrete: 'concrete', metal: 'metal', wood: 'wood', dirt: 'dirt' };

export class Game {
  constructor(engine, canvas) {
    this.engine = engine; this.scene = engine.scene; this.camera = engine.camera; this.world = engine.world; this.map = engine.map; this.view = engine.view;
    this.fx = new FX(this.scene, this.camera, engine.renderer); this.view.fx = this.fx;
    this.input = new Input(canvas); this.audio = audio;
    this.settings = Progress.d.settings;
    this.mode = 'menu'; this.ui = null; this.net = null; this.ents = new Map(); this.you = null; this.lobby = null; this.roomCode = null; this.isHost = false; this.inMatch = false;
    this.pickups = new PickupView(this.scene); this.drones = new DroneView(this.scene); this.emotes = new EmoteView(this.scene);
    this.projs = []; this.smokes = []; this.supplies = []; this.markers = []; this.beacons = [];
    this.hp = 100; this.shield = 0; this.alive = false; this.ctrl = false; this.paused = false; this.gadget = null; this.power = { speed: 0, jump: 0, barrier: 0 }; this.barrierHp = 0;
    this.srvT = 0; this.srvLocal = performance.now(); this.lowgravUntil = 0; this.shakeV = 0; this.stAcc = 0; this.t = 0; this.hitFlash = 0; this.scanUntil = 0; this.scanIds = new Set();
    this.clock = { left: 0, scores: null, ents: new Map() }; this.stats = this.freshStats(); this.training = false; this.settingsMatch = null; this.matchEnded = false; this.lastSend = 0;
    this.hour = 15; this.todMode = 'day'; this.hour0 = 15; this.spawnT = 0; this.interact = null; this.deadT = 0; this.rtt = 0.05; this.lastAmbT = 0; this.respawnAt = 0; this.countdownN = -1;
    this.pctx = this.makeCtx();
    this.player = new LocalPlayer(this.pctx); this.combat = new Combat(this.pctx);
    this.menuChar = null; this.char = null; this.prog = Progress.d;
    this.rctx = { onRemoteSwap: (e) => audio.swap(e.pos), onRemoteReload: (e, d) => audio.reload(d.cls, e.pos, d.reload), onRemoteStep: (e) => this.stepSound(e.pos, e.fl), onRemoteLand: (e) => audio.step('concrete', e.pos, 0.7), plateOK: (e) => this.plateOK(e), camPos: this.camera.position, showBars: (e) => this.showBars(e) };
    this.input.onLockChange = (l) => { if (this.mode === 'play' && !l && !this.matchEnded && this.ctrlWanted) this.ui.pause(true); else if (l) this.ui.pause(false); this.paused = !l && this.mode === 'play'; };
    this.todTimer = 0; this.buildDuck();
  }
  freshStats() { return { kills: 0, deaths: 0, hs: 0, dmg: 0, best: 0, shards: 0, chests: 0, botKills: 0 }; }

  makeCtx() {
    const g = this;
    return {
      input: this.input, get world() { return g.world; }, get map() { return g.map; }, get fx() { return g.fx; }, audio, get settings() { return g.settings; },
      get combat() { return g.combat; }, get player() { return g.player; }, get char() { return g.char; }, get power() { return g.power; }, get gadget() { return g.gadget; },
      get ctrl() { return g.ctrlNow(); }, get paused() { return g.paused; }, get hp() { return g.hp; }, get shield() { return g.shield; },
      T: () => g.T(), lowGrav: () => g.T() < g.lowgravUntil, send: (o) => g.send(o), shake: () => g.shakeV, shakeAdd: (k) => { g.shakeV = Math.min(1.2, g.shakeV + k); },
      aimPoint: (m) => g.aimPoint(m), camForward: (o) => g.camForward(o), muzzlePos: (o) => g.muzzlePos(o), worldImpact: (p, rh, col) => g.worldImpact(p, rh, col), toast: (t) => g.ui.toast(t),
      onJump: (dbl) => g.onJump(dbl), onLand: (v) => g.onLand(v), onStep: (p) => g.stepSound(p, p.fl, true), onDash: () => g.onDash(), onPad: (p) => g.onPad(p), onTeleport: (t) => g.onTeleport(t),
      onVoid: () => g.send({ k: 'suicide' }), onGrapple: (h) => g.onGrapple(h), onGrappleEnd: () => { g.fx.beams.get('grap') && (g.fx.beams.get('grap').t = 0); }, onBeacon: (b) => g.setBeacon(b),
      onSwap: (id, quiet) => { if (g.char) { g.char.setWeapon(id); if (!quiet) audio.swap(null); } }, onReload: (d) => { if (g.char) g.char.reload(d.reload); audio.reload(d.cls, null, d.reload); },
    };
  }
  ctrlNow() { return this.ctrl && this.input.locked && !this.paused && this.mode === 'play'; }
  T() { return this.srvT + (performance.now() - this.srvLocal) / 1000; }
  send(o) { if (this.net) this.net.send(o); }

  // =================== Netzwerk / Räume ===================
  profile() { const d = Progress.d; return { name: Account.user ? Account.user.username : (d.name || 'Spieler'), skin: d.skin, wskin: d.wskin, level: Account.user ? Account.user.stats.level : d.level, token: this.net && this.net.kind === 'local' ? undefined : (Account.user ? Account.token : undefined) }; }
  async connect(local, urlOverride) {
    this.disconnect();
    const p = this.profile();
    if (local) this.net = new LocalNet(p);
    else this.net = new Net(resolveServerUrl(urlOverride || this.settings.server), p);
    this.bindNet(this.net);
    await this.net.connect();
    return this.net;
  }
  disconnect() { if (this.net) { try { this.net.leave && this.net.leave(); this.net.close(); } catch { /* ignore */ } } this.net = null; this.roomCode = null; this.lobby = null; }
  bindNet(n) {
    const on = (k, f) => n.on(k, f.bind(this));
    n.onBytes = (b) => this.engine.perf && this.engine.perf.netBytes(b);
    on('joined', (m) => { this.ui.afterJoined(m.code); this.roomCode = m.code; this.myId = m.you; this.isHost = m.host === m.you; this.you = 'p' + m.you; if (m.resumed) this.ui.toast('Wieder verbunden!', 'good'); });
    on('lobby', (m) => { this.lobby = m; this.isHost = m.host === this.myId; if (this.mode === 'play' && (this.matchEnded || m.state === 'lobby')) { this.endMatchLocal(); this.enterMenu(); document.getElementById('results').classList.remove('show'); } this.ui.setLobby(m, this.myId); });
    on('start', (m) => this.onStart(m));
    on('snap', (m) => this.onSnap(m));
    on('err', (m) => { this.ui.toast(m.text, 'bad'); audio.error(); this.ui.onError && this.ui.onError(m); });
    on('kicked', () => { this.ui.toast('Du wurdest aus dem Raum entfernt.', 'bad'); this.leaveToMenu(); });
    on('chat', (m) => this.ui.chat(m));
    on('rtt', (r) => { this.rtt = r; });
    on('status', (s) => this.ui.connStatus(s));
    on('lost', () => { this.ui.toast('Verbindung verloren.', 'bad'); this.leaveToMenu(); });
    on('fix', (m) => { this.player.x = m.x; this.player.y = m.y; this.player.z = m.z; this.player.tpFlag = true; });
    on('inv', (m) => this.onInv(m));
    on('reward', (m) => this.onReward(m));
    on('give', (m) => { this.combat.give(m); this.giveToast(m); });
    on('shard', (m) => { Progress.stat('shards'); this.stats.shards++; const u = Progress.addXP(60); this.ui.toast(`Daten-Kern gefunden! (${m.n}) +60 XP`, 'good'); if (Progress.d.stats.shards >= 5) this.achv('shards5'); this.afterXP(u); });
    on('pick', (m) => this.onPickEvent(m));
    on('achv', (m) => this.achv(m.id));
    on('scan', (m) => { this.scanIds = new Set(m.ids); this.scanUntil = performance.now() / 1000 + m.dur; for (const id of m.ids) { const e = this.ents.get(id); if (e) e.reveal = this.scanUntil; } this.ui.toast(m.ids.length ? `${m.ids.length} Gegner erfasst` : 'Keine Gegner in der Nähe'); });
    on('chestopen', (m) => { audio.chest(); this.stats.chests++; Progress.stat('chests'); const u = Progress.addXP(25 + m.tier * 10); this.afterXP(u); if (Progress.d.stats.chests >= 10) this.achv('chests10'); });
    on('hostchg', (m) => { this.isHost = m.host === this.myId; });
    on('pong', (m) => { if (m.T !== undefined && this.mode !== 'play') { this.srvT = m.T; this.srvLocal = performance.now(); } });
  }
  leaveRoom() { if (this.net) { this.net.leave && this.net.leave(); } this.roomCode = null; this.lobby = null; }
  leaveToMenu() {
    if (this.inMatch) this.endMatchLocal();
    this.disconnect(); this.emotes.clear(); this.enterMenu(); this.ui.showScreen('menu');
  }

  // =================== Match-Beginn ===================
  onStart(m) {
    const resumed = this.inMatch && !this.matchEnded;
    this.settingsMatch = m.settings; this.training = !!m.settings.training; this.todMode = m.settings.tod; this.hour0 = m.hour0; this.scoreLimit = m.scoreLimit; this.timeLimit = m.timeLimit;
    this.srvT = m.T; this.srvLocal = performance.now(); this.lowgravUntil = m.lowgrav || 0;
    if (!resumed) this.resetMatch(m);
    // Weltzustand
    for (const [id, open, locked] of m.doors) this.setDoor(id, !!open, true);
    for (const c of this.map.chests) this.view.setChest(c.id, m.chests.includes(c.id));
    for (const s of this.map.switches) this.view.setSwitch(s.id, m.switches.includes(s.id));
    for (const p of this.map.pickups) this.pickups.setOn(p.id, !m.pickups.includes(p.id));
    for (const d of m.dyn) this.addDynPickup(d);
    for (const id of m.shards || []) this.pickups.setOn(id, false);
    this.clock.scores = m.scores?.t || null;
    if (resumed) { this.ui.toast('Match-Daten synchronisiert', 'good'); return; }
    this.inMatch = true; this.matchEnded = false; this.mode = 'play';
    this.startAt = m.startAt; this.countdownN = -1;
    this.ui.beginMatch(m, this);
    this.enterPlay();
  }
  resetMatch(m) {
    for (const e of this.ents.values()) e.dispose(); this.ents.clear(); this.pickups.clear(); this.emotes.clear(); this.clearTransient();
    this.stats = this.freshStats(); this.combat.reset(this.training); this.hp = 100; this.shield = 0; this.gadget = null; this.power = { speed: 0, jump: 0, barrier: 0 };
    this.you = m.you; this.alive = false; this.player.alive = false; this.matchEnded = false;
    for (const i of m.ents) this.addEnt(i);
    for (const p of this.map.pickups) this.pickups.add(p);
    this.clock.left = m.timeLimit; this.ui.resetFeed && this.ui.resetFeed();
    // eigener Charakter
    if (this.char) { this.scene.remove(this.char.root); }
    const me = m.ents.find(e => e.id === m.you);
    this.char = new Character(me?.skin || Progress.d.skin, me?.wskin || Progress.d.wskin); this.scene.add(this.char.root); this.char.root.visible = false;
    if (me && me.team >= 0) this.char.setTeamColor(TEAMS[me.team].hex);
    this.char.setWeapon('viper'); this.char.equipT = 1; this.myTeam = me ? me.team : -1;
    if (this.menuChar) this.menuChar.root.visible = false; this.partyCharsVisible(false);
  }
  clearTransient() {
    for (const p of this.projs) this.scene.remove(p.mesh); this.projs = []; this.smokes = []; for (const s of this.supplies) this.scene.remove(s.g); this.supplies = [];
    for (const b of this.beacons) this.scene.remove(b); this.beacons = [];
  }
  addEnt(info) {
    if (info.id === this.you) { this.ents.set(info.id, { id: info.id, info, self: true, kills: info.k || 0, deaths: info.d || 0, team: info.team }); return; }
    const e = new RemoteEnt(info, this.scene); this.ents.set(info.id, e);
  }
  enterPlay() {
    this.input.enabled = true; this.ctrl = false; this.ctrlWanted = true;
    audio.init(); audio.musicStart('game'); this.engine.setHour(this.hour0); this.ui.showScreen('hud');
    this.input.lock();
    setTimeout(() => { if (this.mode === 'play' && !this.input.locked && !this.matchEnded) this.ui.showClickHint(); }, 500);
    this.camera.near = 0.1;
  }
  endMatchLocal() { this.inMatch = false; this.ctrl = false; this.input.enabled = false; this.input.unlock(); this.fx.beams.forEach(b => { b.t = 0; }); audio.laserLoop(false); audio.jetLoop(false); }

  // =================== Snapshots & Events ===================
  onSnap(m) {
    if (!this.inMatch) return;
    const now = performance.now() / 1000;
    this.srvT = m.T; this.srvLocal = performance.now();
    for (const row of m.e) {
      const [id, x, y, z, yaw, pitch, fl, w, hp, sh] = row;
      if (id === this.you) { this.hp = hp; this.shield = sh; this.serverFl = fl; continue; }
      let e = this.ents.get(id); if (!e) continue;
      e.push(now, { x, y, z, yaw, pitch, fl, w, hp, sh });
    }
    this.drones.sync(m.d, this.myTeam, now);
    for (const ev of m.ev) { try { this.onEvent(ev, now); } catch (err) { console.error('Event-Fehler', ev.k, err); } }
  }
  entPos(id, out) { const e = this.ents.get(id); if (!e) return null; if (e.self) return out.set(this.player.x, this.player.y, this.player.z); if (e.pos) return out.copy(e.pos); return null; }
  nameOf(id) { const e = this.ents.get(id); return e ? e.info.name : '???'; }
  teamColor(id) { const e = this.ents.get(id); return e && e.info.team >= 0 ? TEAMS[e.info.team].color : null; }

  onEvent(ev, now) {
    const tmp = new THREE.Vector3();
    switch (ev.k) {
      case 'spawn': {
        const e = this.ents.get(ev.id); if (!e) break;
        if (ev.id === this.you) {
          this.player.spawn(ev.x, ev.y, ev.z, ev.yaw); this.alive = true; this.hp = 100; this.ui.hideDeath(); this.char.revive(); this.char.root.visible = true; this.char.setWeapon('viper'); this.char.equipT = 1;
          this.combat.cur = 0; this.combat.reloading = false; this.spawnT = this.T(); this.interact = null; if (!ev.first) audio.spawn(); this.gadget = null;
          this.fx.explosionLite && 0; this.spawnRing(new THREE.Vector3(ev.x, ev.y, ev.z), 0x7ee8ff);
        } else { e.teleportTo(ev.x, ev.y, ev.z, ev.yaw); e.alive = true; e.char.revive(); e.setVisible(true); e.char.setWeapon('viper'); this.spawnRing(new THREE.Vector3(ev.x, ev.y, ev.z), 0xaad8ff); }
        break;
      }
      case 'go': { this.ctrl = true; this.ui.countdown('LOS!'); audio.countdown(true); break; }
      case 'shot': this.onShot(ev, now); break;
      case 'swing': { const e = this.ents.get(ev.id); if (e && !e.self) { e.char.melee(); audio.shot('blade', e.pos); } break; }
      case 'emote': {   // Blase über dem Spieler; stummgeschaltete Spieler werden ausgeblendet
        const e = this.ents.get(ev.id); if (!e || (!e.self && Account.mutes.has(e.info?.name))) break;
        this.emotes.show(ev.id, ev.e); if (!e.self) { const p = new THREE.Vector3(); if (this.entPos(ev.id, p)) audio.emote(p); } else audio.emote();
        break;
      }
      case 'dash': { const e = this.ents.get(ev.id); if (e && !e.self) { e.char.dash(); audio.dash(); } break; }
      case 'hit': this.onHit(ev, now); break;
      case 'kill': this.onKill(ev, now); break;
      case 'proj': this.addProj(ev); break;
      case 'pbounce': { const p = this.projs.find(q => q.id === ev.id); if (p) { p.pos.set(...ev.p); p.vel.set(...ev.v); audio.nade(p.pos); } break; }
      case 'prest': { const p = this.projs.find(q => q.id === ev.id); if (p) { p.pos.set(...ev.p); p.vel.set(0, 0, 0); p.rest = true; } break; }
      case 'boom': this.onBoom(ev); break;
      case 'smoke': { const p = new THREE.Vector3(...ev.p); this.smokes.push({ p, r: ev.r, until: this.T() + ev.t, acc: 0 }); this.removeProj(ev.id); audio.smokeSnd(p); break; }
      case 'pick': { if (ev.me) { this.pickups.setOn(ev.id, false); break; } const it = this.pickups.items.get(ev.id); if (it) { if (it.p.dyn) this.pickups.remove(ev.id); else this.pickups.setOn(ev.id, false); if (ev.by === this.you) { audio.pickup(it.p.kind); this.pickupFx(it.p); } else if (it.g.visible) this.fx.impact(it.g.position, { x: 0, y: 1, z: 0 }, 'energy', 0xffffff); } break; }
      case 'pickr': this.pickups.setOn(ev.id, true); break;
      case 'drop': this.addDynPickup(ev.p); break;
      case 'iact': this.onIact(ev); break;
      case 'lowgrav': this.lowgravUntil = ev.until; this.ui.toast('SCHWERKRAFT-ANOMALIE! (25 s)', 'event'); audio.lowgrav(); if (ev.by === this.you) this.achv('moon'); this.ui.banner('Schwerkraft-Anomalie', 'event'); break;
      case 'supply': this.addSupply(ev); break;
      case 'supplyland': this.landSupply(ev); break;
      case 'powerfx': { const e = this.ents.get(ev.id); const p = ev.id === this.you ? this.player.pos : e?.pos; if (p) { this.spawnRing(tmp.set(p.x, p.y + 0.1, p.z).clone(), 0xffe14d); if (ev.id === this.you) audio.powerup(); } break; }
      case 'usefx': { const e = this.ents.get(ev.id); const p = ev.id === this.you ? this.player.pos : e?.pos; if (p) { for (let i = 0; i < 12; i++) this.fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + Math.random() * 1.6, z: p.z + (Math.random() - 0.5) * 0.7, vy: 1.2, size: 0.18, life: 0.8, r: ev.t === 'medkit' ? 1.2 : 0.3, g: ev.t === 'medkit' ? 3 : 1.8, b: ev.t === 'medkit' ? 1 : 4, a: 0.9, add: true, drag: 0.5 }); if (ev.id === this.you) ev.t === 'medkit' ? audio.heal() : audio.shield(); } break; }
      case 'gad': this.onGadFx(ev); break;
      case 'drone': { if (ev.own === this.you) this.ui.toast('Drohne aktiv'); break; }
      case 'droneboom': { this.fx.explosion(new THREE.Vector3(...ev.p), 2.2); audio.explosion(new THREE.Vector3(...ev.p), 0.5); break; }
      case 'clock': this.clock.left = ev.left; this.clock.scores = ev.sc; for (const [id, k, d, t] of ev.ents) { this.clock.ents.set(id, { k, d, t }); const e = this.ents.get(id); if (e) { e.kills = k; e.deaths = d; } } this.ui.clock && this.ui.clock(this); break;
      case 'end': this.onEnd(ev); break;
      case 'join': this.addEnt(ev.e); this.ui.toast(ev.e.name + ' ist beigetreten', 'good'); break;
      case 'leave': { const e = this.ents.get(ev.id); if (e && !e.self) { this.ui.toast(e.info.name + ' hat das Spiel verlassen'); e.dispose(); this.ents.delete(ev.id); } break; }
      case 'toast': this.ui.toast(ev.text, 'event'); break;
    }
  }

  onShot(ev, now) {
    const w = WEAPONS[ev.w], me = ev.id === this.you, e = this.ents.get(ev.id);
    const from = new THREE.Vector3(...ev.o);
    let mz = from;
    if (!me) {
      if (e && e.char) { mz = new THREE.Vector3(); e.char.getMuzzleWorld(mz); if (mz.distanceTo(from) > 3) mz.copy(from); e.char.shoot(); if (e.team !== this.myTeam || e.team < 0) e.reveal = now + 1.6; }
      else if (ev.w === 'drone') { const dp = this.drones.pos(ev.id); if (dp) mz = dp.clone(); }
    }
    const col = w ? w.color : 0x66ffd0;
    const dir = new THREE.Vector3();
    for (const [x, y, z, kind, nx, ny, nz] of ev.e) {
      const end = new THREE.Vector3(x, y, z);
      if (!me) {
        if (w && w.kind === 'beam') this.fx.beam('b' + ev.id, mz.clone(), end, col, 0.07);
        else this.fx.tracer(mz.clone(), end, col, { w: w && w.cls === 'sniper' ? 0.1 : 0.05, len: 9, speed: 260 });
      }
      const n = { x: nx, y: ny, z: nz };
      if (kind === 1 && !me) this.worldImpact(end, { nx, ny, nz }, col);
      else if (kind === 2) { this.fx.impact(end, n, 'flesh', col); }
    }
    if (!me) {
      dir.copy(new THREE.Vector3(...ev.e[0].slice(0, 3))).sub(mz).normalize();
      if (w) { this.fx.muzzle(mz, dir, col, w.cls === 'sniper' ? 1.3 : w.cls === 'smg' ? 0.7 : 1, false); audio.shot(w.snd, mz); } else if (ev.w === 'drone') audio.shot('drone', mz);
    }
  }
  worldImpact(p, rh, col) {
    const n = { x: rh.nx, y: rh.ny, z: rh.nz };
    const kind = p.y > 6 && Math.abs(n.y) < 0.5 ? 'concrete' : (this.world.rh.terrain ? 'dirt' : 'concrete');
    const mat = this.world.rh.obj && this.world.rh.obj.y1 - this.world.rh.obj.y0 > 0 ? 'concrete' : 'dirt';
    this.fx.impact(p, n, mat === 'dirt' && !this.world.rh.obj ? 'dirt' : (Math.random() < 0.35 ? 'metal' : 'concrete'), col);
    this.fx.decal(p, n, 0.16 + Math.random() * 0.08);
    audio.impact(p, mat === 'dirt' ? 'dirt' : 'concrete');
  }

  onHit(ev, now) {
    const v = this.ents.get(ev.v), a = this.ents.get(ev.a), pos = new THREE.Vector3(...ev.p);
    if (ev.v === this.you) {
      this.hitFlash = 0.5; this.shakeV = Math.min(1, this.shakeV + 0.12 + ev.d * 0.004); audio.hurt(ev.d > 30);
      if (ev.kb) this.player.addKnock(...ev.kb);
      if (a && ev.a !== this.you) { const ap = new THREE.Vector3(); this.entPos(ev.a, ap); this.ui.damageDir(Math.atan2(ap.x - this.player.x, ap.z - this.player.z) - this.player.yaw); }
      else if (ev.kb) this.ui.damageDir(null);
      if (ev.w) this.char.hit(Math.sin(Math.random() * 6) * 0.6, Math.random() < 0.5 ? 1 : -1);
    } else if (v && v.char) {
      const ap = new THREE.Vector3(); let lx = 0, lz = 1;
      if (this.entPos(ev.a, ap)) { const dx = ap.x - v.pos.x, dz = ap.z - v.pos.z; const yaw = v.yaw || 0; lz = dx * Math.sin(yaw) + dz * Math.cos(yaw); lx = -dx * Math.cos(yaw) + dz * Math.sin(yaw); const l = Math.hypot(lx, lz) || 1; lx /= l; lz /= l; }
      v.char.hit(lx, lz); v.lastHurt = now; audio.hitFlesh(pos); if (!ev.agg) this.fx.impact(pos, { x: 0, y: 1, z: 0 }, 'flesh', 0xffffff);
    }
    if (ev.a === this.you && ev.v !== this.you) {
      const killedNow = false;
      this.ui.hitmarker(false, !!ev.hs); audio.hitmarker(!!ev.hs, false);
      if (this.settings.dmgNumbers) this.fx.damageNumber(pos, String(ev.d), ev.hs ? 'head' : (ev.sh ? 'shield' : ''));
      this.stats.dmg += ev.d; if (ev.hs) { Progress.stat('headshots'); if (Progress.d.stats.headshots >= 25) this.achv('headshots'); }
    }
  }

  onKill(ev, now) {
    const v = this.ents.get(ev.v), a = ev.a ? this.ents.get(ev.a) : null;
    const wName = ev.w === 'fall' ? 'Absturz' : (WEAPONS[ev.w]?.name || (THROWABLES[ev.w]?.name) || ev.w);
    this.ui.killFeed({ killer: a ? a.info.name : null, killerColor: a ? this.teamColor(ev.a) : null, victim: v ? v.info.name : '?', victimColor: this.teamColor(ev.v), weapon: wName, hs: !!ev.hs, you: ev.a === this.you, died: ev.v === this.you, ex: ev.ex });
    if (v) { v.deaths++; if (a) a.kills++; }
    if (ev.v === this.you) {
      this.alive = false; this.player.alive = false; this.stats.deaths++; Progress.stat('deaths'); this.char.die(0, 1); audio.death(); this.deadT = this.T(); this.fx.shake = 0;
      const tip = a ? a.info.name : (ev.w === 'fall' ? 'Absturz' : 'Selbstverschulden');
      this.ui.showDeath(tip, wName, this.training ? 1.2 : 3.8, a ? this.teamColor(ev.a) : null, a ? a.info.name : null);
      this.combat.beamOn && audio.laserLoop(false); this.player.hook = null; this.player.fuel = 100; audio.jetLoop(false);
      if (this.player.kickAcc) this.player.kickAcc = 0;
    } else if (v) { v.alive = false; const ap = new THREE.Vector3(); const hasA = this.entPos(ev.a, ap); let lz = 1; if (hasA) { const dx = ap.x - v.pos.x, dz = ap.z - v.pos.z; lz = dx * Math.sin(v.yaw || 0) + dz * Math.cos(v.yaw || 0); } v.char.die(0, lz); audio.hitFlesh(v.pos); }
    if (ev.a === this.you && ev.v !== this.you) {
      this.stats.kills++; Progress.stat('kills'); if (ev.hs) this.stats.hs++;
      const isBot = v && v.info.bot; if (isBot) { Progress.stat('botKills'); this.stats.botKills++; if (Progress.d.stats.botKills >= 50) this.achv('botslayer'); }
      this.stats.best = Math.max(this.stats.best, ev.streak);
      this.ui.hitmarker(true, !!ev.hs); audio.hitmarker(!!ev.hs, true);
      if (!this.training) {
        const gain = 25 + (ev.hs ? 10 : 0) + (ev.dist > 40 ? 10 : 0);
        this.ui.killBanner(v ? v.info.name : '?', ev.hs, ev.streak, gain);
      } else this.ui.killBanner(v ? v.info.name : 'Ziel', ev.hs, 0, 0);
      this.achv('firstblood'); if (this.stats.kills >= 10) this.achv('kills10'); if (ev.streak >= 5) this.achv('streak5'); if (ev.dist >= 80) this.achv('sniper100');
      if (['stormcaller', 'grenade'].includes(ev.w)) this.achv('boom');
    }
  }

  onBoom(ev) {
    const p = new THREE.Vector3(...ev.p); this.removeProj(ev.id);
    if (ev.t === 'plasma') { this.fx.impact(p, { x: 0, y: 1, z: 0 }, 'energy', 0x39d9ff); this.fx.spawn({ x: p.x, y: p.y, z: p.z, size: 2.2, life: 0.18, r: 0.6, g: 3, b: 4, a: 1, add: true, drag: 0 }); this.fx.flash(p, 0x39d9ff, 1.4, 0.12, 10); audio.impact(p, 'metal'); return; }
    this.fx.explosion(p, ev.r, { color: ev.t === 'grenade' ? 0xffa040 : 0xff8a30 });
    const g = this.world.groundAt(p.x, p.z, p.y + 1.5); if (p.y - g < 2.5) this.fx.decal(new THREE.Vector3(p.x, g + 0.02, p.z), { x: 0, y: 1, z: 0 }, ev.r * 0.5, 40);
    audio.explosion(p, ev.r > 4 ? 1 : 0.8);
    const d = this.camera.position.distanceTo(p); if (d < 25) this.shakeV = Math.min(1.1, this.shakeV + (1 - d / 25) * 0.7);
  }

  // ---- Projektile (visuell) ----
  addProj(ev) {
    const type = ev.t, pos = new THREE.Vector3(...ev.o), vel = new THREE.Vector3(...ev.v); let mesh;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 0.5, metalness: 0.5 });
    if (type === 'rocket') { mesh = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xcfd4d8, metalness: 0.7, roughness: 0.3 })); b.rotation.x = Math.PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xc23b22 })); n.rotation.x = Math.PI / 2; n.position.z = 0.4; const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(3), toneMapped: false })); f.position.z = -0.35; mesh.add(b, n, f); }
    else if (type === 'plasma') { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fe0ff).multiplyScalar(4), toneMapped: false })); }
    else if (type === 'grenade') { mesh = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark); const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(3), toneMapped: false })); l.position.y = 0.1; mesh.add(b, l); mesh.userData.blink = l; }
    else { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.6, roughness: 0.4 })); }
    mesh.position.copy(pos); this.scene.add(mesh);
    const pr = { id: ev.id, type, pos, vel, grav: ev.g || 0, mesh, t: 0, own: ev.own, rest: false, life: (ev.fuse || 6) + 1 };
    this.projs.push(pr);
    if (ev.own !== this.you) { const e = this.ents.get(ev.own); if (e && e.char && (type === 'grenade' || type === 'smoke')) { e.char.throwNade(); audio.throwSnd(); } }
    if (type === 'rocket' && ev.own !== this.you) audio.shot('rocket', pos);
  }
  removeProj(id) { const i = this.projs.findIndex(p => p.id === id); if (i >= 0) { this.scene.remove(this.projs[i].mesh); this.projs.splice(i, 1); } }
  updateProjs(dt) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.t += dt;
      if (!p.rest) { p.vel.y -= p.grav * dt; p.pos.addScaledVector(p.vel, dt); }
      p.mesh.position.copy(p.pos);
      if (p.type === 'rocket' || p.type === 'plasma') { p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z); }
      if (p.type === 'rocket') {
        this.fx.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, size: 0.5, life: 0.5, grow: 0.8, r: 0.6, g: 0.6, b: 0.6, a: 0.5, drag: 1, add: false });
        this.fx.spawn({ x: p.pos.x - p.vel.x * 0.01, y: p.pos.y, z: p.pos.z - p.vel.z * 0.01, size: 0.5, life: 0.12, r: 4, g: 2.2, b: 0.7, a: 1, add: true, drag: 0 });
        if (!p.light) p.light = true; this.fx.flash(p.pos, 0xff9a40, 0.9, 0.08, 14);
      } else if (p.type === 'plasma') { this.fx.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, size: 0.35, life: 0.12, r: 0.8, g: 3, b: 4, a: 1, add: true, drag: 0 }); }
      else if (p.mesh.userData.blink) p.mesh.userData.blink.visible = Math.sin(p.t * 20) > 0;
      if (p.t > p.life) { this.scene.remove(p.mesh); this.projs.splice(i, 1); }
    }
    // Rauchwolken
    const T = this.T();
    for (let i = this.smokes.length - 1; i >= 0; i--) { const s = this.smokes[i]; s.acc -= dt; if (s.acc <= 0 && T < s.until) { s.acc = 0.35; this.fx.smokeCloud(s.p, s.r); } if (T > s.until) this.smokes.splice(i, 1); }
  }

  // ---- Pickups ----
  addDynPickup(d) { const p = { ...d, dyn: true }; this.pickups.add(p); }
  pickupFx(p) { const c = this.camera.position; this.ui.pickupToast(p); }
  giveToast(m) { /* Anzeige erfolgt über pickupToast */ }
  onPickEvent(m) { /* via Event-Variante behandelt */ }
  onInv(m) {
    this.combat.syncInv(m); this.gadget = m.g; if (this.char && this.combat.id !== this.char.weaponId) this.char.setWeapon(this.combat.id);
    const now = performance.now() / 1000; this.power = { speed: m.pw.speed || 0, jump: m.pw.jump || 0, barrier: m.bar ? (m.pw.barrier || 8) : 0 }; this.barrierHp = m.bar || 0;
    if (m.g !== this.player.lastGadget) { this.player.lastGadget = m.g; if (m.g) { this.player.gcd = 0; this.ui.toast(`Gadget: ${GADGETS[m.g].name} – ${GADGETS[m.g].desc}`, 'good'); } }
  }
  onIact(ev) {
    if (ev.t === 'door') { this.setDoor(ev.id, !!ev.st); }
    else if (ev.t === 'chest') { this.view.setChest(ev.id, !!ev.st); const c = this.map.chests.find(c => c.id === ev.id); if (ev.st && c) { audio.chest(); const p = new THREE.Vector3(c.x, c.y + 0.6, c.z); for (let i = 0; i < 16; i++) this.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, size: 0.18, life: 0.8, r: 3, g: 2.4, b: 0.8, a: 1, add: true, drag: 0.5, grav: 6 }); } }
    else if (ev.t === 'switch') { this.view.setSwitch(ev.id, !!ev.st); const s = this.map.switches.find(s => s.id === ev.id); if (s) audio.switchSnd(new THREE.Vector3(s.x, s.y, s.z)); }
  }
  setDoor(id, open, quiet) {
    const d = this.map.doors.find(d => d.id === id); if (!d) return;
    const was = d.open; d.open = open; if (d.col) d.col.on = !open; this.view.setDoor(id, open);
    if (!quiet && was !== open) audio.door(new THREE.Vector3(d.x, d.y + 1, d.z));
  }

  // ---- Nachschub ----
  addSupply(ev) {
    const g = new THREE.Group(); const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x3a4a2e, roughness: 0.5, metalness: 0.4 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.2, 1.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(2.2), toneMapped: false })); band.position.y = 0.2;
    const chute = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, side: THREE.DoubleSide, roughness: 0.9 })); chute.position.y = 3.6;
    const lines = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x444444, wireframe: true })); lines.position.y = 1.9; lines.rotation.x = Math.PI;
    g.add(crate, band, chute, lines); g.position.set(ev.x, ev.y + 140, ev.z); this.scene.add(g);
    this.supplies.push({ id: ev.id, g, x: ev.x, y: ev.y, z: ev.z, t0: performance.now() / 1000, dur: ev.fall, chute });
    this.ui.banner('Nachschub-Lieferung unterwegs!', 'event'); audio.supply(); this.ui.toast('Nachschub-Lieferung! Schau zum Himmel – Markierung auf der Karte.', 'event');
  }
  landSupply(ev) {
    const i = this.supplies.findIndex(s => s.id === ev.id); if (i >= 0) { const s = this.supplies[i]; s.g.visible = false; this.scene.remove(s.g); this.supplies[i] = { ...s, landed: true, g: new THREE.Group(), t0: performance.now() / 1000 }; }
    const p = new THREE.Vector3(ev.x, ev.y + 0.5, ev.z); this.fx.explosion(p, 2.5, { color: 0xffe0a0 }); audio.explosion(p, 0.5);
  }
  updateSupplies(dt, now) {
    for (let i = this.supplies.length - 1; i >= 0; i--) {
      const s = this.supplies[i];
      if (s.landed) { if (now - s.t0 > 30) this.supplies.splice(i, 1); else if (Math.random() < 0.3) this.fx.spawn({ x: s.x, y: s.y + 0.3, z: s.z, vy: 8, size: 0.7, life: 2.5, grow: 0.4, r: 2.6, g: 0.5, b: 0.2, a: 0.8, add: true, drag: 0.3 }); continue; }
      const u = clamp((now - s.t0) / s.dur, 0, 1); s.g.position.y = s.y + 140 * (1 - u) + 0.55; s.g.rotation.y += dt * 0.4;
      if (Math.random() < 0.5) this.fx.spawn({ x: s.g.position.x, y: s.g.position.y + 4, z: s.g.position.z, size: 1.2, life: 2, grow: 0.7, r: 0.9, g: 0.35, b: 0.25, a: 0.5, add: false, drag: 0.5 });
      s.chute.scale.setScalar(u > 0.93 ? 1 - (u - 0.93) * 8 : 1);
    }
  }

  // ---- Gadgets (Effekte) ----
  onGadFx(ev) {
    const p = new THREE.Vector3(...ev.p);
    if (ev.t === 'grapple' && ev.id !== this.you) { const e = this.ents.get(ev.id); if (e && e.char) { const from = e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)); this.fx.beam('g' + ev.id, from, p, 0xffa94d, 0.03); audio.grapple(p); } }
    else if (ev.t === 'tele' || ev.t === 'teleback') { this.spawnRing(p, 0xb36bff); audio.teleport(p); for (let i = 0; i < 18; i++) this.fx.spawn({ x: p.x, y: p.y + 1, z: p.z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 4, size: 0.2, life: 0.7, r: 2.2, g: 0.8, b: 4, a: 1, add: true, drag: 1.5 }); }
    else if (ev.t === 'scan') { const ring = p.clone(); ring.y += 0.3; this.spawnRing(ring, 0x4de1ff, 24); }
  }
  setBeacon(b) {
    for (const x of this.beacons) this.scene.remove(x); this.beacons = [];
    if (!b) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb36bff).multiplyScalar(2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(b.x, b.y + 1.5, b.z); this.scene.add(m); this.beacons.push(m);
  }
  spawnRing(p, color, size = 3) { const c = new THREE.Color(color); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; this.fx.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * size, vy: 0.4, vz: Math.sin(a) * size, size: 0.18, life: 0.5, r: c.r * 3, g: c.g * 3, b: c.b * 3, a: 1, add: true, drag: 2.2 }); } }

  // ---- Spieler-Callbacks ----
  surfaceAt(x, y, z, fl) {
    if (this.player.wade && x === this.player.x) return 'water';
    const g = this.player.ground; if (g && g.y1 > this.world.terrain(x, z) + 0.2) { const zn = zoneAt(x, z); return zn && (zn.id === 'industrial' || zn.id === 'military') ? 'metal' : (y < -3 ? 'concrete' : 'concrete'); }
    if (z > 112 && y < 3) return 'sand'; return 'grass';
  }
  stepSound(pos, fl, own) {
    const p = pos.x !== undefined ? pos : this.player;
    const surf = this.surfaceAt(p.x, p.y, p.z, fl);
    audio.step(surf, own ? null : pos, own ? 0.35 : 0.6);
  }
  onJump(dbl) { audio.jump(); if (dbl) { const p = this.player; this.spawnRing(new THREE.Vector3(p.x, p.y + 0.2, p.z), 0x9ad8ff, 2.2); } }
  onLand(v) { audio.land(clamp(v / 14, 0.2, 1)); this.shakeV = Math.min(0.5, this.shakeV + clamp((v - 8) / 30, 0, 0.3)); const p = this.player; for (let i = 0; i < 6; i++) this.fx.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: (Math.random() - 0.5) * 3, vy: 0.5, vz: (Math.random() - 0.5) * 3, size: 0.5, grow: 0.8, life: 0.5, r: 0.7, g: 0.68, b: 0.62, a: 0.35, drag: 2, add: false }); }
  onDash() { audio.dash(); this.char.dash(); this.send({ k: 'dash' }); const p = this.player; for (let i = 0; i < 10; i++) this.fx.spawn({ x: p.x, y: p.y + 0.8, z: p.z, vx: -p.dashDir.x * 4 + (Math.random() - 0.5), vy: 0.5, vz: -p.dashDir.z * 4 + (Math.random() - 0.5), size: 0.3, life: 0.4, r: 0.6, g: 1.4, b: 2.4, a: 0.8, add: true, drag: 3 }); }
  onPad(p) { audio.jump(); this.spawnRing(new THREE.Vector3(p.x, p.y, p.z), 0x66ff88, 3); audio.pickup('power'); }
  onTeleport(t) { audio.teleport(null); this.spawnRing(new THREE.Vector3(this.player.x, this.player.y, this.player.z), 0xb36bff, 3); }
  onGrapple(h) { audio.grapple(null); }

  // =================== Zielen ===================
  camForward(out) { return this.player.lookDir(out); }
  muzzlePos(out) { if (this.char && this.char.weaponGroup) { this.char.root.updateMatrixWorld(true); return this.char.getMuzzleWorld(out); } return out.set(this.player.x, this.player.y + 1.5, this.player.z); }
  aimPoint(maxD = 300) {
    const cam = this.camera, dir = this.camForward(new THREE.Vector3()), o = cam.position;
    let t = this.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxD), hit = t >= 0, ent = null;
    if (!hit) t = maxD;
    for (const e of this.ents.values()) {
      if (e.self || !e.alive) continue;
      if (e.info.team >= 0 && e.info.team === this.myTeam) continue;
      const h = (e.fl & FL.CROUCH) ? 1.25 : 1.8;
      const tt = rayCylinder(o.x, o.y, o.z, dir.x, dir.y, dir.z, e.pos.x, e.pos.z, 0.45, e.pos.y, e.pos.y + h);
      if (tt >= 0 && tt < t) { t = tt; hit = true; ent = e; }
    }
    this.aimEnt = ent;
    return { x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t, dist: t, hit };
  }

  plateOK(e) {
    const d = this.camera.position.distanceTo(e.pos); if (d > 75) return false;
    if (e.info.team >= 0 && e.info.team === this.myTeam) return true;
    e.losT -= 0.016; if (e.losT <= 0) { e.losT = 0.25; const c = this.camera.position; e.los = this.world.los(c.x, c.y, c.z, e.pos.x, e.pos.y + 1.7, e.pos.z); }
    return e.los && d < 55;
  }
  showBars(e) { if (e.info.team >= 0 && e.info.team === this.myTeam) return true; return (performance.now() / 1000 - (e.lastHurt || -9) < 3.5) || this.camera.position.distanceTo(e.pos) < 18; }

  achv(id) {
    const r = Progress.grant(id); if (!r) return;
    audio.levelUp(); this.ui.achievement(r.a); this.afterXP(r.ups);
  }
  afterXP(ups) { if (ups && ups.length) { this.ui.levelUp(ups[ups.length - 1]); audio.levelUp(); for (const s of SKINS) if (s.level > ups[0] - ups.length && s.level <= ups[ups.length - 1]) this.ui.toast(`Neuer Skin freigeschaltet: ${s.name}`, 'good'); } this.ui.refreshProfile(); }

  onReward(m) {
    if (Account.user) { const old = Account.user.stats; Account.refresh().then(() => { this.ui.refreshProfile(); this.ui.showReward(m, old); }); }
  }
  onEnd(ev) {
    if (this.matchEnded) return; this.matchEnded = true; this.ctrl = false; this.ctrlWanted = false;
    const me = this.ents.get(this.you); const myTeam = me?.info.team ?? -1;
    const won = ev.winTeam >= 0 ? myTeam === ev.winTeam : ev.winId === this.you;
    let xp = 0; const st = this.stats;
    if (!this.training) {
      xp = 120 + st.kills * 35 + st.hs * 12 + Math.round(st.dmg / 25) + (won ? 280 : 0) + st.shards * 0 + Math.min(100, st.chests * 20);
      Progress.stat('matches'); if (won) { Progress.stat('wins'); this.achv('winner'); }
    }
    if (Account.user && n_isOnline(this)) xp = 0;   // eingeloggt: XP/Rang vergibt der Server (Nachricht "reward")
    const ups = xp ? Progress.addXP(xp) : []; Progress.save();
    won ? audio.win() : audio.lose(); audio.musicStart('menu');
    this.input.unlock();
    this.ui.showResults({ ev, won, xp, ups, stats: st, you: this.you, ents: this.ents, host: this.isHost, training: this.training });
    this.afterXP(ups);
  }

  // =================== Menü ===================
  enterMenu() {
    this.mode = 'menu'; this.inMatch = false; this.input.enabled = false; this.ctrl = false; this.matchEnded = false;
    for (const e of this.ents.values()) e.dispose && e.dispose(); this.ents.clear(); this.pickups.clear(); this.clearTransient();
    if (this.char) this.char.root.visible = false;
    this.ensureMenuChar(); this.menuChar.root.visible = true;
    this.fx.beams.forEach(b => { b.t = 0; });
    audio.musicStart('menu'); this.engine.underground = false; this.engine.setHour(17.5);
    this.camera.fov = 52; this.camera.updateProjectionMatrix(); this.menuT = 0; this.menuMode = 'orbit';
    this.view.updateLOD(new THREE.Vector3(MENU_POS.x, 0, MENU_POS.z), true);
  }
  ensureMenuChar() {
    const d = Progress.d;
    if (this.menuChar && (this.menuChar.skin.id !== d.skin || this.menuChar.wskinId !== d.wskin)) { this.scene.remove(this.menuChar.root); this.menuChar = null; }
    if (!this.menuChar) {
      this.menuChar = new Character(d.skin, d.wskin); this.scene.add(this.menuChar.root);
      this.menuChar.setWeapon(d.menuWeapon || 'striker'); this.menuChar.equipT = 1;
      this.menuChar.root.position.set(MENU_POS.x, MENU_POS.y, MENU_POS.z); this.menuChar.root.rotation.y = Math.PI;
    }
  }
  refreshMenuChar() { if (this.menuChar) { this.scene.remove(this.menuChar.root); this.menuChar = null; } this.ensureMenuChar(); this.menuChar.root.visible = this.mode === 'menu'; }
  setMenuView(m) { this.menuMode = m; }
  // Party-Mitglieder stehen im Hauptmenü neben dir (wie bei Fortnite); Skin und Waffe stammen vom Server-Zustand der Party
  syncPartyChars(p) {
    this.partyChars = this.partyChars || new Map(); const want = new Map();
    if (p) { let i = 0; for (const m of p.members) if (!m.you) { want.set(m.name, { m, slot: i++ }); } }
    for (const [name, c] of [...this.partyChars]) { const w = want.get(name); if (!w || c.skin !== w.m.skin || c.wskin !== w.m.wskin) { this.scene.remove(c.char.root); this.scene.remove(c.plate); c.plate.material.map.dispose(); c.plate.material.dispose(); this.partyChars.delete(name); } }
    for (const [name, w] of want) {
      let c = this.partyChars.get(name);
      if (!c) { const ch = new Character(w.m.skin, w.m.wskin); ch.setWeapon(['viper', 'striker', 'hornet'][w.slot % 3]); ch.equipT = 1; this.scene.add(ch.root); c = { char: ch, skin: w.m.skin, wskin: w.m.wskin, plate: this.partyPlate(name, w.m.leader) }; this.scene.add(c.plate); this.partyChars.set(name, c); }
      c.slot = w.slot;
    }
    this.partyCharsVisible(this.mode === 'menu');
  }
  partyPlate(name, leader) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.font = '800 30px "Trebuchet MS", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#000'; x.shadowBlur = 6; x.fillStyle = '#ffffff'; x.fillText((leader ? '♛ ' : '') + name, 128, 32);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false })); sp.scale.set(1.5, 0.375, 1); sp.renderOrder = 10; return sp;
  }
  partyCharsVisible(v) { if (this.partyChars) for (const c of this.partyChars.values()) c.char.root.visible = c.plate.visible = v && this.menuMode !== 'skins'; }
  updatePartyChars(dt) {
    if (!this.partyChars || !this.partyChars.size) return; const SLOTS = [[-1.2, -0.35, -0.2], [1.25, -0.45, -0.55], [2.4, -1.0, -0.65]];
    for (const c of this.partyChars.values()) { const s = SLOTS[c.slot % SLOTS.length]; c.char.root.position.set(MENU_POS.x + s[0], MENU_POS.y, MENU_POS.z + s[1]); c.char.root.rotation.y = s[2]; c.char.root.visible = c.plate.visible = this.mode === 'menu' && this.menuMode !== 'skins'; c.plate.position.set(MENU_POS.x + s[0], MENU_POS.y + 2.2, MENU_POS.z + s[1]); c.char.update(dt, { speed: 0, grounded: true, pitch: 0 }); }
  }

  // =================== Frame ===================
  frame(dt) {
    this.t += dt;
    const eng = this.engine, now = performance.now() / 1000;
    this.fx.fogD = eng.scene.fog.density; this.fx.density = eng.partDensity;
    if (this.mode === 'menu') { this.updateMenu(dt); }
    else if (this.mode === 'play') { this.updatePlay(dt, now); }
    if (this.duck) { this.duck.visible = !Progress.d.ach.duck; this.duck.rotation.y += dt * 1.5; this.duck.position.y += Math.sin(this.t * 2) * dt * 0.05; }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    this.shakeV = Math.max(0, this.shakeV - dt * 1.6);
    this.fx.update(dt, this.camera);
    this.updateProjs(dt); this.updateSupplies(dt, now); this.drones.update(dt, this.t);
    this.pickups.update(dt, this.t, this.camera.position);
    this.emotes.update(dt, (id, out) => { const e = this.ents.get(id); return !!(e && (e.self ? this.alive : e.alive && e.visible !== false) && this.entPos(id, out)); }, this.camera.position);
    this.updateMovers();
    // Tageszeit
    this.todTimer -= dt;
    if (this.todTimer <= 0) { this.todTimer = 1; if (this.mode === 'play' && this.todMode === 'dynamic') this.engine.setHour(this.hour0 + this.T() / 25); else if (this.mode === 'menu') this.engine.setHour(17.5 + Math.sin(this.t * 0.02) * 0.3); else this.engine.setHour(this.engine.hour); }
    // Post-Parameter
    const u = eng.post.u;
    u.uDamage.value = this.mode === 'play' ? this.hitFlash * (this.alive ? 1 : 0.4) + (this.alive ? 0 : 0.25) : 0; u.uLow.value = this.mode !== 'play' ? 0 : this.alive ? clamp(1 - this.hp / 45, 0, 1) * 0.8 : 0.9; u.uSpeed.value = this.alive && this.player.dashT > 0 ? 1 : (this.player.sprint ? 0.25 : 0);
    u.uScope.value = this.player.scoped ? 1 : 0; u.uFlash.value = 0;
    const focus = this.mode === 'play' ? this.camera.position : this.camera.position;
    eng.render(dt, this.mode === 'play' ? new THREE.Vector3(this.player.x, this.player.y, this.player.z) : new THREE.Vector3(MENU_POS.x, MENU_POS.y, MENU_POS.z));
    this.input.endFrame();
  }
  updateMovers() {
    const T = this.T();
    for (const m of this.map.movers) { const y = moverY(m, T); m.col.y0 = y; m.col.y1 = y + m.th; this.view.setMoverY(m.id, y); }
  }
  updateMenu(dt) {
    this.menuT += dt; const mc = this.menuChar; if (!mc) return;
    mc.update(dt, { speed: 0, grounded: true, pitch: 0 }); this.updatePartyChars(dt);
    const target = new THREE.Vector3(MENU_POS.x, MENU_POS.y + (this.menuMode === 'skins' ? 1.0 : 1.25), MENU_POS.z);
    let a, dist, h;
    if (this.menuMode === 'skins') { a = this.menuT * 0.5 + 0.3; dist = 3.2; h = 1.35; mc.root.rotation.y = 0; }
    else { a = Math.sin(this.menuT * 0.12) * 0.5 - 0.25; dist = 4.3; h = 1.45; mc.root.rotation.y = -0.45; }
    const off = this.menuMode === 'skins' ? 0.0 : 0.0;
    const side = this.menuMode === 'skins' ? -0.85 : -1.3;
    this.camera.position.set(target.x + Math.sin(a) * dist + Math.cos(a) * side * 0.0, MENU_POS.y + h, target.z + Math.cos(a) * dist);
    this.camera.lookAt(target.x + Math.cos(a) * -side * 0.0, target.y - 0.05, target.z);
    // Seitlicher Versatz, damit der Charakter rechts vom Menü steht
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion); this.camera.position.addScaledVector(right, side); this.camera.lookAt(target.clone().addScaledVector(right, side * 0.5));
    this.audio.updateListener(this.camera.position, 0);
  }
  // B halten → Emote-Rad; Zifferntasten 1–8 wählen (die Ziffern werden dabei NICHT als Waffenwechsel gezählt)
  updateEmoteInput() {
    const inp = this.input, want = !!(this.alive && this.ctrl && Account.flags.emotes !== false && inp.down('KeyB') && !this.ui.chatOpen);
    if (want !== !!this.emoteOpen) { this.emoteOpen = want; this.ui.emoteWheel(want); }
    if (!want) return;
    for (let i = 0; i < EMOTES.length; i++) { const code = 'Digit' + (i + 1); if (inp.hit(code)) { inp.pressed.delete(code); this.ui.sendEmote(i); } }
  }
  updatePlay(dt, now) {
    const p = this.player, c = this.combat, ch = this.char, eng = this.engine;
    // Pointer-Lock-Zustand
    if (this.countdownTick) this.countdownTick();
    if (this.startAt && this.T() < this.startAt) { const n = Math.ceil(this.startAt - this.T()); if (n !== this.countdownN && n <= 4 && n > 0) { this.countdownN = n; this.ui.countdown(String(n)); audio.countdown(false); } }
    // Spielerlogik
    this.updateEmoteInput();
    p.update(dt);
    const wDef = c.def;
    c.update(dt, this.input, p, now);
    // Interaktion
    this.updateInteract(dt);
    // Eigener Charakter
    if (ch) {
      const sp = p.speedH, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      ch.root.position.set(p.x, p.y, p.z); ch.root.rotation.y = p.yaw;
      ch.update(dt, { speed: sp, grounded: p.grounded, vy: p.vy, crouch: p.crouch, sprint: p.sprint, aim: p.aim, pitch: p.pitch, lf: p.vx * fx + p.vz * fz, ls: -p.vx * Math.cos(p.yaw) + p.vz * Math.sin(p.yaw), jetpack: p.jetting });
      if (!this.alive && ch.alive) ch.die(0, 1);
      ch.root.visible = !p.scoped;
      if (p.jetting) { for (let i = 0; i < 2; i++) this.fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y + 1.0, z: p.z + (Math.random() - 0.5) * 0.2, vy: -6, size: 0.4, life: 0.25, r: 3, g: 1.4, b: 0.4, a: 1, add: true, drag: 1 }); }
      audio.jetLoop(p.jetting, 1);
      if (p.hook) { const from = new THREE.Vector3(p.x, p.y + 1.3, p.z); this.fx.beam('grap', from, new THREE.Vector3(p.hook.x, p.hook.y, p.hook.z), 0xffa94d, 0.03); }
    }
    // Kamera
    p.updateCamera(dt, this.camera, this.world, wDef.scope);
    audio.updateListener(this.camera.position, p.yaw);
    // Zustand senden (20 Hz)
    this.stAcc += dt;
    if (this.stAcc >= 0.05 && this.alive && this.net) {
      this.stAcc = 0;
      this.send({ k: 'st', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), fl: p.fl | (this.combat.throwing ? FL.THROW : 0), w: this.combat.id, tp: p.tpFlag ? 1 : 0 });
      p.tpFlag = false;
    }
    // Entfernte Entitäten
    for (const e of this.ents.values()) { if (e.self) continue; e.update(dt, now, this.rctx); if (e.reveal > now) { /* Marker via Minimap */ } }
    // Umgebung
    this.lastAmbT -= dt;
    if (this.lastAmbT <= 0) {
      this.lastAmbT = 0.6; const zn = zoneAt(p.x, p.z); const underground = p.y < this.world.terrain(p.x, p.z) - 3 && p.y < 4;
      audio.setAmbience(zn ? zn.amb : 'wind', eng.sky.night, underground, p.wade); if (underground !== eng.underground) { eng.underground = underground; eng.setHour(eng.hour); }
    }
    // Kamera-Fokus für Schatten
    this.ui.hud && this.ui.hud.update(this, dt);
  }
  updateInteract(dt) {
    const p = this.player; let best = null, bd = 99;
    if (this.alive) {
      for (const c of this.map.chests) { const it = this.view.chestMeshes.get(c.id); if (!it || it.target) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 3 && Math.abs(c.y - p.y) < 2.5 && d < bd) { bd = d; best = { t: 'chest', id: c.id, text: 'Kiste öffnen' }; } }
      for (const s of this.map.switches) { const sw = this.view.switchMeshes.get(s.id); const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < 2.6 && Math.abs(s.y - p.y) < 2.5 && d < bd && !(s.once && sw && sw.on)) { bd = d; best = { t: 'switch', id: s.id, text: s.label }; } }
      for (const sp of this.map.secrets) if (sp.id === 'duck' && !Progress.d.ach.duck) { const d = Math.hypot(sp.x - p.x, sp.z - p.z); if (d < 3 && Math.abs(sp.y - p.y) < 2.5 && d < bd) { bd = d; best = { t: 'duck', id: 'duck', text: 'Etwas Glänzendes aufheben …' }; } }
    }
    this.interact = best;
    if (best && this.ctrlNow() && this.input.hit('KeyE')) {
      if (best.t === 'duck') { this.send({ k: 'interact', t: 'duck' }); this.ui.toast('Die GOLDENE ENTE! Quak!', 'event'); audio.pickup('shard'); }
      else this.send({ k: 'interact', t: best.t, id: best.id });
    }
  }
  zoneName() { const z = zoneAt(this.player.x, this.player.z); if (this.player.y < this.world.terrain(this.player.x, this.player.z) - 3 && this.player.y < 4) return z && z.id === 'city' ? 'U-Bahn' : 'Untergrund'; return z && !z.hidden ? z.name : z && z.hidden ? 'Crystal Caves' : 'Niemandsland'; }
  buildDuck() {
    const sp = this.map.secrets.find(s => s.id === 'duck'); if (!sp) return;
    const g = new THREE.Group(); const gold = new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 1, roughness: 0.2, emissive: 0x6a4a00, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), gold); body.scale.set(1.2, 0.9, 1); const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), gold); head.position.set(0, 0.28, 0.2);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xff8a1a })); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.26, 0.38);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), gold); tail.rotation.x = -1.2; tail.position.set(0, 0.1, -0.28);
    g.add(body, head, beak, tail); g.position.set(sp.x, sp.y + 0.4, sp.z); this.scene.add(g); this.duck = g;
    const l = new THREE.PointLight(0xffd24a, 3, 6); l.position.y = 0.6; g.add(l);
  }
  secretDuck() { const sp = this.map.secrets.find(s => s.id === 'duck'); return sp; }
}

function n_isOnline(game) { return !!(game.net && game.net.kind === 'ws'); }
