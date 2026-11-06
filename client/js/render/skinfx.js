// Zusatzmodelle für seltene Charakter-Skins (Flügel, Umhang, Strahlenkranz, kreisende Fragmente, Aura …) und deren Animation.
// Alles ist nur Darstellung. Jedes Extra ist EIN zusammengefasstes Mesh (wenige Draw-Calls); Teile sind an Knochen gehängt und bewegen sich mit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Teilgeometrie platzieren und mit einer Vertex-Farbe versehen (alle Teile werden danach zu einem Mesh verschmolzen)
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)); g.applyMatrix4(M4);
  g.deleteAttribute('uv'); paint(g, color); return g;
}
function paint(g, color, k = 1) {
  C.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = C.r * k; a[i * 3 + 1] = C.g * k; a[i * 3 + 2] = C.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const merge = (list) => { const m = mergeGeometries(list); list.forEach(x => x.dispose()); return m; };
const blade = (w, L, t) => new THREE.BoxGeometry(w, L, t).translate(0, L / 2, 0);      // Fuß am Ursprung, wächst nach +Y
const spike = (r, L, seg = 5) => new THREE.ConeGeometry(r, L, seg).translate(0, L / 2, 0);

// Tuch (Umhang/Bänder): Gitter, dessen Eckpunkte pro Frame schwingen
function cloth(w, h, ws, hs, x, y, z, colorAt) {
  const g = new THREE.PlaneGeometry(w, h, ws, hs); g.translate(x, y - h / 2, z); g.deleteAttribute('uv');
  const n = g.attributes.position.count, col = new Float32Array(n * 3), frac = new Float32Array(n);
  for (let i = 0; i < n; i++) { const f = clamp((y - g.attributes.position.getY(i)) / h, 0, 1); frac[i] = f; colorAt(f, C); col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return { g, frac };
}

const glowMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
const litMat = (emissive, k = 0.35) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.45, emissive, emissiveIntensity: k, side: THREE.DoubleSide });

export function buildExtras(ch) {
  const s = ch.skin, list = s.extras || []; if (!list.length) return;
  const hue = list.includes('hue'), A = hue ? '#ffffff' : s.accent, ACC = hue ? '#ffffff' : s.accent;
  const fx = ch.fx = { t: Math.random() * 6, lag: 0, hueMats: [], spin: [], cloths: [], objs: [], geos: [], mats: [] };
  const glow = glowMat(), glowFix = glowMat(), lit = litMat(s.accent), cloak = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }), aur = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.accent).multiplyScalar(1.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  fx.mats.push(glow, glowFix, lit, cloak, aur); if (hue) fx.hueMats.push(glow, aur);
  const add = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.frustumCulled = false; m.castShadow = false; parent.add(m); fx.geos.push(geo); fx.objs.push(m); return m; };
  const mkGroup = (parent, x, y, z, name) => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); fx.objs.push(g); return g; };

  for (const name of list) {
    if (name === 'wings') {   // Flügel aus Lichtfedern
      const parts = [];
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const L = 0.95 - i * 0.12, a = 0.35 + i * 0.3;
        parts.push(part(blade(0.075 - i * 0.006, L, 0.014), i % 2 ? A : ACC, side * 0.1, 0.22, -0.27, -0.45, 0, -side * a));
      }
      add(merge(parts), glow, ch.chest, 'wings');
    } else if (name === 'rays') {   // Strahlenkranz hinter dem Rücken
      const g = mkGroup(ch.chest, 0, 0.25, -0.38, 'rays'), parts = [];
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = 0.27, L = k % 2 ? 0.3 : 0.5; parts.push(part(spike(0.034, L, 4), k % 2 ? ACC : A, -Math.sin(a) * r, Math.cos(a) * r, 0, 0, 0, a)); }
      add(merge(parts), glow, g, 'raysMesh'); fx.spin.push({ o: g, ax: 'z', v: 0.4 });
    } else if (name === 'crystals') {   // Eiskristalle auf den Schultern
      const parts = [];
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(part(spike(0.05 - k * 0.008, 0.34 - k * 0.07, 5), k === 1 ? s.accent : '#c9efff', side * (0.27 + k * 0.045), 0.36 - k * 0.03, -0.02 - k * 0.03, 0.1 * k, 0, -side * (0.35 + k * 0.38)));
      add(merge(parts), lit, ch.chest, 'crystals');
    } else if (name === 'vents') {   // Glühende Lüftungsschlitze am Rucksack
      const parts = []; for (const side of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(part(new THREE.BoxGeometry(0.05, 0.035, 0.02), s.accent, side * 0.1, 0.1 + k * 0.07, -0.315));
      add(merge(parts), glowFix, ch.chest, 'vents');
    } else if (name === 'spikes') {   // Schulterdornen
      const parts = []; for (const side of [-1, 1]) for (let k = 0; k < 2; k++) parts.push(part(spike(0.035, 0.2 - k * 0.05, 5), '#2a2a33', side * (0.3 + k * 0.03), 0.37 - k * 0.04, 0, 0, 0, -side * (0.5 + k * 0.45)));
      add(merge(parts), cloak, ch.chest, 'spikes');
    } else if (name === 'leaves') {   // Blätter
      const parts = []; for (const side of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(part(new THREE.OctahedronGeometry(0.06, 0).scale(0.6, 1.5, 0.35), k % 2 ? '#7bd44a' : '#4fa33a', side * (0.28 + k * 0.05), 0.36 + k * 0.03, -0.04 + k * 0.03, 0.2, 0, -side * (0.9 + k * 0.35)));
      add(merge(parts), lit, ch.chest, 'leaves');
    } else if (name === 'katana') {   // Katana diagonal auf dem Rücken
      const k = merge([part(blade(0.03, 0.95, 0.012), '#cfd6e2'), part(blade(0.036, 0.24, 0.02), '#241018', 0, -0.24), part(new THREE.BoxGeometry(0.12, 0.016, 0.05), s.accent, 0, 0.0)]);
      k.rotateZ(-0.62); k.translate(0.12, -0.12, -0.3); add(k, lit, ch.chest, 'katana');
    } else if (name === 'cape') {   // Umhang
      const dark = new THREE.Color(s.suit), tri = new THREE.Color(s.accent), c = cloth(0.46, 1.0, 4, 9, 0, 0.36, -0.27, (f, o) => { o.copy(dark).lerp(tri, f > 0.9 ? 1 : f * 0.28); });
      const glowCape = s.id === 'inferno'; if (glowCape) { const hot = new THREE.Color('#ff3a0a'), top = new THREE.Color('#2a0a04'); for (let i = 0; i < c.frac.length; i++) { C.copy(top).lerp(hot, c.frac[i]).multiplyScalar(1 + c.frac[i] * 1.4); c.g.attributes.color.setXYZ(i, C.r, C.g, C.b); } }
      add(c.g, glowCape ? glowFix : cloak, ch.chest, 'cape'); fx.cloths.push({ g: c.g, base: c.g.attributes.position.array.slice(), frac: c.frac, amp: 1, glow: glowCape });
    } else if (name === 'ribbons') {   // Polarlicht-Bänder
      const cols = ['#5cffd8', '#8fb6ff', '#ff8fe8'], gs = [], fr = [];
      cols.forEach((cc, i) => { const base = new THREE.Color(cc), c = cloth(0.1, 1.35, 1, 10, (i - 1) * 0.16, 0.33, -0.28 - Math.abs(i - 1) * 0.02, (f, o) => { o.copy(base).multiplyScalar(1.9 - f * 1.0); }); gs.push(c.g); fr.push(...c.frac); });
      const g = mergeGeometries(gs); gs.forEach(x => x.dispose()); add(g, glowFix, ch.chest, 'ribbons'); fx.cloths.push({ g, base: g.attributes.position.array.slice(), frac: Float32Array.from(fr), amp: 1.5, glow: true });
    } else if (name === 'halo2') {   // zweiter, schräger Heiligenschein
      const g = merge([part(new THREE.TorusGeometry(0.21, 0.012, 8, 40), A, 0, 0, 0, Math.PI / 2 - 0.35, 0, 0.2), part(new THREE.TorusGeometry(0.16, 0.009, 8, 36), ACC, 0, 0.03, 0, Math.PI / 2 + 0.3, 0, -0.3)]);
      const grp = mkGroup(ch.head, 0, 0.36, -0.02, 'halo2'); add(g, glow, grp, 'halo2Mesh'); fx.spin.push({ o: grp, ax: 'y', v: 0.8 });
    } else if (name === 'crown') {   // Flammenkrone
      const parts = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; parts.push(part(spike(0.028, k % 2 ? 0.16 : 0.26, 4), k % 2 ? s.accent : s.visor, Math.sin(a) * 0.13, 0.2, Math.cos(a) * 0.13, Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15)); }
      add(merge(parts), glowFix, ch.head, 'crown');
    } else if (name === 'orbit') {   // kreisende Fragmente
      const parts = []; for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = 0.62; parts.push(part(new THREE.OctahedronGeometry(0.055 + (k % 3) * 0.012, 0), k % 2 ? A : ACC, Math.sin(a) * r, 0.95 + (k % 4) * 0.2, Math.cos(a) * r, a, a * 0.7, 0)); }
      const grp = mkGroup(ch.root, 0, 0, 0, 'orbit'); add(merge(parts), glow, grp, 'orbitMesh'); fx.spin.push({ o: grp, ax: 'y', v: 1.3, bob: 0.06 });
    } else if (name === 'aura') {   // leuchtende Ringe am Boden
      const grp = mkGroup(ch.root, 0, 0.04, 0, 'aura'), r1 = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2), aur), r2 = new THREE.Mesh(new THREE.RingGeometry(0.88, 0.92, 48).rotateX(-Math.PI / 2), aur);
      for (const m of [r1, r2]) { m.frustumCulled = false; grp.add(m); fx.geos.push(m.geometry); } fx.aura = { r1, r2 };
    }
  }
}

// Pro Frame: Drehungen, Tuch-Schwingen, Farbwechsel, Pulsieren
export function tickExtras(ch, dt, speed) {
  const s = ch.skin, fx = ch.fx; fx && (fx.t += dt);
  const t = fx ? fx.t : performance.now() / 1000, list = s.extras;
  if (!list) return;
  const team = ch.teamHex != null;
  if (list.includes('hue')) {
    const h = (t * 0.12) % 1;
    for (const m of fx.hueMats) m.color.setHSL(h, 0.85, 0.62).multiplyScalar(m.isMeshBasicMaterial && m.transparent ? 1.7 : 1.5);
    if (!team) { ch.mAccent.color.setHSL(h, 0.9, 0.62).multiplyScalar(1.6); }
    ch.mVisor.color.setHSL((h + 0.5) % 1, 0.8, 0.8).multiplyScalar(1.2);
    ch.mArmor.color.setHSL((h + 0.08) % 1, s.id === 'prism' ? 0.25 : 0.12, 0.88);
  } else if (list.includes('pulse') && !team) {
    ch.mAccent.color.set(s.accent).multiplyScalar(1.3 + 0.45 * Math.sin(t * 3.2));
  }
  if (!fx) return;
  for (const o of fx.spin) { o.o.rotation[o.ax] += dt * o.v; if (o.bob) o.o.position.y = Math.sin(t * 1.6) * o.bob; }
  if (fx.aura) { const k = 1 + 0.06 * Math.sin(t * 2.4); fx.aura.r1.scale.set(k, 1, k); fx.aura.r2.scale.set(2 - k, 1, 2 - k); fx.aura.r1.rotation.y += dt * 0.9; fx.aura.r2.rotation.y -= dt * 0.6; }
  if (fx.cloths.length) {
    fx.lag += (clamp(speed / 8, 0, 1) - fx.lag) * Math.min(1, dt * 4);
    for (const c of fx.cloths) {
      const pos = c.g.attributes.position, a = pos.array, b = c.base, n = c.frac.length;
      for (let i = 0; i < n; i++) {
        const f = c.frac[i], k = i * 3, bx = b[k], sway = (0.06 + 0.32 * fx.lag) * f * f * c.amp;
        a[k] = bx + Math.sin(t * 2 + f * 2.2 + bx * 3) * 0.025 * f * c.amp; a[k + 1] = b[k + 1]; a[k + 2] = b[k + 2] - sway + Math.sin(t * 3.4 + f * 3.8 + bx * 5) * 0.035 * f * c.amp;
      }
      pos.needsUpdate = true; if (!c.glow) c.g.computeVertexNormals();
    }
  }
}

export function disposeExtras(ch) { const fx = ch.fx; if (!fx) return; for (const g of fx.geos) g.dispose(); for (const m of fx.mats) m.dispose(); ch.fx = null; }
