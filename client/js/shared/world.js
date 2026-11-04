// Kollisionswelt: AABB-/Zylinder-Collider, Raycasts, Zylinder-Bewegung mit Treppensteigen.
// Läuft identisch auf Server (Bots, Treffer, Projektile) und Client (Spielerbewegung).
import { clamp } from './util.js';

const CELL = 6, ORG = -212, DIM = 71;
export const BOUND = 196;

export class World {
  constructor(map) {
    this.map = map;
    this.objs = [];
    for (const b of map.boxes) this.objs.push(b);
    for (const c of map.cyls) this.objs.push(c);
    this.grid = new Array(DIM * DIM);
    this.stamp = 1;
    this.rh = { nx: 0, ny: 1, nz: 0, obj: null, terrain: false };
    this.gy = 0; this.go = null;
    this._tmp = [];
    for (const o of this.objs) this.insert(o);
  }

  insert(o) {
    const x0 = Math.floor((o.x0 - ORG) / CELL), x1 = Math.floor((o.x1 - ORG) / CELL);
    const z0 = Math.floor((o.z0 - ORG) / CELL), z1 = Math.floor((o.z1 - ORG) / CELL);
    for (let z = clamp(z0, 0, DIM - 1); z <= clamp(z1, 0, DIM - 1); z++)
      for (let x = clamp(x0, 0, DIM - 1); x <= clamp(x1, 0, DIM - 1); x++) {
        const i = z * DIM + x;
        (this.grid[i] || (this.grid[i] = [])).push(o);
      }
  }

  terrain(x, z) {
    const hs = this.map.holes;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return -9999;
    }
    return this.map.terrainY(x, z);
  }

  query(x0, z0, x1, z1) {
    const out = this._tmp; out.length = 0;
    const st = ++this.stamp;
    const ax = clamp(Math.floor((x0 - ORG) / CELL), 0, DIM - 1), bx = clamp(Math.floor((x1 - ORG) / CELL), 0, DIM - 1);
    const az = clamp(Math.floor((z0 - ORG) / CELL), 0, DIM - 1), bz = clamp(Math.floor((z1 - ORG) / CELL), 0, DIM - 1);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const c = this.grid[z * DIM + x];
      if (!c) continue;
      for (let i = 0; i < c.length; i++) { const o = c[i]; if (o._q !== st) { o._q = st; out.push(o); } }
    }
    return out;
  }

  // höchste tragende Fläche unter (x,z) mit Oberkante <= maxY
  groundAt(x, z, maxY, r = 0.18) {
    let best = -Infinity, bo = null;
    const t = this.terrain(x, z);
    if (t <= maxY) best = t;
    const list = this.query(x - r, z - r, x + r, z + r);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.on || o.y1 > maxY || o.y1 <= best || o.nogr) continue;
      if (o.cyl) { if (Math.hypot(x - o.cx, z - o.cz) > o.r + r * 0.5) continue; }
      else if (x < o.x0 - r * 0.5 || x > o.x1 + r * 0.5 || z < o.z0 - r * 0.5 || z > o.z1 + r * 0.5) continue;
      best = o.y1; bo = o;
    }
    this.gy = best; this.go = bo;
    return best;
  }

  move(e, dt) {
    const stepUp = e.stepUp ?? 0.55;
    const maxd = Math.max(Math.abs(e.vx), Math.abs(e.vz), Math.abs(e.vy)) * dt;
    const n = Math.max(1, Math.ceil(maxd / 0.25));
    const sdt = dt / n;
    e.wall = false;
    for (let i = 0; i < n; i++) {
      e.x += e.vx * sdt; this._push(e, stepUp);
      e.z += e.vz * sdt; this._push(e, stepUp);
      this._vertical(e, sdt, stepUp);
    }
    e.x = clamp(e.x, -BOUND, BOUND); e.z = clamp(e.z, -BOUND, BOUND);
  }

  _push(e, stepUp) {
    const r = e.r;
    const list = this.query(e.x - r, e.z - r, e.x + r, e.z + r);
    const top = e.y + stepUp + 1e-4, head = e.y + e.h;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.on || o.nowall || o.y1 <= top || o.y0 >= head) continue;
      let nx = 0, nz = 0, pen = 0;
      if (o.cyl) {
        const dx = e.x - o.cx, dz = e.z - o.cz, d = Math.hypot(dx, dz), rr = o.r + r;
        if (d >= rr) continue;
        if (d < 1e-6) { nx = 1; nz = 0; } else { nx = dx / d; nz = dz / d; }
        pen = rr - d;
      } else {
        const cx = clamp(e.x, o.x0, o.x1), cz = clamp(e.z, o.z0, o.z1);
        const dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else {
          const a = e.x - o.x0, b = o.x1 - e.x, c = e.z - o.z0, d = o.z1 - e.z;
          const m = Math.min(a, b, c, d);
          if (m === a) { nx = -1; pen = a + r; } else if (m === b) { nx = 1; pen = b + r; }
          else if (m === c) { nz = -1; pen = c + r; } else { nz = 1; pen = d + r; }
        }
      }
      e.x += nx * pen; e.z += nz * pen;
      const vn = e.vx * nx + e.vz * nz;
      if (vn < 0) { e.vx -= vn * nx; e.vz -= vn * nz; e.wall = true; }
    }
  }

  _vertical(e, sdt, stepUp) {
    const was = e.grounded;
    e.y += e.vy * sdt;
    if (e.vy > 0) {
      const r = e.r * 0.8;
      const list = this.query(e.x - r, e.z - r, e.x + r, e.z + r);
      const head = e.y + e.h;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o.on || o.nowall || o.y0 >= head || o.y1 <= head - 0.4 || o.y0 < e.y + e.h * 0.5) continue;
        if (o.cyl) { if (Math.hypot(e.x - o.cx, e.z - o.cz) > o.r + r) continue; }
        else if (e.x < o.x0 - r || e.x > o.x1 + r || e.z < o.z0 - r || e.z > o.z1 + r) continue;
        e.y = o.y0 - e.h; e.vy = Math.min(e.vy, 0);
      }
    }
    const gy = this.groundAt(e.x, e.z, e.y + stepUp, 0.2);
    if (e.vy <= 0 && e.y <= gy + 1e-4) { e.y = gy; e.vy = 0; e.grounded = true; e.ground = this.go; }
    else if (was && e.vy <= 0 && e.y - gy <= 0.38 && gy > -1000) { e.y = gy; e.grounded = true; e.ground = this.go; }
    else { e.grounded = false; e.ground = null; }
  }

  // ---- Raycast ----
  raycast(ox, oy, oz, dx, dy, dz, maxT, opts) {
    const rh = this.rh;
    let bestT = maxT, bo = null, bn = null;
    const st = ++this.stamp;
    const hlen = Math.hypot(dx, dz);
    const step = 2.5;
    const nsteps = hlen < 1e-4 ? 1 : Math.ceil(maxT * hlen / step) + 1;
    const noTerrain = opts && opts.noTerrain;
    for (let s = 0; s < nsteps; s++) {
      const tt = Math.min(maxT, s * step / (hlen || 1));
      if (tt > bestT) break;
      const px = ox + dx * tt, pz = oz + dz * tt;
      const cx = Math.floor((px - ORG) / CELL), cz = Math.floor((pz - ORG) / CELL);
      for (let zz = cz - 1; zz <= cz + 1; zz++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || zz < 0 || xx >= DIM || zz >= DIM) continue;
        const c = this.grid[zz * DIM + xx];
        if (!c) continue;
        for (let i = 0; i < c.length; i++) {
          const o = c[i];
          if (o._r === st || !o.on || o.noray) continue;
          o._r = st;
          let t, n0 = 0, n1 = 0, n2 = 0;
          if (o.cyl) {
            const hit = rayCylinder(ox, oy, oz, dx, dy, dz, o.cx, o.cz, o.r, o.y0, o.y1);
            if (hit < 0) continue;
            t = hit;
            const hx = ox + dx * t - o.cx, hz = oz + dz * t - o.cz, hh = Math.hypot(hx, hz) || 1;
            const hy = oy + dy * t;
            if (Math.abs(hy - o.y1) < 0.02) n1 = 1; else if (Math.abs(hy - o.y0) < 0.02) n1 = -1; else { n0 = hx / hh; n2 = hz / hh; }
          } else {
            let tmin = -1e9, tmax = 1e9, nx0 = 0, ny0 = 0, nz0 = 0;
            // x-Slab
            if (Math.abs(dx) < 1e-9) { if (ox < o.x0 || ox > o.x1) continue; }
            else { let t1 = (o.x0 - ox) / dx, t2 = (o.x1 - ox) / dx, sg = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; } if (t1 > tmin) { tmin = t1; nx0 = sg; ny0 = 0; nz0 = 0; } if (t2 < tmax) tmax = t2; }
            if (Math.abs(dy) < 1e-9) { if (oy < o.y0 || oy > o.y1) continue; }
            else { let t1 = (o.y0 - oy) / dy, t2 = (o.y1 - oy) / dy, sg = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; } if (t1 > tmin) { tmin = t1; nx0 = 0; ny0 = sg; nz0 = 0; } if (t2 < tmax) tmax = t2; }
            if (Math.abs(dz) < 1e-9) { if (oz < o.z0 || oz > o.z1) continue; }
            else { let t1 = (o.z0 - oz) / dz, t2 = (o.z1 - oz) / dz, sg = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; sg = 1; } if (t1 > tmin) { tmin = t1; nx0 = 0; ny0 = 0; nz0 = sg; } if (t2 < tmax) tmax = t2; }
            if (tmax < Math.max(tmin, 0)) continue;
            t = tmin < 0 ? 0 : tmin;
            if (tmin < 0) continue; // Start innerhalb: ignorieren
            n0 = nx0; n1 = ny0; n2 = nz0;
          }
          if (t < bestT && t >= 0) { bestT = t; bo = o; bn = [n0, n1, n2]; }
        }
      }
    }
    let terr = false;
    if (!noTerrain) {
      // Terrain-Marsch
      let prevT = 0, prevAbove = oy - this.terrain(ox, oz);
      const ts = 1.8;
      for (let t = ts; ; t += ts) {
        const tt = Math.min(t, bestT);
        const x = ox + dx * tt, z = oz + dz * tt, y = oy + dy * tt;
        const th = this.terrain(x, z);
        const above = th < -1000 ? 1 : y - th;
        if (prevAbove > 0 && above <= 0) {
          let lo = prevT, hi = tt;
          for (let k = 0; k < 9; k++) {
            const mid = (lo + hi) / 2;
            const mh = this.terrain(ox + dx * mid, oz + dz * mid);
            if (oy + dy * mid - mh > 0) lo = mid; else hi = mid;
          }
          if (hi < bestT) { bestT = hi; bo = null; terr = true; }
          break;
        }
        prevT = tt; prevAbove = above;
        if (tt >= bestT) break;
      }
    }
    if (bestT >= maxT && !bo && !terr) return -1;
    rh.obj = bo; rh.terrain = terr;
    if (terr) {
      const x = ox + dx * bestT, z = oz + dz * bestT;
      const hx = this.terrain(x - 1, z) - this.terrain(x + 1, z), hz = this.terrain(x, z - 1) - this.terrain(x, z + 1);
      const l = Math.hypot(hx, 2, hz);
      rh.nx = hx / l; rh.ny = 2 / l; rh.nz = hz / l;
    } else if (bn) { rh.nx = bn[0]; rh.ny = bn[1]; rh.nz = bn[2]; }
    return bestT;
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05) < 0;
  }
}

export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  let tbest = -1;
  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0) continue;
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) { tbest = t; break; }
      }
    }
  }
  if (Math.abs(dy) > 1e-9) {
    for (const yy of [y1, y0]) {
      const t = (yy - oy) / dy;
      if (t < 0 || (tbest >= 0 && t >= tbest)) continue;
      const x = px + dx * t, z = pz + dz * t;
      if (x * x + z * z <= r * r) tbest = t;
    }
  }
  return tbest;
}
