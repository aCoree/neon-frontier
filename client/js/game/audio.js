// Komplett prozedurales Audio (WebAudio): Waffen, Explosionen, Schritte, UI, Musik, Umgebung. Keine Asset-Dateien nötig.
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

export class Audio {
  constructor() {
    this.ctx = null; this.vol = { master: 0.8, music: 0.5, sfx: 0.9, ambient: 0.6 }; this.musicMode = 'off'; this.voices = 0; this.lastStep = 0;
    this.listener = { x: 0, y: 0, z: 0 };
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = c.createGain(); this.sfx = c.createGain(); this.music = c.createGain(); this.amb = c.createGain();
    this.sfx.connect(this.comp); this.music.connect(this.comp); this.amb.connect(this.comp); this.comp.connect(this.master); this.master.connect(c.destination);
    // Hall (einfacher Feedback-Delay) für Waffen/Explosionen
    this.verb = c.createGain(); this.verb.gain.value = 0.25;
    const d1 = c.createDelay(0.5); d1.delayTime.value = 0.113; const d2 = c.createDelay(0.5); d2.delayTime.value = 0.171;
    const fb = c.createGain(); fb.gain.value = 0.38; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.verb.connect(d1); this.verb.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb); fb.connect(d1); fb.connect(d2); lp.connect(this.sfx);
    // Rauschpuffer
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.setVolumes(this.vol);
    this.startAmbient();
    if (this.wantMusic) this.musicStart(this.wantMusic);
  }
  setVolumes(v) { Object.assign(this.vol, v); if (!this.ctx) return; const t = this.ctx.currentTime; this.master.gain.setTargetAtTime(this.vol.master, t, 0.05); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05); this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05); this.amb.gain.setTargetAtTime(this.vol.ambient, t, 0.1); }
  get t() { return this.ctx.currentTime; }

  // ---------- Bausteine ----------
  out(pos, vol, pan) {
    const c = this.ctx; if (!pos) { const g = c.createGain(); g.gain.value = vol; g.connect(this.sfx); return g; }
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z, d = Math.hypot(dx, dy, dz);
    const att = 1 / (1 + Math.pow(Math.max(0, d - 4) / 22, 1.6));
    const g = c.createGain(); g.gain.value = vol * att;
    if (att < 0.01) return null;
    let node = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); const yaw = this.listener.yaw || 0;
      const rx = -dx * Math.cos(yaw) + dz * Math.sin(yaw); p.pan.value = Math.max(-0.9, Math.min(0.9, rx / Math.max(4, d))); g.connect(p); node = p;
    }
    if (d > 40) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(500, 8000 - d * 40); node.connect(lp); node = lp; }
    node.connect(this.sfx); return g;
  }
  noise(dur, o = {}) {
    if (this.voices > 60) return; const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; this.voices++;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.f || 2000; f.Q.value = o.q || 0.7;
    const g = c.createGain(); const t0 = this.t + (o.at || 0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.vol ?? 0.5, t0 + (o.atk || 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (o.f2) { f.frequency.setValueAtTime(o.f, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t0 + dur); }
    src.connect(f); f.connect(g); const dst = o.dst || this.sfx; g.connect(dst);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05); src.onended = () => { this.voices--; };
    return g;
  }
  tone(freq, dur, o = {}) {
    if (this.voices > 60) return; const c = this.ctx, osc = c.createOscillator(); this.voices++; osc.type = o.type || 'sine';
    const t0 = this.t + (o.at || 0); osc.frequency.setValueAtTime(freq, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
    if (o.vib) { const l = c.createOscillator(); l.frequency.value = o.vib; const lg = c.createGain(); lg.gain.value = freq * 0.04; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t0 + (o.atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.dst || this.sfx); osc.start(t0); osc.stop(t0 + dur + 0.05); osc.onended = () => { this.voices--; };
    return g;
  }
  at(pos, fn) { if (!this.ctx) return; const prev = this._dst; this._pos = pos; fn(); this._pos = null; }

  // ---------- Waffen ----------
  shot(kind, pos, own = false) {
    if (!this.ctx) return;
    const v = own ? 1 : 0.8, dst = this.out(pos, v); if (!dst) return;
    const N = (d, o) => this.noise(d, { ...o, dst }), T = (f, d, o) => this.tone(f, d, { ...o, dst });
    switch (kind) {
      case 'pistol': N(0.09, { type: 'bandpass', f: 2600, q: 0.8, vol: 0.9 }); T(180, 0.08, { f2: 60, vol: 0.6, type: 'triangle' }); N(0.25, { f: 1400, vol: 0.12, at: 0.02 }); break;
      case 'magnum': N(0.2, { type: 'bandpass', f: 1500, q: 0.7, vol: 1 }); T(140, 0.22, { f2: 35, vol: 0.9, type: 'triangle' }); N(0.5, { f: 900, vol: 0.2, at: 0.03 }); break;
      case 'rifle': N(0.12, { type: 'bandpass', f: 2200, q: 0.7, vol: 0.9 }); T(120, 0.12, { f2: 45, vol: 0.75, type: 'triangle' }); N(0.3, { f: 1100, vol: 0.14, at: 0.02 }); break;
      case 'smg': N(0.07, { type: 'bandpass', f: 3200, q: 0.9, vol: 0.8 }); T(200, 0.06, { f2: 80, vol: 0.5, type: 'triangle' }); break;
      case 'shotgun': N(0.3, { type: 'bandpass', f: 1200, q: 0.5, vol: 1.1 }); T(90, 0.3, { f2: 30, vol: 1, type: 'triangle' }); N(0.55, { f: 700, vol: 0.25, at: 0.04 }); this.noise(0.08, { type: 'highpass', f: 3000, vol: 0.3, at: 0.34, dst }); break;
      case 'dmr': N(0.15, { type: 'bandpass', f: 2000, q: 0.6, vol: 1 }); T(100, 0.18, { f2: 38, vol: 0.9, type: 'triangle' }); N(0.5, { f: 1000, vol: 0.2, at: 0.03 }); break;
      case 'sniper': N(0.1, { type: 'highpass', f: 2500, vol: 1 }); N(0.5, { type: 'bandpass', f: 800, q: 0.5, vol: 1 }); T(80, 0.5, { f2: 28, vol: 1.1, type: 'triangle' }); N(1.2, { f: 500, vol: 0.28, at: 0.08 }); break;
      case 'rocket': N(0.5, { type: 'bandpass', f: 400, f2: 2500, q: 0.8, vol: 0.9 }); T(90, 0.45, { f2: 30, vol: 0.8, type: 'sawtooth' }); N(1.0, { f: 600, vol: 0.2, at: 0.1 }); break;
      case 'plasma': T(900, 0.14, { f2: 180, vol: 0.5, type: 'sawtooth' }); T(1800, 0.1, { f2: 400, vol: 0.25, type: 'square', at: 0.01 }); N(0.12, { type: 'highpass', f: 4000, vol: 0.25 }); break;
      case 'laser': T(1400, 0.08, { f2: 1100, vol: 0.25, type: 'sawtooth', vib: 40 }); N(0.06, { type: 'bandpass', f: 5000, vol: 0.2 }); break;
      case 'blade': N(0.22, { type: 'bandpass', f: 600, f2: 3500, q: 1.2, vol: 0.7 }); T(1200, 0.35, { f2: 900, vol: 0.12, type: 'sine', at: 0.05 }); break;
      case 'drone': T(1500, 0.08, { f2: 700, vol: 0.2, type: 'square' }); break;
      default: N(0.1, { type: 'bandpass', f: 2000, vol: 0.7 });
    }
    if (kind !== 'laser' && kind !== 'smg' && kind !== 'blade' && kind !== 'drone') { const vg = this.ctx.createGain(); vg.gain.value = kind === 'sniper' ? 0.8 : 0.4; dst.connect(vg); vg.connect(this.verb); }
  }
  explosion(pos, big = 1) {
    if (!this.ctx) return; const dst = this.out(pos, 1.15 * big); if (!dst) return;
    this.noise(1.6, { f: 1800, f2: 80, vol: 1.1, dst, type: 'lowpass' }); this.tone(70, 1.1, { f2: 24, vol: 1.3, dst, type: 'sine' }); this.noise(0.2, { type: 'highpass', f: 3000, vol: 0.5, dst });
    this.noise(2.2, { f: 400, f2: 60, vol: 0.4, at: 0.2, dst }); for (let i = 0; i < 5; i++) this.noise(0.06, { type: 'bandpass', f: rnd(800, 3000), vol: 0.2, at: 0.3 + rnd(0, 0.9), dst });
    const vg = this.ctx.createGain(); vg.gain.value = 0.5; dst.connect(vg); vg.connect(this.verb);
  }
  reload(kind, pos, dur = 1.5) {
    if (!this.ctx) return; const dst = this.out(pos, 0.55); if (!dst) return; const N = (d, o) => this.noise(d, { ...o, dst }), T = (f, d, o) => this.tone(f, d, { ...o, dst });
    const click = (at, f = 3000, v = 0.7) => { N(0.03, { type: 'bandpass', f, q: 4, vol: v, at }); T(f * 0.5, 0.04, { vol: 0.1, at, type: 'square' }); };
    if (kind === 'shotgun') { for (let i = 0; i < 4; i++) { click(0.25 + i * dur * 0.2, 2400 + i * 200); } click(dur - 0.25, 1600, 1); }
    else if (kind === 'launcher') { click(0.3, 1200, 0.9); N(0.25, { f: 400, vol: 0.4, at: 0.5 }); click(dur - 0.4, 1800, 1); }
    else if (kind === 'plasma' || kind === 'laser') { T(300, 0.5, { f2: 1200, vol: 0.18, type: 'sawtooth' }); click(dur * 0.55, 3500, 0.7); T(1500, 0.3, { f2: 500, vol: 0.18, at: dur * 0.6, type: 'sine' }); }
    else { click(dur * 0.22, 2600, 0.8); N(0.2, { type: 'bandpass', f: 900, vol: 0.2, at: dur * 0.3 }); click(dur * 0.62, 3200, 0.9); click(dur - 0.1, 1800, 1); }
  }
  swap(pos) { if (!this.ctx) return; const d = this.out(pos, 0.4); if (d) { this.noise(0.05, { type: 'bandpass', f: 2000, q: 2, vol: 0.6, dst: d }); this.tone(500, 0.06, { vol: 0.12, dst: d, type: 'square' }); } }
  empty() { if (!this.ctx) return; this.noise(0.03, { type: 'bandpass', f: 1800, q: 5, vol: 0.5 }); }
  hitmarker(hs, kill) {
    if (!this.ctx) return;
    if (kill) { this.tone(880, 0.22, { vol: 0.35, type: 'sine' }); this.tone(1320, 0.3, { vol: 0.3, at: 0.07, type: 'sine' }); this.tone(1760, 0.4, { vol: 0.2, at: 0.14 }); }
    else if (hs) { this.tone(1500, 0.09, { vol: 0.4, type: 'triangle' }); this.tone(2200, 0.1, { vol: 0.3, at: 0.03, type: 'triangle' }); }
    else this.tone(1100, 0.06, { vol: 0.3, type: 'triangle' });
  }
  hurt(big) { if (!this.ctx) return; this.noise(0.18, { f: 500, vol: big ? 0.9 : 0.5 }); this.tone(110, 0.2, { f2: 50, vol: 0.5, type: 'sine' }); }
  hitFlesh(pos) { if (!this.ctx) return; const d = this.out(pos, 0.5); if (d) { this.noise(0.08, { f: 1200, vol: 0.5, dst: d }); this.tone(220, 0.07, { f2: 90, vol: 0.3, dst: d, type: 'triangle' }); } }
  impact(pos, kind = 'concrete') { if (!this.ctx) return; const d = this.out(pos, 0.35); if (!d) return; const m = { metal: [3500, 0.7], concrete: [1500, 0.8], dirt: [500, 0.7], wood: [900, 0.8] }[kind] || [1500, 0.8]; this.noise(0.07, { type: 'bandpass', f: m[0], q: 1.2, vol: 0.6, dst: d }); if (kind === 'metal') this.tone(2200 + rnd(0, 800), 0.1, { vol: 0.08, dst: d, f2: 1800 }); }
  step(surface, pos, vol = 0.5) {
    if (!this.ctx) return; const d = this.out(pos, vol); if (!d) return;
    switch (surface) {
      case 'grass': this.noise(0.1, { f: 700, q: 0.6, vol: 0.5, dst: d }); break;
      case 'metal': this.noise(0.06, { type: 'bandpass', f: 1800, q: 2, vol: 0.5, dst: d }); this.tone(900 + rnd(-100, 100), 0.1, { vol: 0.04, dst: d }); break;
      case 'water': this.noise(0.22, { type: 'bandpass', f: 1400, q: 0.8, vol: 0.5, dst: d }); break;
      case 'wood': this.noise(0.07, { type: 'bandpass', f: 500, q: 1.2, vol: 0.6, dst: d }); this.tone(160, 0.06, { vol: 0.15, dst: d, f2: 90 }); break;
      case 'sand': this.noise(0.12, { f: 900, vol: 0.35, dst: d }); break;
      default: this.noise(0.06, { type: 'bandpass', f: 1100, q: 1, vol: 0.55, dst: d }); this.noise(0.03, { type: 'highpass', f: 3500, vol: 0.12, dst: d });
    }
  }
  jump() { if (!this.ctx) return; this.noise(0.15, { type: 'bandpass', f: 500, f2: 1200, vol: 0.2 }); }
  land(v = 0.5) { if (!this.ctx) return; this.noise(0.12, { f: 600, vol: 0.5 * v }); this.tone(90, 0.1, { f2: 50, vol: 0.4 * v }); }
  dash() { if (!this.ctx) return; this.noise(0.28, { type: 'bandpass', f: 400, f2: 3000, q: 0.8, vol: 0.55 }); }
  pickup(kind) {
    if (!this.ctx) return;
    const seq = { weapon: [520, 660, 880], ammo: [600, 760], cons: [700, 920], power: [440, 660, 880, 1320], gadget: [500, 750, 1000, 1500], shard: [880, 1320, 1760, 2640] }[kind] || [600, 800];
    seq.forEach((f, i) => this.tone(f, 0.15, { vol: 0.2, at: i * 0.06, type: kind === 'shard' ? 'sine' : 'triangle' }));
  }
  chest() { if (!this.ctx) return; this.noise(0.4, { type: 'bandpass', f: 300, f2: 900, q: 3, vol: 0.3 }); [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.5, { vol: 0.18, at: 0.25 + i * 0.07 })); }
  door(pos) { if (!this.ctx) return; const d = this.out(pos, 0.5); if (d) { this.noise(0.5, { type: 'bandpass', f: 600, f2: 200, q: 1, vol: 0.5, dst: d }); this.tone(90, 0.5, { vol: 0.2, dst: d, f2: 60, type: 'sawtooth' }); } }
  switchSnd(pos) { if (!this.ctx) return; const d = this.out(pos, 0.7); if (d) { this.noise(0.04, { type: 'bandpass', f: 1500, q: 3, vol: 0.8, dst: d }); this.tone(120, 0.5, { vol: 0.3, dst: d, f2: 80, type: 'square', at: 0.05 }); } }
  teleport(pos) { if (!this.ctx) return; const d = this.out(pos, 0.7); if (d) { this.tone(200, 0.5, { f2: 2400, vol: 0.25, dst: d, type: 'sine' }); this.noise(0.4, { type: 'bandpass', f: 800, f2: 6000, vol: 0.3, dst: d }); } }
  grapple(pos) { if (!this.ctx) return; const d = this.out(pos, 0.6); if (d) { this.noise(0.15, { type: 'bandpass', f: 1500, f2: 4000, vol: 0.5, dst: d }); this.tone(300, 0.2, { f2: 900, vol: 0.2, dst: d, type: 'square' }); } }
  powerup() { if (!this.ctx) return; this.tone(300, 0.6, { f2: 1200, vol: 0.25, type: 'sawtooth' }); this.noise(0.5, { type: 'highpass', f: 2000, vol: 0.15 }); }
  heal() { if (!this.ctx) return; [660, 880, 1100].forEach((f, i) => this.tone(f, 0.3, { vol: 0.2, at: i * 0.08 })); this.noise(0.3, { type: 'highpass', f: 3000, vol: 0.1 }); }
  shield() { if (!this.ctx) return; this.tone(400, 0.5, { f2: 900, vol: 0.22, type: 'triangle' }); this.tone(800, 0.5, { f2: 1600, vol: 0.12, at: 0.05 }); }
  scan() { if (!this.ctx) return; this.tone(200, 0.9, { f2: 1500, vol: 0.2, type: 'sine' }); this.tone(220, 0.9, { f2: 1600, vol: 0.12, at: 0.05, type: 'triangle' }); }
  droneSnd() { if (!this.ctx) return; this.tone(180, 0.6, { f2: 600, vol: 0.2, type: 'sawtooth', vib: 30 }); }
  throwSnd() { if (!this.ctx) return; this.noise(0.2, { type: 'bandpass', f: 500, f2: 1800, vol: 0.4 }); }
  nade(pos) { if (!this.ctx) return; const d = this.out(pos, 0.5); if (d) { this.noise(0.06, { type: 'bandpass', f: 2000, vol: 0.5, dst: d }); this.tone(1500, 0.05, { vol: 0.1, dst: d, type: 'square' }); } }
  smokeSnd(pos) { if (!this.ctx) return; const d = this.out(pos, 0.7); if (d) this.noise(1.6, { type: 'bandpass', f: 3000, f2: 800, q: 0.4, vol: 0.5, dst: d, atk: 0.05 }); }
  lowgrav() { if (!this.ctx) return; this.tone(500, 1.2, { f2: 80, vol: 0.3, type: 'sine' }); this.tone(250, 1.4, { f2: 700, vol: 0.2, at: 0.3, type: 'triangle' }); }
  alarm() { if (!this.ctx) return; for (let i = 0; i < 4; i++) this.tone(i % 2 ? 700 : 900, 0.18, { vol: 0.2, at: i * 0.2, type: 'square' }); }
  supply() { if (!this.ctx) return; this.noise(2, { type: 'bandpass', f: 300, f2: 1500, q: 0.6, vol: 0.3, atk: 0.4 }); [440, 550, 660].forEach((f, i) => this.tone(f, 0.4, { vol: 0.15, at: 0.2 + i * 0.15 })); }
  // ---------- UI ----------
  hover() { if (this.ctx) this.tone(1400, 0.04, { vol: 0.08, type: 'triangle' }); }
  click() { if (!this.ctx) return; this.tone(700, 0.07, { vol: 0.18, type: 'triangle' }); this.tone(1050, 0.09, { vol: 0.12, at: 0.04, type: 'triangle' }); }
  back() { if (this.ctx) this.tone(500, 0.1, { vol: 0.16, f2: 350, type: 'triangle' }); }
  error() { if (this.ctx) { this.tone(200, 0.15, { vol: 0.2, type: 'square' }); this.tone(150, 0.2, { vol: 0.2, at: 0.1, type: 'square' }); } }
  countdown(go) { if (this.ctx) this.tone(go ? 1200 : 700, go ? 0.5 : 0.14, { vol: 0.3, type: 'square' }); }
  levelUp() { if (!this.ctx) return; [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { vol: 0.2, at: i * 0.09, type: 'triangle' })); }
  win() { if (!this.ctx) return; [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { this.tone(f, 0.35, { vol: 0.22, at: i * 0.13, type: 'triangle' }); this.tone(f / 2, 0.35, { vol: 0.12, at: i * 0.13, type: 'sine' }); }); }
  lose() { if (!this.ctx) return; [392, 330, 294, 220].forEach((f, i) => this.tone(f, 0.5, { vol: 0.2, at: i * 0.22, type: 'sawtooth' })); }
  death() { if (!this.ctx) return; this.tone(300, 0.8, { f2: 40, vol: 0.4, type: 'sawtooth' }); this.noise(0.6, { f: 800, f2: 100, vol: 0.4 }); }
  spawn() { if (!this.ctx) return; this.tone(200, 0.4, { f2: 1000, vol: 0.2, type: 'sine' }); }
  // Dauerklänge (Laser, Jetpack)
  loop(name, make) { if (!this.ctx) return null; this.loops = this.loops || {}; if (this.loops[name]) return this.loops[name]; const l = make(this.ctx); this.loops[name] = l; return l; }
  laserLoop(on) {
    if (!this.ctx) return;
    const l = this.loop('laser', (c) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220; const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 331; const lfo = c.createOscillator(); lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency); const g = c.createGain(); g.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o.start(); o2.start(); lfo.start(); return { g }; });
    l.g.gain.setTargetAtTime(on ? 0.14 : 0, this.t, 0.03);
  }
  jetLoop(on, k = 1) {
    if (!this.ctx) return;
    const l = this.loop('jet', (c) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.sfx); s.start(); return { g, f }; });
    l.g.gain.setTargetAtTime(on ? 0.22 * k : 0, this.t, 0.05); l.f.frequency.setTargetAtTime(on ? 600 + k * 300 : 300, this.t, 0.1);
  }

  // ---------- Umgebung ----------
  startAmbient() {
    const c = this.ctx, mkNoise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.amb); s.start(); return { g, fl, s }; };
    this.a = { wind: mkNoise('bandpass', 400, 0.4), waves: mkNoise('lowpass', 500, 0.5), city: mkNoise('lowpass', 200, 0.6), forest: mkNoise('bandpass', 1500, 0.3), hum: null, cave: mkNoise('lowpass', 150, 1.2) };
    const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 55; const hg = c.createGain(); hg.gain.value = 0; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220; hum.connect(hf); hf.connect(hg); hg.connect(this.amb); hum.start(); this.a.hum = { g: hg };
    this.zone = 'wind'; this.night = 0; this.underground = false; this.amb_t = 0;
    const lfo = (node, rate, depth, base) => setInterval(() => { if (!this.ctx) return; const t = this.t; node.gain.setTargetAtTime(Math.max(0, base() * (1 + Math.sin(t * rate) * depth)), t, 0.4); }, 400);
    this.chirpTimer = setInterval(() => this.chirps(), 900);
  }
  setAmbience(zone, night, underground, wading) {
    if (!this.ctx) return; const t = this.t, a = this.a;
    const w = { wind: 0.05, waves: 0, city: 0, forest: 0, hum: 0, cave: 0 };
    if (underground) { w.cave = zone === 'city' ? 0.16 : 0.22; w.hum = 0.02; }
    else switch (zone) {
      case 'city': w.city = 0.2; w.wind = 0.03; break;
      case 'industry': w.hum = 0.05; w.city = 0.1; w.wind = 0.05; break;
      case 'base': w.hum = 0.03; w.wind = 0.09; break;
      case 'coast': w.waves = 0.28; w.wind = 0.09; break;
      case 'forest': w.forest = 0.14; w.wind = 0.07; break;
      default: w.wind = 0.12; w.forest = 0.05;
    }
    for (const k in w) a[k].g.gain.setTargetAtTime(w[k] * (k === 'forest' ? 1 : 1), t, 0.8);
    a.waves.fl.frequency.setTargetAtTime(350 + Math.sin(t * 0.4) * 200, t, 1);
    a.wind.fl.frequency.setTargetAtTime(350 + Math.sin(t * 0.17) * 180 + Math.sin(t * 0.43) * 90, t, 1);
    this.zone = zone; this.night = night; this.underground = underground;
  }
  chirps() {
    if (!this.ctx || this.underground || this.musicMode === 'menuonly') return;
    const z = this.zone, n = this.night;
    if ((z === 'forest' || z === 'wind') && n < 0.5 && Math.random() < 0.55) { const f = rnd(2200, 4200); for (let i = 0; i < Math.floor(rnd(2, 5)); i++) this.tone(f * rnd(0.9, 1.15), 0.07, { f2: f * rnd(1.1, 1.5), vol: 0.035, at: i * 0.1 + rnd(0, 0.05), dst: this.amb }); }
    if (n > 0.5 && (z === 'forest' || z === 'wind' || z === 'coast') && Math.random() < 0.6) { for (let i = 0; i < 6; i++) this.tone(4200, 0.03, { vol: 0.02, at: i * 0.07, dst: this.amb }); }
    if (z === 'coast' && n < 0.5 && Math.random() < 0.25) { const f = rnd(1400, 2000); this.tone(f, 0.25, { f2: f * 0.6, vol: 0.05, dst: this.amb, type: 'triangle', vib: 18 }); }
    if (z === 'city' && Math.random() < 0.08) { this.tone(rnd(300, 420), 0.5, { vol: 0.03, dst: this.amb, type: 'sawtooth' }); }
  }

  // ---------- Musik (generativ) ----------
  musicStart(mode) {
    this.wantMusic = mode; if (!this.ctx) return; this.musicMode = mode; if (this.musicTimer) return;
    this.mstep = 0; this.nextT = this.t + 0.1;
    this.musicTimer = setInterval(() => this.musicSchedule(), 90);
  }
  musicStop() { this.wantMusic = null; this.musicMode = 'off'; clearInterval(this.musicTimer); this.musicTimer = null; }
  musicSchedule() {
    const c = this.ctx; if (!c) return;
    const bpm = this.musicMode === 'menu' ? 96 : 118, sp = 60 / bpm / 4;
    const ROOTS = [57, 53, 60, 55]; // A, F, C, G  (MIDI)
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextT < this.t + 0.4) {
      const s = this.mstep, bar = Math.floor(s / 16) % 4, i = s % 16, root = ROOTS[bar], t = this.nextT;
      const g = this.music;
      const voice = (f, d, type, vol, at = 0, filt = 2400) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; const ge = c.createGain(); ge.gain.setValueAtTime(0.0001, t + at); ge.gain.linearRampToValueAtTime(vol, t + at + 0.01); ge.gain.exponentialRampToValueAtTime(0.0001, t + at + d); o.connect(fl); fl.connect(ge); ge.connect(g); o.start(t + at); o.stop(t + at + d + 0.05); };
      if (i === 0) { [0, 3, 7, 12].forEach((iv, k) => { const f = hz(root + iv + (this.musicMode === 'menu' ? 12 : 0)); voice(f, sp * 16, 'sawtooth', 0.045, 0, 900); voice(f * 1.005, sp * 16, 'sawtooth', 0.03, 0, 900); }); }
      const arp = [0, 7, 12, 15, 12, 7, 3, 7][(i + bar * 2) % 8];
      if (i % 2 === 0 || this.musicMode === 'game') voice(hz(root + 24 + arp - (i % 4 === 2 ? 0 : 0)), sp * 1.8, 'triangle', 0.07, 0, 3000);
      if (this.musicMode === 'game' || this.musicMode === 'menu') { if (i % 4 === 0) voice(hz(root - 12), sp * 3.5, 'sine', 0.2); if (i % 8 === 6 && this.musicMode === 'game') voice(hz(root - 12 + 7), sp * 2, 'sine', 0.14); }
      if (this.musicMode === 'game') {
        if (i % 8 === 0) { const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); const ge = c.createGain(); ge.gain.setValueAtTime(0.35, t); ge.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(ge); ge.connect(g); o.start(t); o.stop(t + 0.25); }
        if (i % 4 === 2) { const s2 = c.createBufferSource(); s2.buffer = this.noiseBuf; const hf = c.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000; const ge = c.createGain(); ge.gain.setValueAtTime(0.06, t); ge.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s2.connect(hf); hf.connect(ge); ge.connect(g); s2.start(t, Math.random()); s2.stop(t + 0.06); }
        if (i % 8 === 4) { const s2 = c.createBufferSource(); s2.buffer = this.noiseBuf; const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1800; const ge = c.createGain(); ge.gain.setValueAtTime(0.1, t); ge.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); s2.connect(bf); bf.connect(ge); ge.connect(g); s2.start(t, Math.random()); s2.stop(t + 0.15); }
      }
      this.mstep++; this.nextT += sp;
    }
  }
  updateListener(cam, yaw) {
    if (!this.ctx) return; this.listener.x = cam.x; this.listener.y = cam.y; this.listener.z = cam.z; this.listener.yaw = yaw;
  }
}
// Audio darf das Spiel nie zum Absturz bringen: alle Methoden fehlertolerant machen
for (const k of Object.getOwnPropertyNames(Audio.prototype)) {
  const d = Object.getOwnPropertyDescriptor(Audio.prototype, k);
  if (k !== 'constructor' && typeof d.value === 'function') { const f = d.value; Audio.prototype[k] = function (...a) { try { return f.apply(this, a); } catch (e) { if (!this._warned) { console.warn('Audio-Fehler in', k, e); this._warned = 1; } } }; }
}
export const audio = new Audio();
