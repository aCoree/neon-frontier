// Kleine Helfer, die Server UND Client benutzen (reines ES-Modul, keine Browser-APIs).
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const round = (v, p = 100) => Math.round(v * p) / p;

// Deterministische Streuung (Server & Client berechnen dieselben Schrotkugeln aus demselben Seed)
export function spreadDirs(dir, spread, count, seed) {
  const rng = mulberry32(seed | 0);
  // orthonormale Basis zu dir
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dir[1]) > 0.95) { ux = 1; uy = 0; }
  let rx = uy * dir[2] - uz * dir[1], ry = uz * dir[0] - ux * dir[2], rz = ux * dir[1] - uy * dir[0];
  let l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
  const tx = dir[1] * rz - dir[2] * ry, ty = dir[2] * rx - dir[0] * rz, tz = dir[0] * ry - dir[1] * rx;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * spread;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    let x = dir[0] + rx * ox + tx * oy, y = dir[1] + ry * ox + ty * oy, z = dir[2] + rz * ox + tz * oy;
    l = Math.hypot(x, y, z) || 1;
    out.push([x / l, y / l, z / l]);
  }
  return out;
}
