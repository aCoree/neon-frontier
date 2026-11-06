// Autoritative Raum-Simulation: Lobby, Match, Treffer, Projektile, Pickups, Türen, Events. Läuft auf dem Node-Server UND (offline) im Browser.
import { WEAPONS, THROWABLES, CONSUMABLES, POWERUPS, GADGETS, MODES, TEAMS, DIFFS, PLAYER, START_LOADOUT, NET, FL, LOOT, AMMO_GIVE, EMOTES, EMOTE_COOLDOWN, SKINS, WSKINS, BACKS, NAME_COLORS, AVATAR_BGS, AVATAR_ICONS } from '../defs.js';
import { World, rayCylinder } from '../world.js';
import { buildMap, moverY, MAP_IDS } from '../mapdata.js';
import { spreadDirs, mulberry32, clamp, lerp } from '../util.js';
import { Nav } from './nav.js';
import { Bots } from './bots.js';

const R_BODY = 0.42, H_STAND = 1.8, H_CROUCH = 1.25;
const r2 = (v) => Math.round(v * 100) / 100;
const clean = (s, n = 16) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
let idc = 1;
export const FALL_SAFE = 5.5, FALL_DMG_PER_M = 7, FALL_LAUNCH_VY = 10.5;   // Meter ohne Schaden · Schaden pro weiterem Meter (≈ 24 m = tödlich) · Start-Tempo ab dem es ein Katapult ist
// Bewegungsprüfung (serverseitig): Tempo-Budget statt starrem Limit. Erlaubte Geschwindigkeit hängt vom Zustand ab, den der SERVER kennt
// (Speed-Boost, Dash-Abklingzeit, Gadget im Besitz, Sprungplatte in der Nähe, kürzlich Schaden erlitten). Teleports gelten nur an erlaubten Zielen.
export const MOVE = { base: 9.6, boost: 12.6, dash: 21, grapple: 33, jet: 19, pad: 30, hurt: 24, bucket: 1.5, slack: 0.6, up: 13, upPad: 34, upJet: 16, airMax: 9 };
export const VS_SECS = 4.5;   // so lange steht die Gegner-Karte („A gegen B“) vor dem Countdown
export const MAX_WEAPONS = 5;   // Plätze: Viper + Klinge + 3 gefundene Waffen
const GLOBAL_EV = new Set(['kill', 'clock', 'end', 'go', 'iact', 'pick', 'pickr', 'drop', 'lowgrav', 'supply', 'supplyland', 'toast', 'join', 'leave', 'spawn', 'drone']);

export class Room {
  constructor(code, opts = {}) {
    this.hooks = opts.hooks || null; this.code = code; this.members = new Map(); this.ents = new Map(); this.state = 'lobby'; this.hostId = null;
    this.settings = { mode: 'ffa', bots: 3, diff: 'normal', scoreLimit: 0, timeLimit: 6, tod: 'day', fillBots: true, training: false, map: 'frontier', ...(opts.settings || {}), ranked: opts.ranked === true };
    if (!MAP_IDS.includes(this.settings.map)) this.settings.map = 'frontier';
    if (this.settings.ranked) this.settings.map = 'arena';   // Ranked wird immer auf der Arena gespielt   // Ranked kann nur der Server setzen (Matchmaking), nie ein Client über die Einstellungen
    this.local = !!opts.local;
    this.T = 0; this.last = Date.now(); this.tickN = 0; this.ev = []; this.emptyAt = 0;
    this.rng = mulberry32((Date.now() & 0xffffff) ^ 0x5bd1e995);
    this.nextId = 1; this.projs = []; this.dyn = []; this.smokes = []; this.drones = []; this.supplies = [];
    this.lowgravUntil = 0; this.endAt = 0; this.startAt = 0; this.matchEnd = 0; this.lastClock = 0;
    this.loadMap(this.settings.map);
    this.lastHistT = 0;
  }

  // Karte laden (Gelände, Kollisionen, Pickups, Spawns). Nur in der Lobby wechselbar.
  loadMap(id) {
    if (!MAP_IDS.includes(id)) id = 'frontier';
    this.settings.map = id;
    this.map = buildMap(true, id); this.map.parts = []; this.map.props = []; this.map.glows = []; this.map.lights = []; this.map.anims = []; this.map.labels = []; // nur Render-Daten, Server braucht sie nicht
    this.world = new World(this.map);
    this.nav = Nav.for(this.world);
    this.bots = new Bots(this);
    this.doorsById = new Map(this.map.doors.map(d => [d.id, d]));
    this.chestState = new Map(this.map.chests.map(c => [c.id, { open: false, until: 0 }]));
    this.switchState = new Map(this.map.switches.map(s => [s.id, { on: false }]));
    this.pickups = this.map.pickups.map(p => ({ ...p, y: p.y ?? this.groundY(p.x, p.z), on: true, next: 0 }));
    this.spawns = this.map.spawns.map(s => ({ ...s, y: s.y ?? undefined }));
    for (const s of this.spawns) { const g = this.world.groundAt(s.x, s.z, (s.y ?? 80) + 0.5); s.y = g; }
    this.spawns = this.spawns.filter(s => s.y > -30 && this.nav.isWalk(s.x, s.z) || s.y < -6 || (s.y > 8 && s.y < 60)); // ungültige Spawns in Wänden raus
    this.surfaceSpawns = this.spawns.filter(s => this.nav.isWalk(s.x, s.z) && s.y > -3);
    this.zoneFx = this.map.zonesFx || [];
  }
  groundY(x, z) { const t = this.world.terrain(x, z); return Math.max(t, this.world.groundAt(x, z, t + 1.2)); }
  humans() { return [...this.members.values()].filter(m => m.connected); }
  send(m, o) { if (m.connected && m.client) m.client.send(o); }
  all(o) { for (const m of this.members.values()) this.send(m, o); }
  emit(e) { this.ev.push(e); }

  // =============== Lobby ===============
  addMember(client, profile) {
    const id = idc++;
    const m = { id, client, name: clean(profile.name, 14) || 'Spieler' + id, skin: SKINS.some(k => k.id === profile.skin) ? profile.skin : 'vanguard', wskin: WSKINS.some(k => k.id === profile.wskin) ? profile.wskin : 'default', back: profile.userId && BACKS.some(k => k.id === profile.back) ? profile.back : 'none', rp: profile.userId ? Math.max(0, profile.rp | 0) : 0, nc: NAME_COLORS.some(k => k.id === profile.nc) ? profile.nc : '', av: profile.av && AVATAR_BGS.some(k => k.id === profile.av.bg) && AVATAR_ICONS.some(k => k.id === profile.av.icon) ? { bg: profile.av.bg, icon: profile.av.icon } : null, level: profile.level | 0, userId: profile.userId || null, party: profile.party | 0, role: profile.role || 'PLAYER', muted: new Set(), lastChat: 0, chatBurst: 0, team: -1, connected: true, token: Math.random().toString(36).slice(2) + Date.now().toString(36), rtt: 0.08, ent: null, lastSeen: Date.now(), msgs: 0 };
    this.members.set(id, m);
    if (this.hostId == null || !this.members.get(this.hostId)?.connected) this.hostId = id;
    this.emptyAt = 0;
    this.send(m, { k: 'joined', code: this.code, you: id, token: m.token, host: this.hostId, state: this.state });
    if (this.state === 'lobby') this.lobbyUpdate(); else this.lateJoin(m);
    return m;
  }
  lobbyData() {
    return { k: 'lobby', code: this.code, ranked: this.settings.ranked ? 1 : 0, auto: this.mm ? 1 : 0, host: this.hostId, state: this.state, settings: this.settings, modes: undefined, members: [...this.members.values()].filter(m => m.connected).map(m => ({ id: m.id, name: m.name, skin: m.skin, wskin: m.wskin, team: m.team, level: m.level, acct: m.userId ? 1 : 0 })) };
  }
  lobbyUpdate() { this.all(this.lobbyData()); }
  removeMember(m, hard = true) {
    if (hard) { m.connected = false; this.members.delete(m.id); if (m.ent) { this.killSilently(m.ent); this.ents.delete(m.ent.id); this.emit({ k: 'leave', id: m.ent.id }); } }
    else { m.connected = false; m.dcAt = this.T; if (m.ent) m.ent.dcInvuln = true; }
    if (this.hostId === m.id) { const n = this.humans()[0]; this.hostId = n ? n.id : null; }
    if (!this.humans().length && !this.emptyAt) this.emptyAt = Date.now();
    if (this.state === 'lobby') this.lobbyUpdate();
    else this.all({ k: 'hostchg', host: this.hostId });
  }
  resume(m, client) {
    m.client = client; m.connected = true; m.dcAt = 0; this.emptyAt = 0; if (m.ent) m.ent.dcInvuln = false;
    if (this.hostId == null) this.hostId = m.id;
    this.send(m, { k: 'joined', code: this.code, you: m.id, token: m.token, host: this.hostId, state: this.state, resumed: true });
    if (this.state === 'lobby') this.lobbyUpdate(); else this.sendStart(m);
  }

  handle(m, msg) {
    if (!msg || typeof msg.k !== 'string') return;
    m.lastSeen = Date.now();
    if (this.mm && ['set', 'team', 'shuffle', 'start', 'kick'].includes(msg.k)) return;   // Matchmaking-Raum: der Server startet das Match, niemand verstellt Einstellungen/Teams
    switch (msg.k) {
      case 'ping': if (typeof msg.rtt === 'number') m.rtt = clamp(lerp(m.rtt, msg.rtt, 0.3), 0.01, 1); this.send(m, { k: 'pong', t: msg.t, T: this.T }); return;
      case 'chat': {
        if (this.hooks?.chatAllowed && !this.hooks.chatAllowed()) { this.send(m, { k: 'toast', text: 'Chat ist derzeit deaktiviert.' }); return; }
        const now = Date.now(); m.chatBurst = Math.max(0, m.chatBurst - (now - m.lastChat) / 1500); m.lastChat = now;
        if (++m.chatBurst > 4) { this.send(m, { k: 'toast', text: 'Nicht so schnell – Chat-Spam-Schutz.' }); return; }
        let t = clean(msg.text, 140); if (!t) return; if (this.hooks?.filter) t = this.hooks.filter(t);
        const myTeam = m.ent ? m.ent.team : m.team, out = { k: 'chat', id: m.id, from: m.name, team: myTeam, text: t };
        if (msg.scope === 'team') {   // Team-Chat: nur Mitglieder desselben Teams bekommen die Nachricht (Gegner erfahren nichts)
          if (!(myTeam >= 0)) { this.send(m, { k: 'toast', text: 'Team-Chat gibt es nur in Team-Modi.' }); return; }
          out.scope = 'team';
          for (const o of this.members.values()) if ((o.ent ? o.ent.team : o.team) === myTeam && !(m.userId && o.muted.has(String(m.userId)))) this.send(o, out);
          return;
        }
        for (const o of this.members.values()) if (!(m.userId && o.muted.has(String(m.userId)))) this.send(o, out);
        return;
      }
      case 'profile': m.name = clean(msg.name, 14) || m.name; m.skin = msg.skin || m.skin; m.wskin = msg.wskin || m.wskin; m.level = msg.level | 0; if (this.state === 'lobby') this.lobbyUpdate(); return;
      case 'set': return this.setSettings(m, msg.s || {});
      case 'team': return this.setTeam(m, msg.team | 0, msg.target);
      case 'shuffle': if (m.id === this.hostId && this.state === 'lobby') { for (const x of this.members.values()) x.team = -1; this.autoAssign(); this.lobbyUpdate(); } return;
      case 'start': if (m.id === this.hostId && this.state === 'lobby') this.start(); return;
      case 'kick': if (m.id === this.hostId && this.state === 'lobby') { const t = this.members.get(msg.id | 0); if (t && t.id !== m.id) { this.send(t, { k: 'kicked' }); this.removeMember(t, true); } } return;
      case 'backlobby': if (m.id === this.hostId && this.state === 'ended') this.toLobby(); return;
    }
    const e = m.ent; if (!e || this.state === 'lobby') return;
    switch (msg.k) {
      case 'st': return this.onState(m, e, msg);
      case 'fire': return this.onFire(m, e, msg);
      case 'swap': if (WEAPONS[msg.w] && e.owned.includes(msg.w)) e.w = msg.w; return;
      case 'dropw': return this.dropWeapon(e);
      case 'reload': e.reloadUntil = this.T + 1; return;
      case 'throw': return this.onThrow(m, e, msg);
      case 'use': return this.onUse(m, e, msg);
      case 'interact': return this.onInteract(m, e, msg);
      case 'gadget': return this.onGadget(m, e, msg);
      case 'dash': this.emit({ k: 'dash', id: e.id }); return;
      case 'emote': {   // nur gültige IDs, nur lebende Spieler, feste Abklingzeit – alles serverseitig
        const idx = EMOTES.findIndex(x => x.id === msg.id); if (idx < 0 || !e.alive) return;
        if (this.hooks?.emotesAllowed && !this.hooks.emotesAllowed()) return;
        const now = Date.now(); if (now < (m.emoteAt || 0)) return; m.emoteAt = now + EMOTE_COOLDOWN * 1000;
        this.emit({ k: 'emote', id: e.id, e: idx }); this.hooks?.track?.('emote', msg.id); return;
      }
      case 'suicide': if (e.alive && !this.settings.training) this.damage(e, 9999, e, { w: 'fall' }); return;
    }
  }

  setSettings(m, s) {
    if (m.id !== this.hostId || this.state !== 'lobby') return;
    const S = this.settings;
    if (s.mode && MODES[s.mode]) { S.mode = s.mode; for (const x of this.members.values()) x.team = -1; }
    if (s.bots !== undefined) S.bots = clamp(s.bots | 0, 0, 11);
    if (s.diff && DIFFS[s.diff]) S.diff = s.diff;
    if (s.scoreLimit !== undefined) S.scoreLimit = clamp(s.scoreLimit | 0, 0, 100);
    if (s.timeLimit !== undefined) S.timeLimit = clamp(s.timeLimit | 0, 2, 20);
    if (s.tod && ['day', 'sunset', 'night', 'dynamic'].includes(s.tod)) S.tod = s.tod;
    if (s.fillBots !== undefined) S.fillBots = !!s.fillBots;
    if (s.map && MAP_IDS.includes(s.map) && !S.ranked && s.map !== S.map) this.loadMap(s.map);
    this.lobbyUpdate();
  }
  setTeam(m, team, targetId) {
    if (this.state !== 'lobby') return;
    const mode = MODES[this.settings.mode]; if (!mode.teams) return;
    let who = m; if (targetId && m.id === this.hostId) who = this.members.get(targetId | 0) || m;
    if (team < -1 || team >= mode.teams) return;
    if (team >= 0 && mode.size) { const n = [...this.members.values()].filter(x => x.team === team && x !== who).length; if (n >= mode.size) return; }
    who.team = team; this.lobbyUpdate();
  }
  autoAssign() {
    const mode = MODES[this.settings.mode]; if (!mode.teams) return;
    const cnt = new Array(mode.teams).fill(0);
    for (const x of this.members.values()) if (x.team >= 0 && x.team < mode.teams) cnt[x.team]++; else x.team = -1;
    const partyTeam = new Map(); for (const x of this.members.values()) if (x.team >= 0 && x.party && !partyTeam.has(x.party)) partyTeam.set(x.party, x.team);
    for (const x of this.members.values()) {
      if (x.team >= 0) continue;
      let best = -1; const pt = x.party ? partyTeam.get(x.party) : undefined;
      if (pt !== undefined && (!mode.size || cnt[pt] < mode.size)) best = pt;   // Party bleibt zusammen, solange im Team Platz ist
      else for (let t = 0; t < mode.teams; t++) if ((!mode.size || cnt[t] < mode.size) && (best < 0 || cnt[t] < cnt[best])) best = t;
      if (best < 0) best = 0; x.team = best; cnt[best]++; if (x.party && !partyTeam.has(x.party)) partyTeam.set(x.party, best);
    }
  }

  // =============== Matchstart ===============
  start() {
    const S = this.settings, mode = MODES[S.mode], humans = this.humans();
    if (!humans.length) return;
    if (humans.length > mode.max && !S.training) { this.send(this.members.get(this.hostId), { k: 'err', text: `Zu viele Spieler für ${mode.name} (max ${mode.max}).` }); return; }
    this.ents.clear(); this.projs.length = 0; this.dyn.length = 0; this.smokes.length = 0; this.drones.length = 0; this.supplies.length = 0; this.ev.length = 0;
    for (const p of this.pickups) { p.on = true; p.next = 0; }
    for (const [, c] of this.chestState) { c.open = false; c.until = 0; }
    for (const d of this.map.doors) { this.setDoor(d, false); d.locked = d.id === 'vault' || d.id === 'gateW' || d.id === 'subvault' || d.id === 'caveSecret'; }
    for (const [, s] of this.switchState) s.on = false;
    this.lowgravUntil = 0; this.T = 0; this.last = Date.now();
    if (mode.teams) this.autoAssign();
    for (const m of humans) {
      const e = this.newEnt({ name: m.name, skin: m.skin, wskin: m.wskin, team: mode.teams ? m.team : -1, member: m, level: m.level });
      m.ent = e;
    }
    // Bots auffüllen
    let nb = 0;
    if (S.training) nb = 0;
    else if (mode.teams && mode.size) {
      if (S.fillBots) { const cnt = new Array(mode.teams).fill(0); for (const e of this.ents.values()) cnt[e.team]++; for (let t = 0; t < mode.teams; t++) while (cnt[t] < mode.size) { this.addBot(t); cnt[t]++; nb++; } }
    } else {
      const room = mode.max - humans.length; nb = Math.min(S.bots, room);
      const cnt = new Array(Math.max(1, mode.teams)).fill(0); for (const e of this.ents.values()) if (e.team >= 0) cnt[e.team]++;
      for (let i = 0; i < nb; i++) { let t = -1; if (mode.teams) { t = cnt.indexOf(Math.min(...cnt)); cnt[t]++; } this.addBot(t); }
    }
    if (S.training) {
      const pts = (this.zoneFx.find(z => z.id === 'dummies') || { pts: [] }).pts;
      pts.forEach((p, i) => { const b = this.addBot(-1, { dummy: true, home: p }); b.dummy = true; });
    }
    for (const e of this.ents.values()) this.spawnEnt(e, true);
    this.matchId = this.code + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.vs = !S.training && humans.length >= 2 ? VS_SECS : 0;   // Gegner-Karte vor dem Countdown, wenn echte Spieler gegeneinander antreten
    this.state = 'countdown'; this.startAt = this.T + (S.training ? 1.5 : 4 + this.vs);
    const limit = S.scoreLimit || mode.score; this.scoreLimit = limit; this.matchEnd = 0;
    this.nextSupply = this.startAt + 70; this.timeLimit = S.timeLimit * 60;
    this.hour0 = S.map === 'arena' ? ({ day: 18.9, sunset: 19.6, night: 23, dynamic: 18.5 + Math.random() * 5 }[S.tod] ?? 18.9) : ({ day: 13, sunset: 18.4, night: 23, dynamic: 8 + Math.random() * 10 }[S.tod] ?? 13);
    for (const m of humans) this.sendStart(m);
  }
  sendStart(m) {
    m.sent = null;
    const S = this.settings;
    this.send(m, {
      k: 'start', you: m.ent ? m.ent.id : null, settings: S, vs: this.vs || 0, T: this.T, startAt: this.startAt, hour0: this.hour0, scoreLimit: this.scoreLimit, timeLimit: this.timeLimit,
      ents: [...this.ents.values()].map(e => this.entInfo(e)), pickups: this.pickups.filter(p => !p.on).map(p => p.id), dyn: this.dyn.map(d => this.dynInfo(d)),
      doors: this.map.doors.map(d => [d.id, d.open ? 1 : 0, d.locked ? 1 : 0]), chests: [...this.chestState].filter(([, c]) => c.open).map(([id]) => id), switches: [...this.switchState].filter(([, s]) => s.on).map(([id]) => id),
      lowgrav: this.lowgravUntil, scores: this.scores(), state: this.state, shards: m.ent ? [...m.ent.shardSet] : [],
    });
    if (m.ent) this.sendInv(m.ent);
  }
  entInfo(e) { return { id: e.id, name: e.name, skin: e.skin, wskin: e.wskin, back: e.back, rp: e.isBot ? 0 : e.rp, nc: e.nc, av: e.av, team: e.team, bot: e.isBot ? 1 : 0, level: e.level, acct: e.member && e.member.userId ? 1 : 0, k: e.kills, d: e.deaths, sc: e.score, diff: e.diff }; }
  lateJoin(m) {
    const mode = MODES[this.settings.mode];
    if (this.state === 'ended') { this.send(m, { k: 'err', text: 'Das Match ist gerade zu Ende.' }); }
    let team = -1;
    if (mode.teams) { const cnt = new Array(mode.teams).fill(0); for (const e of this.ents.values()) if (e.team >= 0) cnt[e.team]++; team = cnt.indexOf(Math.min(...cnt)); }
    // einen Bot ersetzen, falls vorhanden
    const bot = [...this.ents.values()].find(e => e.isBot && !e.dummy && (team < 0 || e.team === team)) || [...this.ents.values()].find(e => e.isBot && !e.dummy);
    if (bot) { this.ents.delete(bot.id); this.emit({ k: 'leave', id: bot.id }); if (bot.team >= 0) team = bot.team; }
    m.team = team;
    const e = this.newEnt({ name: m.name, skin: m.skin, wskin: m.wskin, team, member: m, level: m.level }); m.ent = e;
    this.spawnEnt(e, true);
    this.emit({ k: 'join', e: this.entInfo(e) });
    this.sendStart(m);
  }
  toLobby() {
    this.state = 'lobby'; this.ents.clear(); this.projs.length = 0; this.dyn.length = 0;
    for (const m of this.members.values()) m.ent = null;
    for (const [id, m] of [...this.members]) if (!m.connected) this.members.delete(id);
    this.lobbyUpdate();
  }

  newEnt(o) {
    const id = o.bot ? 'b' + (this.nextId++) : 'p' + (o.member ? o.member.id : this.nextId++);
    const e = {
      id, name: o.name, skin: o.skin, wskin: o.wskin || 'default', back: o.back || o.member?.back || 'none', rp: o.rp ?? o.member?.rp ?? 0, nc: o.member?.nc || '', av: o.member?.av || null, team: o.team ?? -1, isBot: !!o.bot, member: o.member || null, level: o.level | 0,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fl: 0, w: 'viper', vx: 0, vy: 0, vz: 0, hp: 100, shield: 0, alive: false, respawnAt: 0,
      kills: 0, deaths: 0, score: 0, streak: 0, best: 0, hs: 0, dmgDealt: 0, owned: [...START_LOADOUT], cons: { medkit: 1, shieldpot: 0, grenade: 1, smoke: 0 }, gadget: null, gadCd: {},
      lastFire: {}, power: {}, barrier: 0, barrierUntil: 0, spawnInv: 0, hist: [], shardSet: new Set(), chests: 0, lastUse: 0, crouch: false, reloadUntil: 0, lastSt: 0, rateViol: 0, beamAcc: {}, beamT: 0, dcInvuln: false, assists: {}, lastDmgFrom: null,
    };
    this.ents.set(id, e); return e;
  }
  addBot(team, o = {}) {
    const names = ['Axiom', 'Blitz', 'Cipher', 'Dynamo', 'Echo', 'Flux', 'Gizmo', 'Havoc', 'Ion', 'Jolt', 'Kilo', 'Lynx', 'Mako', 'Nova', 'Onyx', 'Pixel', 'Quasar', 'Rogue', 'Spark', 'Turbo', 'Vector', 'Warden', 'Zephyr'];
    const used = new Set([...this.ents.values()].map(e => e.name));
    const free = names.filter(n => !used.has('[BOT] ' + n));
    let name = free.length ? free[Math.floor(this.rng() * free.length)] : 'Bot' + this.nextId;
    if (o.dummy) name = 'Zielpuppe';
    const skins = ['vanguard', 'ember', 'verdant', 'phantom', 'solaris', 'frost', 'rogue', 'samurai'];
    const e = this.newEnt({ name: '[BOT] ' + name, skin: skins[Math.floor(this.rng() * skins.length)], team, bot: true, level: 1 + Math.floor(this.rng() * 12) });
    e.diff = this.settings.diff; e.home = o.home || null; e.dummy = !!o.dummy;
    this.bots.init(e);
    return e;
  }

  // =============== Spawning ===============
  pickSpawn(e) {
    const pool = this.settings.training && !e.isBot ? this.spawns.filter(s => s.x < -90 && s.z > 80) : (e.isBot ? this.surfaceSpawns : this.spawns);
    if (!pool.length) return { x: 0, y: 1, z: 0, yaw: 0 };
    const enemies = [...this.ents.values()].filter(o => o !== e && o.alive && (o.team < 0 || o.team !== e.team));
    const scored = pool.map(s => { let md = 9999; for (const o of enemies) md = Math.min(md, Math.hypot(o.x - s.x, o.z - s.z) + Math.abs(o.y - s.y) * 0.5); return { s, md: enemies.length ? md : this.rng() * 100 }; });
    scored.sort((a, b) => b.md - a.md);
    const top = scored.slice(0, Math.max(1, Math.min(5, scored.length)));
    return top[Math.floor(this.rng() * top.length)].s;
  }
  spawnEnt(e, first = false) {
    let s = this.pickSpawn(e);
    if (e.dummy && e.home) s = { x: e.home[0], z: e.home[1], y: this.groundY(e.home[0], e.home[1]), yaw: 0 };
    e.x = s.x + (this.rng() - 0.5) * 1.2; e.z = s.z + (this.rng() - 0.5) * 1.2; e.y = s.y + 0.05; e.yaw = s.yaw || this.rng() * 6.28; e.pitch = 0;
    e.vx = e.vy = e.vz = 0; e.hp = 100; e.shield = this.settings.training ? 100 : 0; e.alive = true; e.fl = 0; e.crouch = false;
    e.spawnInv = this.T + (this.settings.training ? 0.5 : 2.5);
    e.owned = [...START_LOADOUT]; e.w = 'viper'; e.cons = { medkit: 1, shieldpot: 0, grenade: 1, smoke: 0 }; e.gadget = null; e.power = {}; e.barrier = 0; e.lastFire = {};
    if (this.settings.training) { e.cons = { medkit: 4, shieldpot: 4, grenade: 5, smoke: 4 }; }
    e.hist.length = 0; e.streak = 0; e.lastDmgFrom = null; e.assists = {};
    if (e.isBot) this.bots.onSpawn(e);
    e.fall = null; this.allowTp(e, e.x, e.y, e.z, 6, 5); this.emit({ k: 'spawn', id: e.id, x: r2(e.x), y: r2(e.y), z: r2(e.z), yaw: r2(e.yaw), first: first ? 1 : 0 });
    if (e.member) this.sendInv(e);
  }
  killSilently(e) { e.alive = false; }

  sendInv(e, eq) {
    if (!e.member) return;
    const now = this.T, pw = {}; for (const [k, v] of Object.entries(e.power)) if (v > now) pw[k] = r2(v - now);
    this.send(e.member, { k: 'inv', w: e.owned, c: e.cons, g: e.gadget, pw, bar: e.barrierUntil > now ? Math.round(e.barrier) : 0, T: this.T, eq });
  }

  // =============== Eingaben ===============
  onState(m, e, s) {
    if (!e.alive || this.state === 'ended') return;
    const x = +s.x, y = +s.y, z = +s.z;
    if (!isFinite(x + y + z)) return;
    const dt = Math.max(0.02, this.T - e.lastSt); e.lastSt = this.T;
    let d = Math.hypot(x - e.x, z - e.z);
    if (this.state === 'playing' && !this.checkMove(m, e, s, x, y, z, d)) return;
    if (this.state === 'countdown') return;
    if (e.mv?.tpAccepted) { e.mv.tpAccepted = false; d = 0; }
    e.vx = (x - e.x) / dt; e.vz = (z - e.z) / dt; e.vy = (y - e.y) / dt;
    const B = this.world.bound + 0.5; e.x = clamp(x, -B, B); e.y = clamp(y, -60, 200); e.z = clamp(z, -B, B);
    e.yaw = +s.yaw || 0; e.pitch = clamp(+s.pitch || 0, -1.6, 1.6);
    let fl = (s.fl | 0) & (FL.CROUCH | FL.SPRINT | FL.AIR | FL.DASH | FL.RELOAD | FL.AIM | FL.SHOOT | FL.GRAPPLE | FL.JET | FL.MELEE | FL.THROW);
    e.crouch = !!(fl & FL.CROUCH); e.clientFl = fl;
    if (WEAPONS[s.w] && e.owned.includes(s.w)) e.w = s.w;
    this.trackFall(e, fl, d, s.tp);
    if (e.y < -40) this.damage(e, 9999, e, { w: 'fall' });
  }
  // Liefert false, wenn die Bewegung unplausibel ist (dann bekommt der Client ein 'fix' und wird zurückgesetzt).
  checkMove(m, e, s, x, y, z, d) {
    const T = this.T, mv = e.mv || (e.mv = { t: T, bud: 0, vb: 0, air: 0, dashReady: 0, dashUntil: 0, padUntil: 0, grapUntil: 0, jetUntil: 0, hurtUntil: 0, grants: [], beacon: null, viol: 0, violT: T, reported: 0 });
    const el = clamp(T - mv.t, 0, 4); mv.t = T; mv.grants = mv.grants.filter(g => g.until > T);
    const fl = (s.fl | 0), dy = y - e.y;
    // Teleport nur an vom Server erlaubten Zielen: Spawn/Fix, Teleporter-Anker, Karten-Portale (Quelle in der Nähe)
    if (s.tp) {
      let ok = mv.grants.some(g => Math.hypot(x - g.x, z - g.z) <= g.r && Math.abs(y - g.y) <= g.r + 3);
      if (!ok) for (const t of this.map.tele) if (Math.hypot(e.x - t.x, e.z - t.z) < 3.8 && Math.abs(e.y - t.y) < 3 && Math.hypot(x - t.to.x, z - t.to.z) < 3.8 && Math.abs(y - t.to.y) < 3.5) { ok = true; break; }
      if (ok) { mv.bud = 0; mv.vb = 0; mv.air = 0; mv.tpAccepted = true; mv.grants.length = 0; return true; }
    }
    // Zustände, die höheres Tempo rechtfertigen (alle vom Server geprüft, nicht vom Client behauptet)
    if ((fl & FL.DASH) && T >= mv.dashReady) { mv.dashUntil = T + 0.5; mv.dashReady = T + PLAYER.dashCd * 0.7; }
    if ((fl & FL.GRAPPLE) && e.gadget === 'grapple') mv.grapUntil = T + 1.0;
    if ((fl & FL.JET) && e.gadget === 'jetpack') mv.jetUntil = T + 1.0;
    for (const p of this.map.pads) if (Math.abs(p.y - e.y) < 2.5 && Math.hypot(p.x - e.x, p.z - e.z) < p.r + 2.2) { mv.padUntil = T + 3.2; break; }
    let vmax = (e.power.speed || 0) > T ? MOVE.boost : MOVE.base, vup = MOVE.up;
    if (T < mv.dashUntil) vmax = Math.max(vmax, MOVE.dash);
    if (T < mv.jetUntil) { vmax = Math.max(vmax, MOVE.jet); vup = MOVE.upJet; }
    if (T < mv.grapUntil) { vmax = Math.max(vmax, MOVE.grapple); vup = MOVE.upPad; }
    if (T < mv.padUntil) { vmax = Math.max(vmax, MOVE.pad); vup = MOVE.upPad; }
    if (T < mv.hurtUntil) vmax = Math.max(vmax, MOVE.hurt);
    mv.bud = Math.min(vmax * MOVE.bucket, mv.bud + vmax * el) - d;
    mv.vb = Math.min(vup * MOVE.bucket, mv.vb + vup * el) - Math.max(0, dy);
    // Fliegen: dauerhaft in der Luft ohne Jetpack/Enterhaken/Sprungplatte
    const gap = y - this.world.groundAt(x, z, y + 0.6);
    if (gap > 1.3 && T >= mv.jetUntil && T >= mv.grapUntil && T >= mv.padUntil) mv.air += el; else if (gap <= 1.3) mv.air = 0;
    const down = -dy > 52 * Math.max(el, 0.05) + 3;
    const why = mv.bud < -MOVE.slack ? 'speed' : mv.vb < -MOVE.slack ? 'climb' : mv.air > MOVE.airMax ? 'fly' : down ? 'drop' : null;
    if (!why) return true;
    // Zurücksetzen (Rubber-Band); wiederholte Verstöße werden gemeldet
    mv.bud = 0; mv.vb = 0; mv.air = 0; mv.grants.push({ x: e.x, y: e.y, z: e.z, r: 5, until: T + 2.5 });
    this.send(m, { k: 'fix', x: r2(e.x), y: r2(e.y), z: r2(e.z) });
    if (T - mv.violT > 3) mv.viol = Math.max(0, mv.viol - 1); mv.violT = T; mv.viol++;
    if (mv.viol >= 6 && T - mv.reported > 20) { mv.reported = T; this.hooks?.suspicious?.(m, 'movement', `${why} dist=${d.toFixed(1)} dy=${dy.toFixed(1)} v=${mv.viol}`); }
    return false;
  }
  // Server-seitig erlaubte Teleport-Ziele (Spawn, Fix, Teleporter-Anker)
  allowTp(e, x, y, z, r = 5, secs = 4) { const mv = e.mv || (e.mv = { t: this.T, bud: 0, vb: 0, air: 0, dashReady: 0, dashUntil: 0, padUntil: 0, grapUntil: 0, jetUntil: 0, hurtUntil: 0, grants: [], beacon: null, viol: 0, violT: this.T, reported: 0 }); mv.grants.push({ x, y, z, r, until: this.T + secs }); mv.t = this.T; mv.bud = 0; mv.vb = 0; mv.air = 0; }
  // Fallschaden – serverseitig aus der Bewegung abgeleitet (Luftphase, höchster Punkt, Landehöhe); der Client kann ihn nicht abschalten.
  // Kein Schaden bei: Jetpack, Enterhaken, Niedrig-Schwerkraft, Sprungplatten/Starts (Aufwärtstempo > Sprung), Teleport, Wasser, Training.
  trackFall(e, fl, d, tp) {
    const f = e.fall || (e.fall = { air: false, peak: 0, safe: false });
    if (tp || d > 8 || this.state !== 'playing') { f.air = false; return; }
    const gy = this.world.groundAt(e.x, e.z, e.y + 0.6), air = e.y - gy > 0.5;
    if (air) {
      if (!f.air) { f.air = true; f.peak = e.y; f.safe = false; }
      if (e.y > f.peak) f.peak = e.y;
      if ((fl & (FL.GRAPPLE | FL.JET)) || this.T < this.lowgravUntil || e.vy > FALL_LAUNCH_VY) f.safe = true;
      return;
    }
    if (!f.air) return; f.air = false;
    const drop = f.peak - e.y; if (f.safe || drop <= FALL_SAFE || this.settings.training) return;
    const sea = this.map.seaLevel ?? 0; if (this.world.terrain(e.x, e.z) < sea + 0.1 && e.y < sea + 1.5) return;   // Landung im Wasser
    this.damage(e, Math.min(100, (drop - FALL_SAFE) * FALL_DMG_PER_M), e, { w: 'fall' });
  }

  entHeight(e) { return e.crouch ? H_CROUCH : H_STAND; }
  isEnemy(a, b) { return a !== b && (a.team < 0 || b.team < 0 || a.team !== b.team); }
  rewindPos(e, ago) {
    const h = e.hist; if (!h.length || ago <= 0) return { x: e.x, y: e.y, z: e.z, h: this.entHeight(e) };
    const t = this.T - ago;
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) { const a = h[i - 1], b = h[i], u = clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1); return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), h: b.h }; }
    }
    const a = h[0]; return { x: a.x, y: a.y, z: a.z, h: a.h };
  }

  onFire(m, e, msg) { this.fire(e, msg.w, msg.o, msg.d, msg.s | 0, +msg.sp || 1, m.rtt); }
  fire(e, wid, o, d, seed, sp, rtt = 0) {
    if (!e.alive || this.state !== 'playing') return;
    const def = WEAPONS[wid]; if (!def || !e.owned.includes(wid)) return;
    const last = e.lastFire[wid] ?? -9; if (this.T - last < (1 / def.rate) * 0.72) { if (e.member && ++e.rateViol > 40) { e.rateViol = 0; this.hooks?.suspicious?.(e.member, 'firerate', wid); } return; }
    e.lastFire[wid] = this.T; e.w = wid; e.lastShot = this.T;
    if (!Array.isArray(o) || !Array.isArray(d)) return;
    let ox = +o[0], oy = +o[1], oz = +o[2]; const eye = e.y + (e.crouch ? 1.15 : 1.6);
    if (!isFinite(ox + oy + oz) || Math.hypot(ox - e.x, oy - eye, oz - e.z) > 3.5) { ox = e.x; oy = eye; oz = e.z; }
    let dx = +d[0], dy = +d[1], dz = +d[2]; const dl = Math.hypot(dx, dy, dz); if (!dl || !isFinite(dl)) return; dx /= dl; dy /= dl; dz /= dl;
    sp = clamp(sp, 0.2, 3);
    if (def.kind === 'melee') return this.melee(e, def, ox, oy, oz, dx, dy, dz);
    if (def.kind === 'proj') return this.spawnProj(e, wid, def, ox, oy, oz, dx, dy, dz, seed, sp);
    this.hitscan(e, wid, def, ox, oy, oz, dx, dy, dz, seed, sp, e.isBot ? 0 : clamp(rtt + 0.1, 0.05, 0.4));
  }

  targetsFor(att, ago) {
    const out = [];
    for (const t of this.ents.values()) {
      if (t === att || !t.alive || !this.isEnemy(att, t)) continue;
      if (t.spawnInv > this.T && !this.settings.training) continue;
      const p = t.isBot ? { x: t.x, y: t.y, z: t.z, h: this.entHeight(t) } : this.rewindPos(t, ago);
      out.push({ e: t, x: p.x, y: p.y, z: p.z, h: p.h });
    }
    for (const dr of this.drones) if (dr.alive && (att.team < 0 ? dr.owner !== att : dr.team !== att.team) && dr.owner !== att) out.push({ e: dr, x: dr.x, y: dr.y - 0.3, z: dr.z, h: 0.7, drone: true });
    return out;
  }

  hitscan(att, wid, def, ox, oy, oz, dx, dy, dz, seed, sp, ago) {
    const n = def.pellets || 1;
    const dirs = spreadDirs([dx, dy, dz], def.spread * sp, n, seed);
    const targets = this.targetsFor(att, ago);
    const acc = new Map(); const ends = [];
    const w = this.world;
    for (const dir of dirs) {
      let tw = w.raycast(ox, oy, oz, dir[0], dir[1], dir[2], def.range);
      let nx = 0, ny = 1, nz = 0, kind = 0;
      if (tw < 0) tw = def.range; else { kind = 1; nx = w.rh.nx; ny = w.rh.ny; nz = w.rh.nz; }
      let bestT = tw, bestTg = null;
      for (const tg of targets) {
        const t = rayCylinder(ox, oy, oz, dir[0], dir[1], dir[2], tg.x, tg.z, R_BODY, tg.y, tg.y + tg.h);
        if (t >= 0 && t < bestT) { bestT = t; bestTg = tg; }
      }
      const px = ox + dir[0] * bestT, py = oy + dir[1] * bestT, pz = oz + dir[2] * bestT;
      if (bestTg) {
        kind = 2; nx = -dir[0]; ny = -dir[1]; nz = -dir[2];
        const head = py > bestTg.y + bestTg.h * 0.78;
        let dmg = def.dmg * (head ? def.hs : 1);
        const f = bestT / def.range;
        dmg *= def.cls === 'shotgun' ? clamp(1.35 - f * 1.5, 0.25, 1) : (1 - 0.3 * clamp((f - 0.5) * 2, 0, 1));
        if (att.isBot) dmg *= (DIFFS[att.diff] || DIFFS.normal).dmg;
        let a = acc.get(bestTg.e); if (!a) acc.set(bestTg.e, a = { dmg: 0, hs: false, x: px, y: py, z: pz });
        a.dmg += dmg; a.hs = a.hs || head; a.x = px; a.y = py; a.z = pz;
      }
      ends.push([r2(px), r2(py), r2(pz), kind, r2(nx), r2(ny), r2(nz)]);
    }
    for (const [t, a] of acc) {
      if (t.drone) { this.hurtDrone(t, a.dmg, att); continue; }
      const info = { w: wid, hs: a.hs, x: a.x, y: a.y, z: a.z, dist: Math.hypot(a.x - ox, a.z - oz) };
      if (def.kind === 'beam') { att.beamAcc[t.id] = (att.beamAcc[t.id] || 0) + a.dmg; att.beamInfo = info; this.damage(t, a.dmg, att, { ...info, silent: true }); }
      else this.damage(t, a.dmg, att, info);
    }
    this.emit({ k: 'shot', id: att.id, w: wid, o: [r2(ox), r2(oy), r2(oz)], e: ends.slice(0, 12) });
  }

  melee(att, def, ox, oy, oz, dx, dy, dz) {
    let best = null, bd = def.range + 0.5;
    for (const t of this.ents.values()) {
      if (t === att || !t.alive || !this.isEnemy(att, t) || t.spawnInv > this.T) continue;
      const cx = t.x - att.x, cz = t.z - att.z, cy = t.y + 1 - oy, dist = Math.hypot(cx, cz, cy);
      if (dist > def.range + 0.5 || Math.abs(cy) > 1.6) continue;
      const dot = (cx * dx + cy * dy + cz * dz) / dist;
      if (dot < 0.45) continue;
      if (dist < bd) { bd = dist; best = t; }
    }
    this.emit({ k: 'swing', id: att.id });
    if (best) this.damage(best, def.dmg * (att.isBot ? (DIFFS[att.diff] || DIFFS.normal).dmg : 1), att, { w: 'blade', x: best.x, y: best.y + 1.2, z: best.z, dist: bd });
  }

  // =============== Projektile ===============
  spawnProj(att, wid, def, ox, oy, oz, dx, dy, dz, seed, sp) {
    const pr = def.proj, d = spreadDirs([dx, dy, dz], def.spread * sp, 1, seed)[0];
    const p = { id: 'j' + (this.nextId++), type: pr.type, x: ox, y: oy, z: oz, vx: d[0] * pr.speed, vy: d[1] * pr.speed, vz: d[2] * pr.speed, grav: pr.grav || 0, owner: att, w: wid, dmg: def.dmg, splash: pr.splash, life: pr.life, t: 0, bounce: 0 };
    this.projs.push(p);
    this.emit({ k: 'proj', id: p.id, t: p.type, o: [r2(ox), r2(oy), r2(oz)], v: [r2(p.vx), r2(p.vy), r2(p.vz)], own: att.id, g: p.grav, w: wid });
  }
  onThrow(m, e, msg) { this.throwItem(e, msg.t, msg.o, msg.d); }
  throwItem(e, kind, o, d) {
    if (!e.alive || this.state !== 'playing') return;
    const th = THROWABLES[kind]; if (!th || (e.cons[kind] | 0) <= 0) return;
    if (this.T - (e.lastThrow || -9) < 0.5) return; e.lastThrow = this.T;
    e.cons[kind]--; if (this.settings.training) e.cons[kind] = Math.max(e.cons[kind], 3);
    let ox = +o[0], oy = +o[1], oz = +o[2]; if (!isFinite(ox + oy + oz) || Math.hypot(ox - e.x, oz - e.z) > 3.5) { ox = e.x; oy = e.y + 1.6; oz = e.z; }
    let dx = +d[0], dy = +d[1], dz = +d[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const p = { id: 'j' + (this.nextId++), type: kind, x: ox, y: oy, z: oz, vx: dx * th.speed, vy: dy * th.speed + 3.5, vz: dz * th.speed, grav: 22, owner: e, w: kind, dmg: th.dmg, splash: th.splash, life: th.fuse, t: 0, bounce: th.bounce, rest: false };
    this.projs.push(p);
    this.emit({ k: 'proj', id: p.id, t: kind, o: [r2(ox), r2(oy), r2(oz)], v: [r2(p.vx), r2(p.vy), r2(p.vz)], own: e.id, g: p.grav, w: kind, fuse: th.fuse });
    this.sendInv(e);
  }
  stepProjs(dt) {
    const w = this.world;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.t += dt;
      const grenadey = p.type === 'grenade' || p.type === 'smoke';
      if (grenadey && p.t >= p.life) { this.detonate(p, p.x, p.y, p.z, null); this.projs.splice(i, 1); continue; }
      if (!grenadey && p.t >= p.life) { this.detonate(p, p.x, p.y, p.z, null); this.projs.splice(i, 1); continue; }
      if (p.rest) continue;
      p.vy -= p.grav * dt;
      const ox = p.x, oy = p.y, oz = p.z, mx = p.vx * dt, my = p.vy * dt, mz = p.vz * dt, len = Math.hypot(mx, my, mz) || 1e-6;
      const ddx = mx / len, ddy = my / len, ddz = mz / len;
      let tw = w.raycast(ox, oy, oz, ddx, ddy, ddz, len + (grenadey ? 0.12 : 0));
      let tHit = tw >= 0 ? tw : len + 1, nrm = tw >= 0 ? [w.rh.nx, w.rh.ny, w.rh.nz] : null, hitEnt = null;
      if (!grenadey) {
        for (const t of this.ents.values()) {
          if (!t.alive || (t === p.owner && p.t < 0.15) || !this.isEnemy(p.owner, t) && t !== p.owner) continue;
          if (t === p.owner) continue;
          const tt = rayCylinder(ox, oy, oz, ddx, ddy, ddz, t.x, t.z, R_BODY + 0.1, t.y, t.y + this.entHeight(t));
          if (tt >= 0 && tt < tHit && tt <= len) { tHit = tt; hitEnt = t; nrm = null; }
        }
      }
      if (tHit <= len + (grenadey ? 0.12 : 0) && (hitEnt || nrm)) {
        if (grenadey) {
          p.x = ox + ddx * Math.max(0, tHit - 0.05); p.y = oy + ddy * Math.max(0, tHit - 0.05); p.z = oz + ddz * Math.max(0, tHit - 0.05);
          const vn = p.vx * nrm[0] + p.vy * nrm[1] + p.vz * nrm[2];
          p.vx = (p.vx - 2 * vn * nrm[0]) * p.bounce; p.vy = (p.vy - 2 * vn * nrm[1]) * p.bounce; p.vz = (p.vz - 2 * vn * nrm[2]) * p.bounce;
          if (nrm[1] > 0.6 && Math.hypot(p.vx, p.vy, p.vz) < 2.4) { p.rest = true; p.vx = p.vy = p.vz = 0; this.emit({ k: 'prest', id: p.id, p: [r2(p.x), r2(p.y), r2(p.z)] }); }
          else this.emit({ k: 'pbounce', id: p.id, p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(p.vx), r2(p.vy), r2(p.vz)] });
        } else {
          const hx = ox + ddx * tHit, hy = oy + ddy * tHit, hz = oz + ddz * tHit;
          this.detonate(p, hx - (nrm ? ddx * 0.2 : 0), hy - (nrm ? ddy * 0.2 : 0), hz - (nrm ? ddz * 0.2 : 0), hitEnt);
          this.projs.splice(i, 1);
        }
        continue;
      }
      p.x += mx; p.y += my; p.z += mz;
      if (p.y < -40) this.projs.splice(i, 1);
    }
  }
  detonate(p, x, y, z, directEnt) {
    const kind = p.type;
    if (kind === 'smoke') {
      const th = THROWABLES.smoke; this.smokes.push({ x, y, z, r: th.smokeRadius, until: this.T + th.smokeTime });
      this.emit({ k: 'smoke', p: [r2(x), r2(y), r2(z)], r: th.smokeRadius, t: th.smokeTime, id: p.id }); return;
    }
    const r = kind === 'plasma' ? 2.0 : p.splash;
    const dmgCenter = kind === 'plasma' ? p.dmg * 0.55 : p.dmg;
    this.emit({ k: 'boom', id: p.id, p: [r2(x), r2(y), r2(z)], r, t: kind });
    if (directEnt && kind === 'plasma') this.damage(directEnt, p.dmg, p.owner, { w: p.w, x, y, z, dist: 0 });
    for (const t of this.ents.values()) {
      if (!t.alive || (t === directEnt && kind === 'plasma')) continue;
      const own = t === p.owner;
      if (!own && !this.isEnemy(p.owner, t)) continue;
      const cx = t.x, cy = t.y + 0.95, cz = t.z, d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > r + 0.4) continue;
      if (!this.world.los(x, y + 0.2, z, cx, cy, cz) && d > 1.2) continue;
      const f = clamp(1 - d / (r + 0.4), 0.12, 1);
      let dmg = dmgCenter * f * (own ? 0.5 : 1) * (directEnt === t && kind === 'rocket' ? 1.0 : 1);
      if (p.owner.isBot) dmg *= (DIFFS[p.owner.diff] || DIFFS.normal).dmg;
      const kb = kind === 'plasma' ? 0 : (own ? 15 : 11) * f;
      const dirx = (cx - x) / (d || 1), diry = (cy - y) / (d || 1) + 0.35, dirz = (cz - z) / (d || 1);
      this.damage(t, dmg, p.owner, { w: p.w, x: cx, y: cy, z: cz, dist: Math.hypot(p.owner.x - x, p.owner.z - z), expl: true, kb: kb ? [r2(dirx * kb), r2(diry * kb), r2(dirz * kb)] : null });
    }
    for (const dr of this.drones) if (dr.alive && Math.hypot(dr.x - x, dr.y - y, dr.z - z) < r && (dr.owner !== p.owner && (p.owner.team < 0 || dr.team !== p.owner.team))) this.hurtDrone(dr, dmgCenter, p.owner);
  }

  // =============== Schaden ===============
  damage(v, amt, att, info = {}) {
    if (!v.alive || this.state === 'ended' || this.state === 'countdown') return 0;
    if (v.spawnInv > this.T && info.w !== 'fall' && !this.settings.training) return 0;
    if (v.dcInvuln && info.w !== 'fall') return 0;
    if (v.dummy && info.w === 'fall') return 0;
    if (v.mv && info.w !== 'fall') v.mv.hurtUntil = this.T + 1.2;   // Rückstoß/Explosion erlaubt kurz höheres Tempo
    amt = Math.max(0, amt); let rem = amt;
    if (v.barrierUntil > this.T && v.barrier > 0) { const ab = Math.min(v.barrier, rem); v.barrier -= ab; rem -= ab; if (v.barrier <= 0) { v.barrierUntil = 0; this.sendInv(v); } }
    const sd = Math.min(v.shield, rem); v.shield -= sd; rem -= sd; v.hp -= rem;
    if (att && att !== v) { att.dmgDealt += amt; v.lastDmgFrom = att.id; v.assists[att.id] = this.T; }
    const dead = v.hp <= 0;
    if (!info.silent || dead) this.emit({ k: 'hit', v: v.id, a: att ? att.id : null, d: Math.round(amt), hs: info.hs ? 1 : 0, p: [r2(info.x ?? v.x), r2(info.y ?? v.y + 1.2), r2(info.z ?? v.z)], kb: info.kb || null, sh: sd > 0 && rem <= 0 ? 1 : 0, w: info.w });
    if (v.isBot && att && !dead) this.bots.onHurt(v, att);
    if (dead) this.kill(v, att, info);
    return amt;
  }
  kill(v, att, info) {
    v.alive = false; v.hp = 0; v.deaths++; v.fl = FL.DEAD; v.streak0 = v.streak; v.streak = 0;
    const self = !att || att === v;
    const S = this.settings;
    if (!self && !S.training) {
      att.kills++; att.score++; att.streak++; att.best = Math.max(att.best, att.streak); if (info.hs) att.hs++;
      if (att.member) this.sendInv(att);
    }
    if (v.dummy) { v.respawnAt = this.T + 2.2; }
    else v.respawnAt = this.T + (S.training ? 1.2 : 3.8);
    if (self && !S.training && att && info.w !== 'fall') att.score = Math.max(0, att.score - 0); // Selbstmord: kein Punkt
    this.emit({ k: 'kill', v: v.id, a: self ? null : att.id, w: info.w, hs: info.hs ? 1 : 0, dist: Math.round(info.dist || 0), streak: self ? 0 : att.streak, vs: v.streak0, ex: info.expl ? 1 : 0 });
    // Loot
    if (!v.dummy && !S.training) {
      const drop = [...v.owned].reverse().find(w => w !== 'viper' && w !== 'blade');
      if (drop) this.addDyn('weapon', drop, v.x, v.y + 0.3, v.z, 70);
      if (this.rng() < 0.6) this.addDyn('cons', this.rng() < 0.5 ? 'medkit' : 'shieldpot', v.x + 0.6, v.y + 0.3, v.z + 0.4, 50);
    }
    if (v.cons.grenade > 0 && !S.training && this.rng() < 0.4) this.addDyn('cons', 'grenade', v.x - 0.6, v.y + 0.3, v.z - 0.4, 50);
    if (v.isBot) this.bots.onDeath(v);
    if (S.training && !self) { /* keine Wertung */ }
    this.checkEnd();
  }

  scores() {
    const mode = MODES[this.settings.mode];
    if (mode.teams) { const t = new Array(mode.teams).fill(0); for (const e of this.ents.values()) if (e.team >= 0) t[e.team] += e.kills; return { t }; }
    return { t: null };
  }
  checkEnd() {
    if (this.state !== 'playing' || this.settings.training) return;
    const mode = MODES[this.settings.mode], lim = this.scoreLimit;
    if (mode.teams) { const t = this.scores().t; if (t.some(v => v >= lim)) this.endMatch(); }
    else { for (const e of this.ents.values()) if (e.kills >= lim) { this.endMatch(); break; } }
  }
  endMatch() {
    if (this.state === 'ended') return;
    this.state = 'ended'; this.endAt = this.T;
    const mode = MODES[this.settings.mode];
    const ents = [...this.ents.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let winnerTeam = -1, winnerId = null;
    if (mode.teams) { const t = this.scores().t; const mx = Math.max(...t); const lead = t.filter(v => v === mx).length === 1 ? t.indexOf(mx) : -1; winnerTeam = lead; }
    else if (ents.length) winnerId = ents[0].id;
    const board = ents.map(e => ({ id: e.id, name: e.name, team: e.team, bot: e.isBot ? 1 : 0, k: e.kills, d: e.deaths, hs: e.hs, dmg: Math.round(e.dmgDealt), best: e.best, chests: e.chests, shards: e.shardSet.size }));
    this.emit({ k: 'end', winTeam: winnerTeam, winId: winnerId, board });
    this.flush(true);
    if (this.hooks?.matchEnd && !this.settings.training) {
      const botsPresent = [...this.ents.values()].some(e => e.isBot);   // Ranked zählt nur in reinen Spieler-Matches
      const humans = [...this.ents.values()].filter(e => !e.isBot).length, secs = this.T - (this.matchStart || 0);
      const results = [...this.ents.values()].filter(e => e.member && e.member.userId).map(e => ({ member: e.member, userId: e.member.userId, kills: e.kills, deaths: e.deaths, hs: e.hs, dmg: e.dmgDealt, won: mode.teams ? e.team === winnerTeam : e.id === winnerId, team: mode.teams ? e.team : -1, draw: !!mode.teams && winnerTeam < 0, secs, humans, ranked: !!this.settings.ranked && !botsPresent }));
      try { this.hooks.matchEnd(this, this.matchId, results); } catch (err) { console.error('[room] matchEnd-Hook', err); }
    }
  }

  // =============== Pickups ===============
  addDyn(kind, item, x, y, z, ttl = 60, n = 0) {
    const d = { id: 'd' + (this.nextId++), kind, item, x, y, z, ttl: this.T + ttl, n, dyn: true, on: true };
    this.dyn.push(d); this.emit({ k: 'drop', p: this.dynInfo(d) }); return d;
  }
  dynInfo(d) { return { id: d.id, kind: d.kind, item: d.item, x: r2(d.x), y: r2(d.y), z: r2(d.z) }; }
  tryPickup(e, p) {
    const m = e.member;
    switch (p.kind) {
      case 'weapon': {
        const def = WEAPONS[p.item]; if (!def) return false;
        if (e.owned.includes(p.item)) { if (!m || !def.ammo) return false; this.send(m, { k: 'give', kind: 'ammo', item: def.ammo, n: Math.round((AMMO_GIVE[def.ammo] || 30) * 0.6) }); return true; }
        if (e.owned.length >= MAX_WEAPONS && !e.isBot) return false;   // Inventar voll: nur bewusst tauschen (E) oder vorher droppen (V)
        if (e.owned.length >= MAX_WEAPONS) {
          const idx = e.owned.indexOf(e.w) > 1 ? e.owned.indexOf(e.w) : e.owned.length - 1;
          const old = e.owned[idx]; if (old === 'blade' || old === 'viper') return false;
          e.owned[idx] = p.item; if (e.isBot === false) this.addDyn('weapon', old, e.x, e.y + 0.3, e.z, 40);
        } else e.owned.push(p.item);
        if (m) { this.send(m, { k: 'give', kind: 'weapon', item: p.item, n: AMMO_GIVE[def.ammo] ?? 0 }); }
        if (e.isBot) this.bots.onWeapon(e, p.item);
        this.sendInv(e); return true;
      }
      case 'ammo': if (m) this.send(m, { k: 'give', kind: 'ammo', item: p.item, n: AMMO_GIVE[p.item] || 30 }); return !!m || e.isBot;
      case 'cons': { const c = CONSUMABLES[p.item]; if (!c || (e.cons[p.item] | 0) >= c.max) return false; e.cons[p.item] = (e.cons[p.item] | 0) + 1; this.sendInv(e); return true; }
      case 'power': {
        const pw = POWERUPS[p.item]; if (!pw) return false;
        if (p.item === 'barrier') { e.barrier = pw.absorb; e.barrierUntil = this.T + pw.dur; } else e.power[p.item] = this.T + pw.dur;
        this.sendInv(e); this.emit({ k: 'powerfx', id: e.id, t: p.item }); return true;
      }
      case 'gadget': if (!GADGETS[p.item] || e.gadget === p.item) return false; if (e.gadget && !e.isBot) return false; e.gadget = p.item; this.sendInv(e); return true;
      case 'shard': if (!m || e.shardSet.has(p.id)) return false; e.shardSet.add(p.id); this.send(m, { k: 'shard', id: p.id, n: e.shardSet.size }); return 'private';
    }
    return false;
  }
  stepPickups() {
    const T = this.T;
    for (const p of this.pickups) if (!p.on && p.next && T >= p.next && p.kind !== 'shard') { p.on = true; this.emit({ k: 'pickr', id: p.id }); }
    for (let i = this.dyn.length - 1; i >= 0; i--) if (T > this.dyn[i].ttl) { this.emit({ k: 'pick', id: this.dyn[i].id, by: null }); this.dyn.splice(i, 1); }
    for (const e of this.ents.values()) {
      if (!e.alive || e.dummy) continue;
      for (const p of this.pickups) {
        if (p.kind !== 'shard' && !p.on) continue;
        if (Math.abs(p.x - e.x) > 1.7 || Math.abs(p.z - e.z) > 1.7 || Math.abs(p.y - e.y) > 2.4) continue;
        if (p.kind === 'shard' && e.isBot) continue;
        const r = this.tryPickup(e, p);
        if (!r) continue;
        if (r === 'private') { if (e.member) this.send(e.member, { k: 'pick', id: p.id, by: e.id, me: 1 }); continue; }
        p.on = false; p.next = T + (p.respawn || 30);
        this.emit({ k: 'pick', id: p.id, by: e.id });
      }
      for (let i = this.dyn.length - 1; i >= 0; i--) {
        const d = this.dyn[i];
        if (Math.abs(d.x - e.x) > 1.7 || Math.abs(d.z - e.z) > 1.7 || Math.abs(d.y - e.y) > 2.6) continue;
        if (d.lock && d.lock.id === e.id && T < d.lock.until) continue;
        if (this.tryPickup(e, d)) { this.emit({ k: 'pick', id: d.id, by: e.id }); this.dyn.splice(i, 1); }
      }
    }
  }

  // =============== Waffen droppen / tauschen ===============
  dropLocked(kind, item, e, ttl = 60) { const d = this.addDyn(kind, item, e.x, e.y + 0.3, e.z, ttl); d.lock = { id: e.id, until: this.T + 3 }; return d; }
  dropWeapon(e) {
    if (!e.alive) return;
    const w = e.w; if (!w || w === 'viper' || w === 'blade' || !e.owned.includes(w)) return;
    e.owned = e.owned.filter(x => x !== w); e.w = 'viper'; this.dropLocked('weapon', w, e); this.sendInv(e, 'viper');
  }
  // E bei vollem Inventar: Waffe (oder Gadget) vom Boden gegen die aktuelle tauschen; die alte landet am Boden und wird nicht sofort wieder aufgehoben
  swapPickup(e, id) {
    const st = this.pickups.find(p => p.id === id && p.on), dy = this.dyn.find(d => d.id === id), p = st || dy; if (!p || (p.kind !== 'weapon' && p.kind !== 'gadget')) return;
    if (Math.abs(p.x - e.x) > 2.0 || Math.abs(p.z - e.z) > 2.0 || Math.abs(p.y - e.y) > 2.8) return;
    if (p.kind === 'weapon') {
      const def = WEAPONS[p.item]; if (!def || e.owned.includes(p.item)) return;
      if (e.owned.length < MAX_WEAPONS) { if (!this.tryPickup(e, p)) return; }
      else {
        const drops = e.owned.map((w, i) => [w, i]).filter(([w]) => w !== 'viper' && w !== 'blade'); if (!drops.length) return;
        const cur = drops.find(([w]) => w === e.w) || drops[drops.length - 1], [old, idx] = cur;
        e.owned[idx] = p.item; e.w = p.item; this.dropLocked('weapon', old, e, 60);
        if (e.member) this.send(e.member, { k: 'give', kind: 'weapon', item: p.item, n: AMMO_GIVE[def.ammo] ?? 0 }); this.sendInv(e, p.item);
      }
    } else {
      if (!GADGETS[p.item] || e.gadget === p.item) return; const old = e.gadget; e.gadget = p.item; if (old) this.dropLocked('gadget', old, e, 60); this.sendInv(e);
    }
    if (st) { st.on = false; st.next = this.T + (st.respawn || 30); } else this.dyn.splice(this.dyn.indexOf(dy), 1);
    this.emit({ k: 'pick', id: p.id, by: e.id });
  }

  // =============== Interaktionen ===============
  setDoor(d, open) { d.open = open; if (d.col) d.col.on = !open; }
  onInteract(m, e, msg) {
    if (!e.alive) return;
    if (msg.t === 'swap') return this.swapPickup(e, String(msg.id));
    if (msg.t === 'chest') {
      const c = this.map.chests.find(c => c.id === msg.id), st = this.chestState.get(msg.id); if (!c || !st || st.open) return;
      if (Math.hypot(c.x - e.x, c.z - e.z) > 4 || Math.abs(c.y - e.y) > 3) return;
      st.open = true; st.until = this.T + 150; e.chests++;
      this.emit({ k: 'iact', t: 'chest', id: c.id, st: 1, by: e.id });
      const tier = c.tier, loot = [];
      const pick = (arr) => arr[Math.floor(this.rng() * arr.length) % arr.length];
      const n = tier === 1 ? 2 : tier === 2 ? 3 : 4;
      for (let i = 0; i < n; i++) loot.push(tier === 3 && i < 2 ? pick(LOOT.t3) : tier === 2 && i === 0 ? pick(LOOT.t2) : pick(i === 0 ? LOOT['t' + tier] : LOOT.t1));
      loot.push(['ammo', pick(['light', 'energy', 'sniper', 'shells'])]);
      loot.forEach(([kind, item], i) => { const a = (i / loot.length) * 6.28 + c.ry; this.addDyn(kind, item, c.x + Math.cos(a) * 1.5, c.y + 0.4, c.z + Math.sin(a) * 1.5, 90); });
      if (m) this.send(m, { k: 'chestopen', id: c.id, tier });
    } else if (msg.t === 'switch') {
      const s = this.map.switches.find(s => s.id === msg.id), st = this.switchState.get(msg.id); if (!s || !st) return;
      if (Math.hypot(s.x - e.x, s.z - e.z) > 3.5 || Math.abs(s.y - e.y) > 3) return;
      if (s.once && st.on) return;
      st.on = !st.on;
      this.emit({ k: 'iact', t: 'switch', id: s.id, st: st.on ? 1 : 0, by: e.id });
      for (const did of s.targets) { const d = this.doorsById.get(did); if (d) { d.locked = false; this.setDoor(d, st.on); this.emit({ k: 'iact', t: 'door', id: d.id, st: d.open ? 1 : 0, lk: 0 }); } }
      if (s.event === 'lowgrav') { this.lowgravUntil = this.T + 25; this.emit({ k: 'lowgrav', until: this.lowgravUntil, by: e.id }); st.on = false; }
      if (s.event === 'power') { if (m) this.send(m, { k: 'achv', id: 'vault' }); this.emit({ k: 'toast', text: e.name + ' hat den Strom eingeschaltet – der Tresor öffnet sich!' }); }
    } else if (msg.t === 'door') {
      const d = this.doorsById.get(msg.id); if (!d || d.locked) return;
      if (Math.hypot(d.x - e.x, d.z - e.z) > 6) return;
      this.setDoor(d, !d.open); this.emit({ k: 'iact', t: 'door', id: d.id, st: d.open ? 1 : 0 });
    } else if (msg.t === 'duck') {
      const sp = this.map.secrets.find(s => s.id === 'duck'); if (!sp || e.duck || Math.hypot(sp.x - e.x, sp.z - e.z) > 3 || Math.abs(sp.y - e.y) > 3) return;
      e.duck = true; if (m) this.send(m, { k: 'achv', id: 'duck' });
    }
  }
  onUse(m, e, msg) {
    if (!e.alive || this.state !== 'playing' || this.T - e.lastUse < 0.8) return;
    if (msg.t === 'medkit' && e.cons.medkit > 0 && e.hp < 100) { e.cons.medkit--; e.hp = Math.min(100, e.hp + CONSUMABLES.medkit.heal); e.lastUse = this.T; this.emit({ k: 'usefx', id: e.id, t: 'medkit' }); this.sendInv(e); if (this.settings.training) e.cons.medkit = 4; }
    else if (msg.t === 'shieldpot' && e.cons.shieldpot > 0 && e.shield < 100) { e.cons.shieldpot--; e.shield = Math.min(100, e.shield + CONSUMABLES.shieldpot.shield); e.lastUse = this.T; this.emit({ k: 'usefx', id: e.id, t: 'shieldpot' }); this.sendInv(e); if (this.settings.training) e.cons.shieldpot = 4; }
  }
  onGadget(m, e, msg) {
    if (!e.alive || this.state !== 'playing' || !e.gadget) return;
    const g = GADGETS[e.gadget], now = this.T;
    if ((e.gadCd[e.gadget] || 0) > now && msg.t !== 'teleback') return;
    if (e.gadget === 'grapple' && msg.t === 'hook') { e.gadCd.grapple = now + g.cd; this.emit({ k: 'gad', id: e.id, t: 'grapple', p: [r2(+msg.p[0]), r2(+msg.p[1]), r2(+msg.p[2])] }); }
    else if (e.gadget === 'teleporter' && (msg.t === 'tele' || msg.t === 'teleback')) {
      const mv = e.mv || (this.allowTp(e, e.x, e.y, e.z, 1, 0.1), e.mv);
      if (msg.t === 'tele') { const p = (msg.p || []).map(Number); if (p.length === 3 && p.every(isFinite) && Math.hypot(p[0] - e.x, p[2] - e.z) < 6 && Math.abs(p[1] - e.y) < 6) mv.beacon = { x: p[0], y: p[1], z: p[2] }; else return; }
      else { if (!mv.beacon) return; this.allowTp(e, mv.beacon.x, mv.beacon.y, mv.beacon.z, 3.5, 3); mv.beacon = null; }
      if (msg.t === 'teleback') e.gadCd.teleporter = now + g.cd; this.emit({ k: 'gad', id: e.id, t: msg.t, p: [r2(+msg.p[0]), r2(+msg.p[1]), r2(+msg.p[2])] }); }
    else if (e.gadget === 'scanner' && msg.t === 'scan') {
      e.gadCd.scanner = now + g.cd;
      const list = []; for (const t of this.ents.values()) if (t !== e && t.alive && this.isEnemy(e, t) && Math.hypot(t.x - e.x, t.z - e.z) < 48) list.push(t.id);
      this.emit({ k: 'gad', id: e.id, t: 'scan', p: [r2(e.x), r2(e.y), r2(e.z)] });
      if (m) this.send(m, { k: 'scan', ids: list, dur: 5 });
    } else if (e.gadget === 'drone' && msg.t === 'drone') {
      e.gadCd.drone = now + g.cd;
      this.drones = this.drones.filter(d => d.owner !== e);
      const dr = { id: 'x' + (this.nextId++), owner: e, team: e.team, x: e.x, y: e.y + 2.5, z: e.z, hp: 45, alive: true, until: now + 20, fireAt: 0 };
      this.drones.push(dr); this.emit({ k: 'drone', id: dr.id, own: e.id });
    } else if (e.gadget === 'jetpack' || e.gadget === 'grapple') { /* clientseitig */ }
  }
  hurtDrone(dr, dmg, att) { dr.hp -= dmg; if (dr.hp <= 0 && dr.alive) { dr.alive = false; this.emit({ k: 'droneboom', id: dr.id, p: [r2(dr.x), r2(dr.y), r2(dr.z)] }); } }
  stepDrones(dt) {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      if (!d.alive || this.T > d.until || !d.owner.alive) { if (d.alive) this.emit({ k: 'droneboom', id: d.id, p: [r2(d.x), r2(d.y), r2(d.z)] }); this.drones.splice(i, 1); continue; }
      const o = d.owner, a = this.T * 0.8, tx = o.x + Math.cos(a) * 2.2, ty = o.y + 2.6 + Math.sin(this.T * 2) * 0.2, tz = o.z + Math.sin(a) * 2.2;
      d.x += (tx - d.x) * Math.min(1, dt * 3); d.y += (ty - d.y) * Math.min(1, dt * 3); d.z += (tz - d.z) * Math.min(1, dt * 3);
      if (this.T >= d.fireAt) {
        let best = null, bd = 24;
        for (const t of this.ents.values()) { if (!t.alive || !this.isEnemy(o, t) || t.spawnInv > this.T) continue; const dist = Math.hypot(t.x - d.x, t.y + 1 - d.y, t.z - d.z); if (dist < bd && this.world.los(d.x, d.y, d.z, t.x, t.y + 1.2, t.z)) { bd = dist; best = t; } }
        if (best) {
          d.fireAt = this.T + 0.38; d.target = best.id;
          const dir = [best.x - d.x, best.y + 1.1 - d.y, best.z - d.z]; const l = Math.hypot(...dir); const dn = dir.map(v => v / l + (this.rng() - 0.5) * 0.05);
          this.emit({ k: 'shot', id: d.id, w: 'drone', o: [r2(d.x), r2(d.y), r2(d.z)], e: [[r2(best.x), r2(best.y + 1.1), r2(best.z), 2, 0, 1, 0]] });
          if (this.rng() < 0.8) this.damage(best, 7, o, { w: 'drone', x: best.x, y: best.y + 1.1, z: best.z, dist: bd });
        }
      }
    }
  }

  // =============== Tick ===============
  tick() {
    const now = Date.now(); let dt = (now - this.last) / 1000; this.last = now; dt = Math.min(dt, 0.1);
    if (this.state === 'lobby') { this.lobbyHousekeeping(); return; }
    this.T += dt; this.tickN++;
    const T = this.T;
    // Disconnect-Cleanup
    for (const m of [...this.members.values()]) if (!m.connected && m.dcAt && T - m.dcAt > 45) this.removeMember(m, true);
    if (this.state === 'countdown' && T >= this.startAt) { this.state = 'playing'; this.matchStart = T; this.emit({ k: 'go' }); }
    // Movers
    for (const mv of this.map.movers) { const y = moverY(mv, T); mv.col.y0 = y; mv.col.y1 = y + mv.th; }
    // Türen (automatisch)
    for (const d of this.map.doors) {
      if (!d.auto || d.locked) continue;
      let near = false;
      for (const e of this.ents.values()) if (e.alive && Math.abs(e.x - d.x) < d.w / 2 + 4 && Math.abs(e.z - d.z) < d.d / 2 + 4 && Math.abs(e.y - d.y) < 4) { near = true; break; }
      if (near) d.closeAt = T + 2.2;
      if (near && !d.open) { this.setDoor(d, true); this.emit({ k: 'iact', t: 'door', id: d.id, st: 1 }); }
      else if (!near && d.open && T > (d.closeAt || 0)) { this.setDoor(d, false); this.emit({ k: 'iact', t: 'door', id: d.id, st: 0 }); }
    }
    // Respawns, Power-Ups
    for (const e of this.ents.values()) {
      if (!e.alive && e.respawnAt && T >= e.respawnAt && this.state !== 'ended') { e.respawnAt = 0; this.spawnEnt(e); }
      if (e.alive) {
        let fl = e.isBot ? e.fl : (e.clientFl || 0);
        if (e.power.speed > T) fl |= FL.SPD; if (e.power.jump > T) fl |= FL.JMP; if (e.barrierUntil > T) fl |= FL.BAR; if (e.spawnInv > T) fl |= FL.INVULN;
        e.fl = fl;
        { let ch = false; for (const k of Object.keys(e.power)) if (e.power[k] < T) { delete e.power[k]; ch = true; } if (ch) this.sendInv(e); }
        if (e.barrierUntil && e.barrierUntil < T) { e.barrierUntil = 0; e.barrier = 0; this.sendInv(e); }
      } else e.fl = FL.DEAD;
      // Laser-Aggregation
      if (this.T - e.beamT > 0.22) { e.beamT = this.T; for (const [vid, sum] of Object.entries(e.beamAcc)) { const v = this.ents.get(vid); if (v && sum > 0) this.emit({ k: 'hit', v: vid, a: e.id, d: Math.round(sum), hs: 0, p: [r2(v.x), r2(v.y + 1.2), r2(v.z)], kb: null, sh: 0, w: 'lancer', agg: 1 }); } e.beamAcc = {}; }
    }
    if (this.state === 'playing') this.bots.update(dt);
    if (this.state === 'playing') { this.stepProjs(dt); this.stepDrones(dt); }
    this.smokes = this.smokes.filter(s => s.until > T);
    if (this.tickN % 4 === 0) this.stepPickups();
    // Chests respawn
    for (const [id, c] of this.chestState) if (c.open && T > c.until && this.state === 'playing') { c.open = false; this.emit({ k: 'iact', t: 'chest', id, st: 0 }); }
    // Verlauf für Lag-Compensation
    for (const e of this.ents.values()) { if (!e.alive) continue; e.hist.push({ t: T, x: e.x, y: e.y, z: e.z, h: this.entHeight(e) }); if (e.hist.length > 24) e.hist.shift(); }
    // Supply Drops
    if (this.state === 'playing' && !this.settings.training && !this.map.noSupply && T >= this.nextSupply) { this.nextSupply = T + 85; this.supplyDrop(); }
    for (let i = this.supplies.length - 1; i >= 0; i--) { const s = this.supplies[i]; if (T >= s.land) { this.supplyLand(s); this.supplies.splice(i, 1); } }
    // Uhr / Matchende
    if (this.state === 'playing' && !this.settings.training) {
      const left = this.timeLimit - (T - this.matchStart);
      if (T - this.lastClock >= 1) { this.lastClock = T; this.emit({ k: 'clock', left: Math.max(0, Math.ceil(left)), sc: this.scores().t, ents: [...this.ents.values()].map(e => [e.id, e.kills, e.deaths, e.team]) }); }
      if (left <= 0) this.endMatch();
    } else if (this.state === 'playing' && T - this.lastClock >= 1) { this.lastClock = T; this.emit({ k: 'clock', left: 0, sc: null, ents: [...this.ents.values()].map(e => [e.id, e.kills, e.deaths, e.team]) }); }
    if (this.state === 'ended' && T - this.endAt > 14) { this.toLobby(); return; }
    if (this.tickN % NET.snapEvery === 0) this.flush(false);
  }
  lobbyHousekeeping() {
    for (const m of [...this.members.values()]) if (!m.connected && Date.now() - m.lastSeen > 20000) this.removeMember(m, true);
  }
  supplyDrop() {
    const sp = this.surfaceSpawns[Math.floor(this.rng() * this.surfaceSpawns.length)]; if (!sp) return;
    const s = { id: 's' + (this.nextId++), x: sp.x, z: sp.z, y: sp.y, land: this.T + 9 };
    this.supplies.push(s); this.emit({ k: 'supply', id: s.id, x: s.x, y: s.y, z: s.z, fall: 9 });
  }
  supplyLand(s) {
    const picks = [['weapon', this.pickArr(['stormcaller', 'longshot', 'lancer', 'pulse', 'marksman'])], ['power', 'barrier'], ['cons', 'medkit'], ['cons', 'shieldpot'], ['gadget', this.pickArr(['jetpack', 'drone', 'grapple'])], ['ammo', 'energy']];
    picks.forEach(([k, i], n) => { const a = n * 1.05; this.addDyn(k, i, s.x + Math.cos(a) * 1.8, s.y + 0.4, s.z + Math.sin(a) * 1.8, 100); });
    this.emit({ k: 'supplyland', id: s.id, x: s.x, y: s.y, z: s.z });
  }
  pickArr(a) { return a[Math.floor(this.rng() * a.length)]; }

  // ---- Snapshot-Versand mit Interest Management ----
  // Pro Empfänger: nahe Entitäten mit voller Rate, ferne seltener; unveränderte Entitäten werden übersprungen;
  // positionsbezogene Events nur für Spieler in Reichweite. Eigene Daten, Teammitglieder und Tote kommen immer durch.
  evPos(ev) {
    const p = ev.p || ev.o; if (Array.isArray(p)) return p;
    if (ev.id) { const e = this.ents.get(ev.id); if (e) return [e.x, e.y, e.z]; }
    return null;
  }
  flush(force) {
    if (!this.ev.length && !force && this.state === 'lobby') return;
    this.snapN = (this.snapN || 0) + 1; const n = this.snapN;
    const rows = new Map();
    for (const e of this.ents.values()) rows.set(e.id, [e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.pitch), e.fl | (e.alive ? 0 : FL.DEAD), e.w, Math.ceil(e.hp), Math.ceil(e.shield)]);
    const drones = this.drones.map(d => [d.id, r2(d.x), r2(d.y), r2(d.z), d.owner.id, d.team]);
    const T = r2(this.T);
    const evs = this.ev.map(ev => ({ ev, pos: GLOBAL_EV.has(ev.k) ? null : this.evPos(ev) }));
    this.ev = [];
    for (const m of this.members.values()) {
      if (!m.connected || !m.client) continue;
      const me = m.ent, list = [], sent = m.sent || (m.sent = new Map());
      for (const e of this.ents.values()) {
        const row = rows.get(e.id);
        if (!me || e === me || !me.alive) { list.push(row); continue; }
        const d = Math.hypot(e.x - me.x, e.z - me.z), ally = me.team >= 0 && e.team === me.team;
        const every = d < 55 ? 1 : d < 120 ? 2 : d < 220 ? 4 : 8;
        const last = sent.get(e.id);
        const changed = !last || last[0] !== row[6] || last[1] !== row[7] || last[2] !== row[8] || last[3] !== row[9];
        const moved = !last || Math.abs(last[4] - row[1]) + Math.abs(last[5] - row[3]) > 0.02 || Math.abs(last[6] - row[4]) > 0.01 || Math.abs(last[7] - row[5]) > 0.01 || Math.abs(last[8] - row[2]) > 0.02;
        const due = !last || n - last[9] >= (ally ? Math.min(every, 2) : every);
        if (changed || (due && (moved || n - last[9] >= 20))) { list.push(row); sent.set(e.id, [row[6], row[7], row[8], row[9], row[1], row[3], row[4], row[5], row[2], n]); }
      }
      for (const id of [...sent.keys()]) if (!this.ents.has(id)) sent.delete(id);
      const out = [];
      for (const { ev, pos } of evs) {
        if (!pos || !me) { out.push(ev); continue; }
        const inv = ev.v === me.id || ev.a === me.id || ev.id === me.id || ev.own === me.id;
        const rad = ev.k === 'boom' || ev.k === 'proj' || ev.k === 'shot' ? 230 : 140;
        if (inv || Math.hypot(pos[0] - me.x, pos[2] - me.z) < rad) out.push(ev);
      }
      m.client.send(JSON.stringify({ k: 'snap', T, e: list, d: drones, ev: out }), true);
    }
  }

  destroy() { this.members.clear(); this.ents.clear(); }
}
