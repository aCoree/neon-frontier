// Prozedurale Texturen & Materialien (alles per Canvas – keine externen Assets nötig).
import * as THREE from 'three';
import { mulberry32, noise2, fbm } from '../shared/util.js';

const rng = mulberry32(99);
const mk = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };
const css = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const shade = (hex, f) => { const [r, g, b] = rgb(hex); return css(r * f, g * f, b * f); };

function grain(ctx, w, h, amt) {
  const d = ctx.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const n = (rng() - 0.5) * amt; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
  ctx.putImageData(d, 0, 0);
}
function blotches(ctx, w, h, n, col, aMax = 0.12, rMin = 10, rMax = 60) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = rMin + rng() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = col(); g.addColorStop(0, c.replace('A', (rng() * aMax).toFixed(3))); g.addColorStop(1, c.replace('A', '0'));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function toTex(canvas, o = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function fbmCanvas(w, h, sc, c0, c1, oct = 4, off = 0) {
  const c = mk(w, h), ctx = c.getContext('2d'), d = ctx.createImageData(w, h);
  const [r0, g0, b0] = rgb(c0), [r1, g1, b1] = rgb(c1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // nahtlos: Torus-Mapping über zwei Perioden-Mix
    const u = x / w, v = y / h;
    const f = (p, q) => fbm(p * sc + off, q * sc + off, oct);
    const n = (f(u, v) * (1 - u) * (1 - v) + f(u - 1, v) * u * (1 - v) + f(u, v - 1) * (1 - u) * v + f(u - 1, v - 1) * u * v);
    const t = Math.min(1, Math.max(0, (n - 0.2) * 1.7)), i = (y * w + x) * 4;
    d.data[i] = r0 + (r1 - r0) * t; d.data[i + 1] = g0 + (g1 - g0) * t; d.data[i + 2] = b0 + (b1 - b0) * t; d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0); return c;
}

// ---------- Painter ----------
const P = {
  solid(base, g = 10, blot = true) { const c = mk(256), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 256); if (blot) blotches(x, 256, 256, 14, () => 'rgba(0,0,0,A)', 0.1); grain(x, 256, 256, g); return c; },
  concrete(base = '#9a9fa4', lines = true) {
    const c = mk(512), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, 40, () => (rng() > 0.5 ? 'rgba(0,0,0,A)' : 'rgba(255,255,255,A)'), 0.1, 20, 90);
    if (lines) { x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 2; for (let i = 0; i <= 512; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); } x.strokeStyle = 'rgba(255,255,255,0.08)'; for (let i = 3; i <= 512; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); } }
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; x.beginPath(); let px = rng() * 512, py = rng() * 512; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rng() - 0.5) * 40; py += rng() * 30; x.lineTo(px, py); } x.stroke(); }
    grain(x, 512, 512, 16); return c;
  },
  bricks(base = '#9b4b36', mortar = '#b9b2a4') {
    const c = mk(512), x = c.getContext('2d'); x.fillStyle = mortar; x.fillRect(0, 0, 512, 512);
    const bh = 32, bw = 80;
    for (let r = 0; r < 16; r++) for (let q = -1; q < 7; q++) {
      const ox = (r % 2) * bw / 2, f = 0.82 + rng() * 0.3; x.fillStyle = shade(base, f); x.fillRect(q * bw + ox + 2, r * bh + 2, bw - 4, bh - 4);
    }
    blotches(x, 512, 512, 25, () => 'rgba(0,0,0,A)', 0.14, 20, 80); grain(x, 512, 512, 14); return c;
  },
  planks(base = '#8a5f3a', horiz = true) {
    const c = mk(256), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    const n = 8, s = 256 / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = shade(base, 0.8 + rng() * 0.35); if (horiz) x.fillRect(0, i * s + 1, 256, s - 2); else x.fillRect(i * s + 1, 0, s - 2, 256);
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1;
      for (let k = 0; k < 9; k++) { x.beginPath(); const p = i * s + 2 + rng() * (s - 4); if (horiz) { x.moveTo(rng() * 60, p); x.lineTo(150 + rng() * 106, p + (rng() - 0.5) * 3); } else { x.moveTo(p, rng() * 60); x.lineTo(p + (rng() - 0.5) * 3, 150 + rng() * 106); } x.stroke(); }
    }
    grain(x, 256, 256, 10); return c;
  },
  logs(base = '#7a5030') {
    const c = mk(256), x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const g = x.createLinearGradient(0, i * 32, 0, i * 32 + 32); g.addColorStop(0, shade(base, 0.55)); g.addColorStop(0.35, shade(base, 1.15)); g.addColorStop(0.7, shade(base, 0.9)); g.addColorStop(1, shade(base, 0.5));
      x.fillStyle = g; x.fillRect(0, i * 32, 256, 32);
      x.strokeStyle = 'rgba(0,0,0,0.2)'; for (let k = 0; k < 6; k++) { x.beginPath(); const y = i * 32 + 4 + rng() * 24; x.moveTo(rng() * 100, y); x.lineTo(120 + rng() * 136, y); x.stroke(); }
    }
    grain(x, 256, 256, 12); return c;
  },
  ribs(base, n = 16, vertical = true, rust = 0.1) {
    const c = mk(256), x = c.getContext('2d'); const s = 256 / n;
    for (let i = 0; i < n; i++) {
      const g = vertical ? x.createLinearGradient(i * s, 0, (i + 1) * s, 0) : x.createLinearGradient(0, i * s, 0, (i + 1) * s);
      g.addColorStop(0, shade(base, 0.62)); g.addColorStop(0.45, shade(base, 1.18)); g.addColorStop(1, shade(base, 0.7));
      x.fillStyle = g; vertical ? x.fillRect(i * s, 0, s + 1, 256) : x.fillRect(0, i * s, 256, s + 1);
    }
    if (rust) blotches(x, 256, 256, 18, () => 'rgba(120,60,20,A)', rust * 2, 8, 40);
    blotches(x, 256, 256, 10, () => 'rgba(0,0,0,A)', 0.14, 15, 60); grain(x, 256, 256, 12); return c;
  },
  tech(base = '#d9e0e6', line = '#7ee8ff', dark = false) {
    const c = mk(512), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const px = i * 128, py = j * 128, f = 0.93 + rng() * 0.1;
      x.fillStyle = shade(base, f); x.fillRect(px + 4, py + 4, 120, 120);
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; x.strokeRect(px + 4, py + 4, 120, 120);
      x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 1.5; x.strokeRect(px + 8, py + 8, 112, 112);
      x.fillStyle = 'rgba(0,0,0,0.4)'; for (const [dx, dy] of [[14, 14], [114, 14], [14, 114], [114, 114]]) { x.beginPath(); x.arc(px + dx, py + dy, 3, 0, 6.3); x.fill(); }
      if (rng() < 0.18) { x.fillStyle = line; x.fillRect(px + 30, py + 60, 68, 4); }
    }
    blotches(x, 512, 512, 20, () => 'rgba(0,0,0,A)', 0.12, 20, 70); grain(x, 512, 512, 10); return c;
  },
  facade(wall, win, cols, rows, litChance, litCols, opts = {}) {
    // liefert {map, emi} – Kachel = 4 Etagen
    const S = 512, c = mk(S), e = mk(S), x = c.getContext('2d'), xe = e.getContext('2d');
    x.fillStyle = wall; x.fillRect(0, 0, S, S); blotches(x, S, S, 30, () => 'rgba(0,0,0,A)', 0.1, 20, 80);
    xe.fillStyle = '#000'; xe.fillRect(0, 0, S, S);
    const cw = S / cols, rh = S / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const wx = q * cw + cw * 0.14, wy = r * rh + rh * 0.2, ww = cw * 0.72, wh = rh * 0.58;
      const lit = rng() < litChance, col = litCols[Math.floor(rng() * litCols.length)];
      const g = x.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh); g.addColorStop(0, opts.glassA || '#5c7a96'); g.addColorStop(1, opts.glassB || '#1b2a3b');
      x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(wx, wy + wh * 0.7); x.lineTo(wx + ww * 0.6, wy); x.lineTo(wx + ww * 0.85, wy); x.lineTo(wx + ww * 0.15, wy + wh); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 3; x.strokeRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(wx - 2, wy + wh, ww + 4, 5);
      if (lit) { xe.fillStyle = col; xe.fillRect(wx + 3, wy + 3, ww - 6, wh - 6); }
    }
    grain(x, S, S, 10); return { map: c, emi: e };
  },
  curtain(tint, cols, rows, litChance, litCols) {
    const S = 512, c = mk(S), e = mk(S), x = c.getContext('2d'), xe = e.getContext('2d');
    const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, tint[0]); g.addColorStop(0.5, tint[1]); g.addColorStop(1, tint[2]);
    x.fillStyle = g; x.fillRect(0, 0, S, S); xe.fillStyle = '#000'; xe.fillRect(0, 0, S, S);
    const cw = S / cols, rh = S / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      x.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.09})`; x.fillRect(q * cw, r * rh, cw, rh);
      if (rng() < litChance) { xe.fillStyle = litCols[Math.floor(rng() * litCols.length)]; xe.globalAlpha = 0.55 + rng() * 0.45; xe.fillRect(q * cw + 2, r * rh + 2, cw - 4, rh - 4); xe.globalAlpha = 1; }
    }
    x.strokeStyle = 'rgba(10,15,25,0.9)'; x.lineWidth = 4; for (let i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(i * cw, 0); x.lineTo(i * cw, S); x.stroke(); }
    x.lineWidth = 6; for (let i = 0; i <= rows; i += 2) { x.beginPath(); x.moveTo(0, i * rh); x.lineTo(S, i * rh); x.stroke(); }
    grain(x, S, S, 8); return { map: c, emi: e };
  },
  stucco(base) { const c = mk(256), x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 256); blotches(x, 256, 256, 22, () => 'rgba(0,0,0,A)', 0.08, 20, 70); blotches(x, 256, 256, 14, () => 'rgba(255,255,255,A)', 0.1, 10, 40); grain(x, 256, 256, 22); return c; },
  roofTile(base = '#b5542f') {
    const c = mk(256), x = c.getContext('2d'); x.fillStyle = shade(base, 0.6); x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 12; r++) for (let q = -1; q < 9; q++) {
      const ox = (r % 2) * 16; const f = 0.85 + rng() * 0.3; const g = x.createLinearGradient(0, r * 21, 0, r * 21 + 24); g.addColorStop(0, shade(base, f * 1.15)); g.addColorStop(1, shade(base, f * 0.7));
      x.fillStyle = g; x.beginPath(); x.roundRect(q * 32 + ox, r * 21, 30, 24, 8); x.fill();
    }
    grain(x, 256, 256, 14); return c;
  },
  hazard(a = '#f2c200', b = '#16161a') { const c = mk(128), x = c.getContext('2d'); x.fillStyle = b; x.fillRect(0, 0, 128, 128); x.fillStyle = a; for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 16 + 128, 128); x.lineTo(i * 32 + 128, 128); x.fill(); } grain(x, 128, 128, 18); return c; },
  asphalt() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#34363b'; x.fillRect(0, 0, 256, 256); blotches(x, 256, 256, 30, () => 'rgba(0,0,0,A)', 0.2, 10, 50); blotches(x, 256, 256, 20, () => 'rgba(255,255,255,A)', 0.05, 8, 30); grain(x, 256, 256, 32); for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(200,200,200,${rng() * 0.25})`; x.fillRect(rng() * 256, rng() * 256, 1.5, 1.5); } return c; },
  sidewalk() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#8b8d90'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); } blotches(x, 256, 256, 18, () => 'rgba(0,0,0,A)', 0.1); grain(x, 256, 256, 14); return c; },
  line() { const c = mk(64, 256), x = c.getContext('2d'); x.fillStyle = '#e8e8e0'; for (let i = 0; i < 256; i += 64) x.fillRect(8, i, 48, 40); return c; },
  checker(a = '#e9edf0', b = '#c3cbd1') { const c = mk(256), x = c.getContext('2d'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * 64, j * 64, 64, 64); } x.strokeStyle = 'rgba(0,0,0,0.2)'; x.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); } grain(x, 256, 256, 10); return c; },
  grate() { const c = mk(128), x = c.getContext('2d'); x.fillStyle = '#2a2d31'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#0c0d0f'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) x.fillRect(i * 16 + 3, j * 16 + 3, 10, 10); grain(x, 128, 128, 10); return c; },
  solar() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#1b2f55'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(200,220,255,0.55)'; x.lineWidth = 2; for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); } const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return c; },
  lighthouse() { const c = mk(128, 256), x = c.getContext('2d'); x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#c22b2b'; x.fillRect(0, 0, 128, 64); x.fillRect(0, 128, 128, 64); blotches(x, 128, 256, 12, () => 'rgba(0,0,0,A)', 0.12, 10, 40); grain(x, 128, 256, 14); return c; },
  hay() { const c = mk(128), x = c.getContext('2d'); x.fillStyle = '#c9a548'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 260; i++) { x.strokeStyle = shade('#c9a548', 0.7 + rng() * 0.6); x.beginPath(); const px = rng() * 128, py = rng() * 128; x.moveTo(px, py); x.lineTo(px + (rng() - 0.5) * 30, py + (rng() - 0.5) * 6); x.stroke(); } return c; },
  barn() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#9c2c25'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { x.fillStyle = shade('#9c2c25', 0.85 + rng() * 0.3); x.fillRect(i * 16 + 1, 0, 14, 256); } x.fillStyle = '#f0e6d8'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 246, 256, 10); blotches(x, 256, 256, 12, () => 'rgba(0,0,0,A)', 0.15); grain(x, 256, 256, 14); return c; },
  camo() { const c = fbmCanvas(256, 256, 4, '#4b5a38', '#6d7a4c', 3, 7); const x = c.getContext('2d'); grain(x, 256, 256, 12); return c; },
  crate() { const c = mk(128), x = c.getContext('2d'); x.fillStyle = '#6a5a3a'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#3a301c'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120); x.lineWidth = 6; x.beginPath(); x.moveTo(4, 4); x.lineTo(124, 124); x.moveTo(124, 4); x.lineTo(4, 124); x.stroke(); grain(x, 128, 128, 16); return c; },
  target() { const c = mk(128), x = c.getContext('2d'); const cols = ['#f5f5f5', '#d62828', '#f5f5f5', '#d62828', '#f5f5f5']; for (let i = 0; i < 5; i++) { x.fillStyle = cols[i]; x.beginPath(); x.arc(64, 64, 62 - i * 12, 0, 6.3); x.fill(); } return c; },
  stripes(a, b, n = 6) { const c = mk(128), x = c.getContext('2d'); for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * 128 / n, 0, 128 / n, 128); } return c; },
  vault() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#3a4048'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#f2c200'; x.lineWidth = 10; x.strokeRect(8, 8, 240, 240); x.strokeStyle = '#1b1f24'; x.lineWidth = 6; x.beginPath(); x.arc(128, 128, 70, 0, 6.3); x.stroke(); x.beginPath(); x.arc(128, 128, 20, 0, 6.3); x.stroke(); for (let a = 0; a < 6.3; a += 0.785) { x.beginPath(); x.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20); x.lineTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); x.stroke(); } grain(x, 256, 256, 12); return c; },
  gate() { const c = mk(256), x = c.getContext('2d'); x.fillStyle = '#c8d0d8'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#7ee8ff'; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 64 + 20); x.lineTo(128, i * 64 + 52); x.lineTo(256, i * 64 + 20); x.lineTo(256, i * 64 + 32); x.lineTo(128, i * 64 + 64); x.lineTo(0, i * 64 + 32); x.fill(); } x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 252); grain(x, 256, 256, 10); return c; },
  pipe() { const c = mk(128), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#444'); g.addColorStop(0.4, '#9aa'); g.addColorStop(1, '#333'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); grain(x, 128, 128, 14); return c; },
};

function standard(map, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, vertexColors: o.vc !== false, side: o.side ?? THREE.FrontSide });
  if (o.emi) { m.emissiveMap = o.emi; m.emissive = new THREE.Color(o.emiColor ?? 0xffffff); m.emissiveIntensity = 0; m.userData.night = o.emiK ?? 2.2; }
  if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 0.5; m.depthWrite = false; }
  if (o.env !== undefined) m.envMapIntensity = o.env;
  m.userData.tile = o.tile ?? 4;
  return m;
}
function glowMat(hex, k = 2.0, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, vertexColors: false, transparent: !!o.opacity, opacity: o.opacity ?? 1 });
  m.userData.tile = o.tile ?? 4; m.userData.glow = { hex, k };
  return m;
}
const solid = (hex, o = {}) => standard(null, { color: hex, ...o });

export function createMaterials(renderer) {
  const T = (c, opts) => toTex(c, opts);
  const M = {};
  const fa = P.facade('#b9b3a6', null, 4, 4, 0.34, ['#ffd9a0', '#ffe9c4', '#cfe8ff', '#ffcf8a'], {});
  const fb = P.facade('#6b727c', null, 4, 4, 0.3, ['#ffd9a0', '#bfe6ff', '#ffb0d0', '#fff1c8'], { glassA: '#7aa0c0', glassB: '#243247' });
  const cw = P.curtain(['#5b86b0', '#3a5a82', '#25405f'], 8, 16, 0.3, ['#ffe9c0', '#bff3ff', '#ffc3e8', '#fff7d8']);
  const mkF = (f, k) => standard(T(f.map), { rough: 0.55, metal: 0.25, emi: T(f.emi), emiK: k, tile: 14.4, env: 0.7 });
  M.facadeA = mkF(fa, 0.85); M.facadeB = mkF(fb, 0.85); M.glassTower = standard(T(cw.map), { rough: 0.18, metal: 0.75, emi: T(cw.emi), emiK: 1.0, tile: 14.4, env: 1.4 });
  M.shop = standard(T(P.facade('#7a6f66', null, 3, 1, 0.8, ['#fff0d0', '#ffd6f0', '#d8f4ff'], { glassA: '#9ab7d0', glassB: '#2d3b4d' }).map), { rough: 0.5, tile: 12, env: 0.6 });
  const shopF = P.facade('#7a6f66', null, 3, 1, 0.8, ['#fff0d0', '#ffd6f0', '#d8f4ff'], { glassA: '#9ab7d0', glassB: '#2d3b4d' });
  M.shop = standard(T(shopF.map), { rough: 0.5, emi: T(shopF.emi), emiK: 1.2, tile: 12, env: 0.6 });
  M.concrete = standard(T(P.concrete()), { tile: 4 });
  M.concreteDark = standard(T(P.concrete('#6a6e73')), { tile: 4 });
  M.plaster = standard(T(P.stucco('#d8d2c6')), { tile: 4 });
  M.woodIn = standard(T(P.planks('#9a7048', false)), { tile: 3 });
  M.labIn = standard(T(P.tech('#dfe8e4', '#58ff9a')), { tile: 4 });
  M.rockBrickIn = standard(T(P.bricks('#7d7468', '#8c8579')), { tile: 3 });
  M.techWallIn = standard(T(P.tech('#aeb7c0', '#7ee8ff')), { tile: 4 });
  M.corrugatedIn = standard(T(P.ribs('#8a929a', 16, true, 0.05)), { tile: 4 });
  M.brick = standard(T(P.bricks()), { tile: 5 });
  M.brickDark = standard(T(P.bricks('#6f3a2e', '#8c8272')), { tile: 5 });
  M.rockBrick = standard(T(P.bricks('#8a8478', '#6b665c')), { tile: 3 });
  M.metal = standard(T(P.ribs('#9aa3ab', 4, false, 0.05)), { rough: 0.45, metal: 0.8, tile: 3, env: 1.2 });
  M.metalDark = standard(T(P.ribs('#3a3f45', 4, false, 0.04)), { rough: 0.5, metal: 0.75, tile: 3, env: 1.0 });
  M.metalGrate = standard(T(P.grate()), { rough: 0.6, metal: 0.7, tile: 1.2 });
  M.corrugated = standard(T(P.ribs('#9aa6ad', 20)), { rough: 0.6, metal: 0.55, tile: 6, env: 0.8 });
  M.corrugatedBlue = standard(T(P.ribs('#4b6f95', 20)), { rough: 0.6, metal: 0.5, tile: 6, env: 0.8 });
  M.rust = standard(T(P.ribs('#8a4a28', 8, true, 0.3)), { rough: 0.85, metal: 0.4, tile: 3 });
  M.pipe = standard(T(P.pipe()), { rough: 0.4, metal: 0.8, tile: 2, env: 1 });
  M.siloMetal = standard(T(P.ribs('#c3cbd0', 24, true, 0.05)), { rough: 0.45, metal: 0.7, tile: 5, env: 1 });
  M.tankMetal = standard(T(P.ribs('#d8dbd6', 10, false, 0.05)), { rough: 0.5, metal: 0.55, tile: 5, env: 0.8 });
  M.craneYellow = standard(T(P.ribs('#e0b020', 6, false, 0.05)), { rough: 0.55, metal: 0.4, tile: 4 });
  M.stairs = standard(T(P.concrete('#8a8e92', false)), { tile: 2 });
  M.tileFloor = standard(T(P.checker()), { rough: 0.35, tile: 2, env: 0.6 });
  M.plank = standard(T(P.planks('#946a42', false)), { tile: 2 });
  M.wood = standard(T(P.planks('#7e5736', true)), { tile: 2 });
  M.woodRoof = standard(T(P.planks('#5b4030', true)), { tile: 3 });
  M.logs = standard(T(P.logs()), { tile: 2.2 });
  M.logsBark = standard(T(P.logs('#4a3320')), { tile: 3 });
  M.tile = standard(T(P.roofTile()), { tile: 3 });
  M.roofGray = standard(T(P.concrete('#5b5f66', false)), { tile: 4 });
  for (const [k, c] of Object.entries({ stuccoWhite: '#ece6da', stuccoBlue: '#7fb2d8', stuccoYellow: '#f0d189', stuccoPink: '#eba7a0' })) M[k] = standard(T(P.stucco(c)), { tile: 4 });
  M.lighthouse = standard(T(P.lighthouse()), { tile: 7.6, rough: 0.7 });
  M.barnRed = standard(T(P.barn()), { tile: 4 });
  M.hay = standard(T(P.hay()), { tile: 1.5, rough: 1 });
  M.labWall = standard(T(P.tech('#e3eae6', '#58ff9a')), { tile: 4, rough: 0.55, env: 0.6 });
  M.techWall = standard(T(P.tech('#8d98a3', '#7ee8ff')), { tile: 5, rough: 0.5, metal: 0.4, env: 0.8 });
  M.techWhite = standard(T(P.tech('#e7ecf0', '#7ee8ff')), { tile: 5, rough: 0.4, metal: 0.25, env: 0.9 });
  M.techDark = standard(T(P.tech('#30363d', '#7ee8ff')), { tile: 3, rough: 0.5, metal: 0.6, env: 0.9 });
  M.techPanel = standard(T(P.tech('#b9792f', '#ffd27a')), { tile: 5, rough: 0.55, metal: 0.4 });
  M.vaultDoor = standard(T(P.vault()), { tile: 4, rough: 0.35, metal: 0.9, env: 1 });
  M.gateDoor = standard(T(P.gate()), { tile: 8, rough: 0.4, metal: 0.6, env: 1 });
  M.rockDoor = standard(T(fbmCanvas(256, 256, 5, '#4d443f', '#756a62', 4, 3)), { tile: 4 });
  M.militaryGreen = standard(T(P.camo()), { tile: 3 });
  M.militaryCrate = standard(T(P.crate()), { tile: 1.4 });
  M.crate = M.militaryCrate;
  M.asphalt = standard(T(P.asphalt()), { tile: 5, rough: 0.9 });
  M.sidewalk = standard(T(P.sidewalk()), { tile: 4 });
  M.roadLine = standard(T(P.line()), { tile: 8, rough: 0.7 }); M.roadLine.polygonOffset = true; M.roadLine.polygonOffsetFactor = -2;
  M.dirtRoad = standard(T(fbmCanvas(256, 256, 6, '#6a5238', '#8a6c4a', 4, 2)), { tile: 5, rough: 1 });
  M.sand = standard(T(fbmCanvas(256, 256, 7, '#d6c08a', '#eadba8', 3, 5)), { tile: 3, rough: 1 });
  M.rock = standard(T(fbmCanvas(256, 256, 5, '#6a625b', '#9a9185', 5, 1)), { tile: 4, rough: 0.95 });
  M.rockDark = standard(T(fbmCanvas(256, 256, 5, '#3d3835', '#6a625b', 5, 4)), { tile: 4, rough: 0.95 });
  M.hazard = standard(T(P.hazard()), { tile: 2.5, rough: 0.7 });
  const cc = { containerRed: '#b83a2c', containerBlue: '#2f5f9a', containerGreen: '#3f7a4a', containerYellow: '#d6a420', containerGray: '#7c858c' };
  for (const [k, c] of Object.entries(cc)) M[k] = standard(T(P.ribs(c, 18, true, 0.08)), { tile: 2.6, rough: 0.6, metal: 0.45, env: 0.7 });
  M.trainBody = standard(T(P.ribs('#c9d2d9', 12, false, 0.02)), { tile: 6, rough: 0.35, metal: 0.8, env: 1.2 });
  M.barrelRed = standard(T(P.ribs('#b0301f', 6, false, 0.1)), { tile: 1.4, rough: 0.5, metal: 0.55 });
  M.barrelYellow = standard(T(P.ribs('#d6a420', 6, false, 0.1)), { tile: 1.4, rough: 0.5, metal: 0.55 });
  M.solar = standard(T(P.solar()), { tile: 2.4, rough: 0.2, metal: 0.7, env: 1.3 });
  M.turbineWhite = standard(T(P.solid('#e8ecef', 8, false)), { tile: 8, rough: 0.35, metal: 0.1 });
  M.targetBoard = standard(T(P.target()), { tile: 2.0, rough: 0.8, vc: false });
  M.umbrellaA = standard(T(P.stripes('#f2f2f2', '#d62828', 8)), { tile: 3, rough: 0.8, side: THREE.DoubleSide });
  M.umbrellaB = standard(T(P.stripes('#f2f2f2', '#2a7fd6', 8)), { tile: 3, rough: 0.8, side: THREE.DoubleSide });
  M.towel = standard(T(P.stripes('#ffd24a', '#ff6a6a', 6)), { tile: 1.5 });
  M.tire = solid(0x151517, { rough: 0.9, tile: 1 });
  for (const [k, c] of Object.entries({ carRed: 0xc0291f, carBlue: 0x1f5fb8, carWhite: 0xe9ecef, carYellow: 0xe0b020, carBlack: 0x1a1c20 })) M[k] = solid(c, { rough: 0.25, metal: 0.65, env: 1.4, tile: 4 });
  M.glass = standard(null, { color: 0x6fa0c8, rough: 0.08, metal: 0.9, transparent: true, opacity: 0.55, env: 1.8 });
  M.glassClear = standard(null, { color: 0xbfe6ff, rough: 0.05, metal: 0.8, transparent: true, opacity: 0.22, env: 1.8 });
  M.glassDome = standard(null, { color: 0xa8e8c8, rough: 0.05, metal: 0.6, transparent: true, opacity: 0.2, env: 2.0, side: THREE.DoubleSide });
  M.glassLantern = standard(null, { color: 0xfff1b0, rough: 0.1, metal: 0.4, transparent: true, opacity: 0.45, env: 1.5 });
  M.bioTank = standard(null, { color: 0x4dff88, rough: 0.1, metal: 0.2, transparent: true, opacity: 0.55, env: 1.2 }); M.bioTank.emissive = new THREE.Color(0x1f7a3a); M.bioTank.emissiveIntensity = 1.2;
  M.waterCave = standard(null, { color: 0x2a6f8a, rough: 0.05, metal: 0.6, transparent: true, opacity: 0.75, env: 1.8 });
  M.reactorCore = glowMat(0x40e8ff, 1.6); M.redButtonCap = glowMat(0xff2a2a, 2.4);
  M.glow = glowMat(0xffa860, 1.4);
  // Neon & Leuchtflächen
  M.neonCyan = glowMat(0x3de6ff, 1.7); M.neonPink = glowMat(0xff3da8, 1.7); M.neonOrange = glowMat(0xff9a2a, 1.7); M.neonGreen = glowMat(0x4dff8a, 1.6);
  M.lamp = glowMat(0xfff4dc, 1.5); M.lampWarm = glowMat(0xffd49a, 1.4); M.screenGreen = glowMat(0x39ff8a, 1.2);
  for (const [k, c] of Object.entries({ crystalBlue: 0x3da8ff, crystalPurple: 0xb36bff, crystalGreen: 0x4dff9a, crystalPink: 0xff4dc8 })) M[k] = glowMat(c, 1.6);
  return M;
}

export function terrainTextures() {
  const g = fbmCanvas(512, 512, 6, '#c2cdb8', '#f0f5e6', 5, 0);
  const x = g.getContext('2d'); grain(x, 512, 512, 22);
  return toTex(g);
}

export function glowSpriteTexture() {
  const c = mk(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function labelTexture(text, color = '#7ee8ff', bg = null) {
  const c = mk(512, 128), x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 512, 128); }
  x.font = '900 72px "Trebuchet MS", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 72; while (x.measureText(text).width > 480 && size > 20) { size -= 4; x.font = `900 ${size}px "Trebuchet MS", Arial, sans-serif`; }
  x.shadowColor = color; x.shadowBlur = 24; x.fillStyle = color; x.fillText(text, 256, 66); x.shadowBlur = 8; x.fillStyle = '#fff'; x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Nacht-/Tag-Anpassung der Leuchtmaterialien
export function updateNight(M, night) {
  for (const k in M) {
    const m = M[k];
    if (m.userData.night !== undefined) m.emissiveIntensity = night * m.userData.night;
    if (m.userData.glow) { const g = m.userData.glow; m.color.set(g.hex).multiplyScalar(g.k * (0.6 + 0.4 * night)); }
  }
}
