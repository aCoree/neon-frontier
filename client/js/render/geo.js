// Geometrie-Bausteine: Meter-basierte UVs, Fake-AO per Vertexfarbe, Batches zum Mergen, Vegetation-Meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from '../shared/util.js';

export class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

const FACES = [
  // normal, u-axis(world axis idx for u), v-axis, corner verts (local unit coords)
  { n: [1, 0, 0], u: 2, v: 1, c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], u: 2, v: 1, c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], u: 0, v: 2, c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], u: 0, v: 2, c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], u: 0, v: 1, c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], u: 0, v: 1, c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

export function addBox(b, p, tile) {
  const hx = p.w / 2, hy = p.h / 2, hz = p.d / 2;
  const cx = p.x, cy = p.y + hy, cz = p.z;
  const rot = !!(p.ry || p.rx || p.rz);
  if (rot) { _e.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ'); _q.setFromEuler(_e); }
  const t = 0.93 + hash(cx, cz) * 0.14;
  const tint = p.tint || [1, 1, 1];
  const ao = !p.noao && p.h > 1.2;
  const sc = [hx, hy, hz], cen = [cx, cy, cz];
  for (const f of FACES) {
    const base = b.n;
    for (const c of f.c) {
      let lx = c[0] * hx, ly = c[1] * hy, lz = c[2] * hz;
      _v.set(lx, ly, lz); if (rot) _v.applyQuaternion(_q);
      const wx = _v.x + cx, wy = _v.y + cy, wz = _v.z + cz;
      b.pos.push(wx, wy, wz);
      _n.set(f.n[0], f.n[1], f.n[2]); if (rot) _n.applyQuaternion(_q);
      b.nor.push(_n.x, _n.y, _n.z);
      // UV in Metern (Pre-Rotation-Koordinaten + Mittelpunkt -> nahtlos zwischen Nachbarn)
      const loc = [lx + cx, ly + cy, lz + cz];
      b.uv.push(loc[f.u] / tile, loc[f.v] / tile);
      let k = t;
      if (ao) {
        if (f.n[1] > 0.5) k *= 1.0; else if (f.n[1] < -0.5) k *= 0.55;
        else k *= 0.6 + 0.4 * Math.min(1, Math.max(0, (ly + hy) / 3.2));
      }
      b.col.push(k * tint[0], k * tint[1], k * tint[2]);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    b.n += 4;
  }
}

export function addCyl(b, p, tile) {
  const seg = p.seg || 12, r0 = p.r, r1 = p.r2 ?? p.r, h = p.h;
  const rot = !!(p.ry || p.rx || p.rz);
  if (rot) { _e.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ'); _q.setFromEuler(_e); }
  const cx = p.x, cy = p.y + h / 2, cz = p.z;
  const t = 0.94 + hash(cx, cz) * 0.12;
  const slope = (r0 - r1) / h;
  const ring = (y, r, v, k, i) => {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    _v.set(ca * r, y, sa * r); _n.set(ca, slope, sa).normalize();
    if (rot) { _v.applyQuaternion(_q); _n.applyQuaternion(_q); }
    b.pos.push(_v.x + cx, _v.y + cy, _v.z + cz); b.nor.push(_n.x, _n.y, _n.z);
    b.uv.push((i / seg) * Math.PI * 2 * Math.max(r0, 0.5) / tile, (p.y + (y + h / 2)) / tile);
    b.col.push(k * t, k * t, k * t);
  };
  const base = b.n;
  const ao = (p.h > 1.5);
  for (let i = 0; i <= seg; i++) { ring(-h / 2, r0, 0, ao ? 0.62 : 1, i); ring(h / 2, r1, 1, 1, i); }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  b.n += (seg + 1) * 2;
  // Deckel
  const cap = (y, r, up) => {
    if (r < 0.04) return;
    const c0 = b.n;
    _v.set(0, y, 0); _n.set(0, up, 0); if (rot) { _v.applyQuaternion(_q); _n.applyQuaternion(_q); }
    b.pos.push(_v.x + cx, _v.y + cy, _v.z + cz); b.nor.push(_n.x, _n.y, _n.z); b.uv.push(cx / tile, cz / tile); b.col.push(t, t, t);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      _v.set(Math.cos(a) * r, y, Math.sin(a) * r); if (rot) _v.applyQuaternion(_q);
      b.pos.push(_v.x + cx, _v.y + cy, _v.z + cz); b.nor.push(_n.x, _n.y, _n.z);
      b.uv.push((cx + Math.cos(a) * r) / tile, (cz + Math.sin(a) * r) / tile); b.col.push(t, t, t);
    }
    for (let i = 0; i < seg; i++) up > 0 ? b.idx.push(c0, c0 + 2 + i, c0 + 1 + i) : b.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
    b.n += seg + 2;
  };
  cap(h / 2, r1, 1); if (!p.open) cap(-h / 2, r0, -1);
}

export function addSphere(b, p) {
  const g = new THREE.SphereGeometry(p.r, 28, 14, 0, Math.PI * 2, 0, p.half ? Math.PI / 2 : Math.PI);
  g.scale(p.sx || 1, p.sy || 1, p.sz || 1); g.translate(p.x, p.y, p.z);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, base = b.n;
  for (let i = 0; i < pos.count; i++) { b.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i)); b.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i)); b.uv.push(uv.getX(i) * 4, uv.getY(i) * 4); b.col.push(1, 1, 1); }
  for (const i of g.index.array) b.idx.push(base + i);
  b.n += pos.count; g.dispose();
}

export function addRibbon(b, p, terrainY) {
  const pts = [];
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 2.5));
    for (let k = 0; k < n; k++) pts.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
  }
  pts.push(p.pts[p.pts.length - 1]);
  // Glätten (Catmull-ähnlich, leichte Kurven)
  const sm = pts.map((q, i) => { if (i === 0 || i === pts.length - 1) return q; const a = pts[i - 1], c = pts[i + 1]; return [(a[0] + 2 * q[0] + c[0]) / 4, (a[1] + 2 * q[1] + c[1]) / 4]; });
  let dist = 0;
  for (let i = 0; i < sm.length; i++) {
    const a = sm[Math.max(0, i - 1)], c = sm[Math.min(sm.length - 1, i + 1)];
    let dx = c[0] - a[0], dz = c[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx, q = sm[i], hw = p.w / 2;
    if (i > 0) dist += Math.hypot(q[0] - sm[i - 1][0], q[1] - sm[i - 1][1]);
    for (const s of [-1, 1]) {
      const x = q[0] + nx * hw * s, z = q[1] + nz * hw * s;
      b.pos.push(x, terrainY(x, z) + p.off, z); b.nor.push(0, 1, 0); b.uv.push(s < 0 ? 0 : 1, dist / p.tile); b.col.push(1, 1, 1);
    }
    if (i > 0) { const k = b.n; b.idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    b.n += 2;
  }
}

// ---------- Vegetation ----------
function colorize(g, hex, jitter = 0, seed = 1) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (noise2(g.attributes.position.getX(i) * 3.1 + seed, g.attributes.position.getY(i) * 3.7 + g.attributes.position.getZ(i) * 2.3) - 0.5) * jitter : 1;
    arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
function strip(g) { g.deleteAttribute('uv'); return g; }
function noisyIco(r, detail, amp, seed) {
  let g = new THREE.IcosahedronGeometry(r, detail); if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (noise2(p.getX(i) * 1.7 + seed, p.getZ(i) * 1.7 + p.getY(i) * 1.3) - 0.5) * amp;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals(); return g;
}
const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const merge = (list) => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)), false);

export function treeGeos() {
  const out = {};
  // Kiefer
  {
    const l = [colorize(strip(T(new THREE.CylinderGeometry(0.2, 0.34, 3, 6), 0, 1.5, 0)), 0x5a3e28, 0.2)];
    const cols = [0x1f5a35, 0x25663b, 0x2b7342, 0x337d4a];
    for (let i = 0; i < 4; i++) l.push(colorize(strip(T(new THREE.ConeGeometry(2.3 - i * 0.5, 3.0 - i * 0.2, 8), 0, 3.0 + i * 1.7, 0)), cols[i], 0.25, i));
    out.pine = merge(l);
    out.pineFar = merge([colorize(strip(T(new THREE.CylinderGeometry(0.25, 0.3, 3, 4), 0, 1.5, 0)), 0x5a3e28), colorize(strip(T(new THREE.ConeGeometry(2.0, 8.5, 5), 0, 6.8, 0)), 0x25663b, 0.2)]);
  }
  // Eiche
  {
    const l = [colorize(strip(T(new THREE.CylinderGeometry(0.28, 0.45, 3.6, 7), 0, 1.8, 0)), 0x5b4129, 0.2)];
    const blobs = [[0, 5.4, 0, 2.6], [1.5, 4.6, 0.6, 1.9], [-1.4, 4.8, -0.7, 2.0], [0.3, 6.7, -0.4, 1.7], [0.2, 4.2, 1.5, 1.7]];
    blobs.forEach(([x, y, z, r], i) => l.push(colorize(strip(T(noisyIco(r, 1, 0.35, i * 3), x, y, z)), [0x3f8a3a, 0x4a9a40, 0x377d36, 0x5aa646, 0x438f3c][i], 0.2, i)));
    out.oak = merge(l);
    out.oakFar = merge([colorize(strip(T(new THREE.CylinderGeometry(0.3, 0.45, 3.6, 4), 0, 1.8, 0)), 0x5b4129), colorize(strip(T(new THREE.IcosahedronGeometry(3.0, 0), 0, 5.4, 0)), 0x429038)]);
  }
  // Birke
  {
    const l = [colorize(strip(T(new THREE.CylinderGeometry(0.12, 0.2, 5, 6), 0, 2.5, 0)), 0xe8e6dc, 0.1)];
    for (let i = 0; i < 6; i++) l.push(colorize(strip(T(new THREE.BoxGeometry(0.28, 0.08, 0.28), 0.0, 0.8 + i * 0.7, 0)), 0x2a2a2a));
    [[0, 6.0, 0, 1.9], [0.9, 5.2, 0.4, 1.4], [-0.9, 5.4, -0.4, 1.5]].forEach(([x, y, z, r], i) => l.push(colorize(strip(T(noisyIco(r, 1, 0.3, i * 2 + 9), x, y, z)), [0x8cc152, 0x9ccf5c, 0x7ab648][i], 0.2, i)));
    out.birch = merge(l);
    out.birchFar = merge([colorize(strip(T(new THREE.CylinderGeometry(0.15, 0.2, 5, 4), 0, 2.5, 0)), 0xe8e6dc), colorize(strip(T(new THREE.IcosahedronGeometry(2.1, 0), 0, 5.8, 0)), 0x8cc152)]);
  }
  // Palme
  {
    const l = [];
    for (let i = 0; i < 7; i++) { const t = i / 7, g = new THREE.CylinderGeometry(0.2 - t * 0.05, 0.24 - t * 0.05, 1.2, 6); g.translate(0, 0.6 + i * 1.1, 0); g.rotateZ(0); const bend = t * t * 0.5; g.translate(bend * 0.0, 0, 0); l.push(colorize(strip(g), i % 2 ? 0x8a6a45 : 0x7a5a3a, 0.1)); }
    l[l.length - 1].translate(0.0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const f = new THREE.PlaneGeometry(0.9, 3.6, 1, 4); f.translate(0, 1.8, 0);
      const p = f.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, -y * y * 0.12); }
      f.rotateX(-0.5); f.rotateY((i / 8) * Math.PI * 2); f.translate(0, 7.6, 0);
      l.push(colorize(strip(f), i % 2 ? 0x3d8f3a : 0x4aa044, 0.2, i));
    }
    for (let i = 0; i < 3; i++) l.push(colorize(strip(T(new THREE.SphereGeometry(0.28, 6, 5), Math.cos(i * 2.1) * 0.35, 7.3, Math.sin(i * 2.1) * 0.35)), 0x6b4a2a));
    out.palm = merge(l); out.palmFar = out.palm;
  }
  // Toter Baum
  {
    const l = [colorize(strip(T(new THREE.CylinderGeometry(0.14, 0.34, 5.5, 6), 0, 2.75, 0)), 0x4a3f36, 0.25)];
    [[0.9, 3.4, 0.2, 1.0, -0.9], [-0.8, 4.2, -0.3, 0.9, 1.0], [0.4, 5.0, 0.5, 0.7, -0.6]].forEach(([x, y, z, h, r]) => { const g = new THREE.CylinderGeometry(0.05, 0.11, 2 * h, 5); g.rotateZ(r); g.translate(x, y, z); l.push(colorize(strip(g), 0x4a3f36, 0.2)); });
    out.dead = merge(l); out.deadFar = out.dead;
  }
  return out;
}

export function smallGeos() {
  const o = {};
  const bush = [];
  [[0, 0.5, 0, 0.8], [0.6, 0.4, 0.2, 0.55], [-0.5, 0.35, -0.2, 0.55]].forEach(([x, y, z, r], i) => bush.push(colorize(strip(T(noisyIco(r, 1, 0.3, i), x, y, z)), [0x3f7a35, 0x4a8a3c, 0x376e2f][i], 0.25, i)));
  o.bush = merge(bush);
  const rock = (r, seed, c) => colorize(strip(noisyIco(r, 1, 0.75, seed)), c, 0.35, seed);
  o.rock1 = rock(0.9, 1, 0x80796f); o.rock2 = rock(1.1, 7, 0x6e6a66); o.rock3 = merge([rock(1.6, 4, 0x77726b), T(rock(1.0, 8, 0x6a665f), 1.3, -0.3, 0.5)]);
  for (const k of ['rock1', 'rock2', 'rock3']) o[k].translate(0, 0.35, 0);
  o.flower = merge([colorize(strip(T(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), 0, 0.22, 0)), 0x3d7a35), colorize(strip(T(new THREE.SphereGeometry(0.11, 6, 4), 0, 0.48, 0)), 0xffffff)]);
  o.mush = merge([colorize(strip(T(new THREE.CylinderGeometry(0.06, 0.09, 0.35, 6), 0, 0.17, 0)), 0xe8e0d0), colorize(strip(T(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.33, 0)), 0xa86bff), colorize(strip(T(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 5), 0.3, 0.1, 0.1)), 0xe8e0d0), colorize(strip(T(new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.3, 0.2, 0.1)), 0x6bd4ff)]);
  // Gras-Büschel (3 gekreuzte Dreiecke mit Verlauf)
  const gl = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry(), w = 0.12, h = 0.55;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.0, h, 0, -w * 0.6, 0.0, 0.0, w * 0.6, 0.35, 0], 3));
    g.setIndex([0, 1, 2]); g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.18, 0.32, 0.12, 0.18, 0.32, 0.12, 0.62, 0.85, 0.35], 3));
    g.rotateY(i * Math.PI / 3); gl.push(g);
  }
  o.grass = mergeGeometries(gl.map(g => g.toNonIndexed()), false);
  return o;
}

export function rngColor(seed) { const r = mulberry32(seed); return () => r(); }
