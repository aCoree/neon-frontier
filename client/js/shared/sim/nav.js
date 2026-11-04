// Navigations-Gitter (2 m Zellen, Bodenebene) mit A*. Einmalig pro Prozess berechnet.
import { clamp } from '../util.js';
import { SEA_LEVEL } from '../mapdata.js';

const CS = 2, ORG = -200, N = 200;
let cached = null;

export class Nav {
  static for(world) { return cached || (cached = new Nav(world)); }
  constructor(world) {
    this.world = world;
    this.walk = new Uint8Array(N * N); this.gh = new Float32Array(N * N);
    const T = world.map.terrainY;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ORG + (i + 0.5) * CS, z = ORG + (j + 0.5) * CS, k = j * N + i;
      const t = world.terrain(x, z);
      if (t < -1000 || t < SEA_LEVEL - 0.3) continue;
      const g = world.groundAt(x, z, t + 0.7, 0.3);
      this.gh[k] = g;
      // Freiraum prüfen (Zylinder r=0.6, Höhe 0.7..1.8 über Boden)
      const objs = world.query(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
      let ok = true;
      for (let q = 0; q < objs.length; q++) {
        const o = objs[q]; if (o.nowall || o.y1 <= g + 0.6 || o.y0 >= g + 1.8) continue;
        if (o.cyl) { if (Math.hypot(x - o.cx, z - o.cz) < o.r + 0.55) { ok = false; break; } }
        else if (x > o.x0 - 0.55 && x < o.x1 + 0.55 && z > o.z0 - 0.55 && z < o.z1 + 0.55) { ok = false; break; }
      }
      if (ok && g > -3) this.walk[k] = 1;
    }
    this.stamp = new Int32Array(N * N); this.gs = new Float32Array(N * N); this.from = new Int32Array(N * N); this.closed = new Int32Array(N * N); this.sid = 0;
    this.heap = []; this.hf = new Float32Array(N * N);
  }
  cell(x, z) { return clamp(Math.floor((z - ORG) / CS), 0, N - 1) * N + clamp(Math.floor((x - ORG) / CS), 0, N - 1); }
  center(k, out) { out.x = ORG + ((k % N) + 0.5) * CS; out.z = ORG + (Math.floor(k / N) + 0.5) * CS; out.y = this.gh[k]; return out; }
  isWalk(x, z) { return this.walk[this.cell(x, z)] === 1; }
  nearestWalk(x, z, maxR = 6) {
    const k0 = this.cell(x, z); if (this.walk[k0]) return k0;
    const ci = k0 % N, cj = Math.floor(k0 / N);
    for (let r = 1; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (this.walk[j * N + i]) return j * N + i;
    }
    return -1;
  }
  lineClear(ax, az, bx, bz) { // geradlinig begehbar?
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 1.0);
    let lastH = this.gh[this.cell(ax, az)];
    for (let i = 1; i <= n; i++) {
      const k = this.cell(ax + (bx - ax) * i / n, az + (bz - az) * i / n);
      if (!this.walk[k] || Math.abs(this.gh[k] - lastH) > 0.9) return false; lastH = this.gh[k];
    }
    return true;
  }
  // A* -> Liste [{x,y,z}] (geglättet) oder null
  path(sx, sz, gx, gz, maxExp = 3500) {
    const s = this.nearestWalk(sx, sz, 3), g = this.nearestWalk(gx, gz, 8);
    if (s < 0 || g < 0) return null;
    const sid = ++this.sid, heap = this.heap; heap.length = 0;
    const gi = g % N, gj = Math.floor(g / N);
    const push = (k, f) => { heap.push(k); this.hf[k] = f; let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.hf[heap[p]] <= this.hf[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && this.hf[heap[l]] < this.hf[heap[m]]) m = l; if (r < heap.length && this.hf[heap[r]] < this.hf[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    this.stamp[s] = sid; this.gs[s] = 0; this.from[s] = -1; push(s, 0);
    let exp = 0, best = s, bestH = 1e9;
    while (heap.length && exp++ < maxExp) {
      const k = pop();
      if (this.closed[k] === sid) continue; this.closed[k] = sid;
      if (k === g) { best = k; break; }
      const ci = k % N, cj = (k / N) | 0;
      const hh = Math.hypot(gi - ci, gj - cj); if (hh < bestH) { bestH = hh; best = k; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const nk = j * N + i; if (!this.walk[nk] || this.closed[nk] === sid) continue;
        const dy = this.gh[nk] - this.gh[k]; if (dy > 1.1 || dy < -1.6) continue;
        if (di && dj && (!this.walk[cj * N + i] || !this.walk[j * N + ci])) continue; // Ecken schneiden vermeiden
        const cost = this.gs[k] + (di && dj ? 1.414 : 1) + Math.abs(dy) * 0.8;
        if (this.stamp[nk] !== sid || cost < this.gs[nk]) { this.stamp[nk] = sid; this.gs[nk] = cost; this.from[nk] = k; push(nk, cost + Math.hypot(gi - i, gj - j)); }
      }
    }
    // Rekonstruktion
    const pts = []; let k = best;
    while (k >= 0) { pts.push(this.center(k, {})); k = this.from[k]; }
    pts.reverse();
    // String pulling
    const out = [pts[0]]; let a = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineClear(pts[a].x, pts[a].z, pts[i].x, pts[i].z)) { out.push(pts[i - 1]); a = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  randomWalk(rng, cx, cz, r) {
    for (let t = 0; t < 30; t++) {
      const a = rng() * 6.283, d = Math.sqrt(rng()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.isWalk(x, z)) return { x, z, y: this.gh[this.cell(x, z)] };
    }
    return null;
  }
}
