// Performance: Frame-Pacing (FPS-Limit), dynamische Auflösung, Akku-Sparmodus, Entwickler-Monitor (nur ?debug=1 / F3).
const $ = (s) => document.querySelector(s);

export class Perf {
  constructor(engine, settings) {
    this.e = engine; this.S = settings;
    this.deltas = []; this.work = []; this.lastFrame = 0; this.dyn = 1; this.stableSince = 0; this.lastCheck = 0;
    this.debug = new URLSearchParams(location.search).has('debug') || localStorage.getItem('nf_debug') === '1';
    this.mon = null; this.monVisible = false; this.monT = 0; this.net = { kbps: 0, bytes: 0, t: performance.now() }; this.srv = null; this.srvT = 0;
    this.frames = 0; this.jsMs = 0; this.renderMs = 0;
    if (this.debug) addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.toggle(); } });
  }
  get cap() { return this.S.batterySaver ? 30 : this.S.fpsCap; }          // 0 = unbegrenzt
  // true, wenn dieser rAF-Tick gerendert werden soll (Frame-Pacing mit Toleranz, damit 60 FPS auf 60-Hz-Displays nicht jedes 2. Frame fallen)
  shouldRender(now) {
    const cap = this.cap;
    if (cap && now - this.lastFrame < 1000 / cap - 0.8) return false;
    this.lastFrame = now; return true;
  }
  // nach dem Rendern aufrufen: dt = ms seit letztem gerenderten Frame, work = ms JS+Submit dieses Frames
  frameEnd(dt, work, renderMs) {
    this.frames++; this.jsMs += work; this.renderMs += renderMs;
    if (dt > 0 && dt < 500) { this.deltas.push(dt); this.work.push(work); if (this.deltas.length > 90) { this.deltas.shift(); this.work.shift(); } }
    const now = performance.now();
    if (now - this.lastCheck > 1000) { this.lastCheck = now; this.adapt(now); }
    if (this.monVisible && now - this.monT > 500) { this.monT = now; this.updateMonitor(); }
  }
  adapt(now) {
    if (!this.S.dynRes || this.deltas.length < 40) return;
    const target = 1000 / (this.cap || 60), avg = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length, work = this.work.reduce((a, b) => a + b, 0) / this.work.length;
    let changed = false;
    if (avg > target * 1.2 && this.dyn > 0.55) { this.dyn = Math.max(0.55, +(this.dyn - 0.1).toFixed(2)); changed = true; this.stableSince = now; }
    else if (avg < target * 1.08 && work < target * 0.72 && this.dyn < 1 && now - this.stableSince > 4000) { this.dyn = Math.min(1, +(this.dyn + 0.05).toFixed(2)); changed = true; this.stableSince = now; }
    if (changed) { this.deltas.length = 0; this.work.length = 0; this.e.setDynScale(this.dyn); }
  }
  reset() { this.dyn = 1; this.deltas.length = 0; this.work.length = 0; this.e.setDynScale(1); }

  // ---- Entwickler-Monitor ----
  toggle() { this.monVisible = !this.monVisible; if (this.monVisible && !this.mon) this.build(); if (this.mon) this.mon.style.display = this.monVisible ? 'block' : 'none'; }
  build() {
    const d = document.createElement('pre'); d.id = 'perfmon';
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:120;margin:0;padding:8px 10px;background:rgba(0,0,0,.72);color:#9dffb0;font:11px/1.35 ui-monospace,Menlo,monospace;pointer-events:none;border:1px solid #2a6;white-space:pre';
    document.body.appendChild(d); this.mon = d;
  }
  netBytes(n) { this.net.bytes += n; }
  updateMonitor() {
    const g = window.game, r = this.e.renderer, i = r.info, now = performance.now();
    const dt = this.deltas.length ? this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length : 0, mx = this.deltas.length ? Math.max(...this.deltas) : 0;
    const el = (now - this.net.t) / 1000; this.net.kbps = this.net.bytes / 1024 / el; this.net.bytes = 0; this.net.t = now;
    let parts = 0; const fx = g && g.fx; if (fx) for (const s of [fx.add, fx.norm]) for (let k = 0; k < s.n; k++) if (s.life[k] > 0) parts++;
    const lights = this.e.view.lightPool.filter(l => l.intensity > 0.02).length;
    const fr = Math.max(1, this.frames);
    if (g && g.net && g.net.kind === 'ws' && now - this.srvT > 5000) { this.srvT = now; fetch(g.net.url.replace(/^ws/, 'http') + '/metrics').then(r => r.json()).then(j => { this.srv = j; }).catch(() => {}); }
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a';
    const tex = i.memory.textures, geo = i.memory.geometries;
    this.mon.textContent =
      `FPS ${dt ? (1000 / dt).toFixed(0) : '-'}  frame ${dt.toFixed(1)} ms (max ${mx.toFixed(0)})  cap ${this.cap || '∞'}  dynRes ${this.dyn}\n` +
      `JS ${(this.jsMs / fr).toFixed(1)} ms  render-submit ${(this.renderMs / fr).toFixed(1)} ms  heap ${mem}\n` +
      `draw calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k  textures ${tex}  geometries ${geo}\n` +
      `entities ${g ? g.ents.size : 0}  particles ${parts}  lights ${lights}  shadow ${this.e.sky.sun.castShadow ? this.e.q.shadow : 'off'}\n` +
      `net ↓${this.net.kbps.toFixed(1)} KB/s  ping ${g && g.net ? Math.round(g.rtt * 1000) : '-'} ms` +
      (this.srv ? `\nserver tick ${this.srv.tickAvgMs} ms (max ${this.srv.tickMaxMs})  cpu ${this.srv.cpuPct}%  rss ${this.srv.rssMB} MB  players ${this.srv.players}` : '');
    this.frames = 0; this.jsMs = 0; this.renderMs = 0;
  }
}
