// Prozedurale Waffenmodelle. Ursprung = Griffhand (rechts), Lauf zeigt nach +Z, oben = +Y. Meter.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WSKINS, WEAPONS } from '../shared/defs.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geoCache = new Map();
const rbox = (w, h, d, r = 0.008) => { const k = `r${w}|${h}|${d}|${r}`; let g = geoCache.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)); geoCache.set(k, g); } return g; };
const cyl = (r1, r2, h, s = 12) => { const k = `c${r1}|${r2}|${h}|${s}`; let g = geoCache.get(k); if (!g) { g = new THREE.CylinderGeometry(r1, r2, h, s); geoCache.set(k, g); } return g; };
const tor = (r, t) => { const k = `t${r}|${t}`; let g = geoCache.get(k); if (!g) { g = new THREE.TorusGeometry(r, t, 6, 18); geoCache.set(k, g); } return g; };

const matCache = new Map();
function mats(skin) {
  const k = skin.id;
  if (matCache.has(k)) return matCache.get(k);
  const ws = WSKINS.find(w => w.id === k) || WSKINS[0];
  const body = new THREE.MeshStandardMaterial({ color: ws.tint ?? 0x2b3038, metalness: 0.75, roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: ws.tint ? new THREE.Color(ws.tint).multiplyScalar(0.55) : 0x15181c, metalness: 0.6, roughness: 0.5 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x26211d, metalness: 0.1, roughness: 0.85 });
  for (const x of [body, dark, grip]) x.userData.merge = 'lit';
  const m = { body, dark, grip, ws };
  matCache.set(k, m); return m;
}
const glowMat = (hex, k = 2.2) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }); m.userData.merge = 'glow'; return m; };
const litVC = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.45 });
const glowVC = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const bakeCache = new Map();
// Statische Teile (gleiche Materialklasse) zu je einem Mesh zusammenfassen; bewegliche Teile (Magazin, Pumpe, Riegel, Klinge) und Sondermaterialien bleiben einzeln.
function bake(g, key) {
  const keep = new Set([g.userData.magMesh, g.userData.pump, g.userData.bolt, g.userData.blade]);
  const lit = [], glow = [];
  for (const m of g.children) { if (!m.isMesh || keep.has(m)) continue; const k = m.material.userData.merge; if (k === 'lit') lit.push(m); else if (k === 'glow') glow.push(m); }
  let c = bakeCache.get(key);
  if (!c) {
    const make = (list) => { if (!list.length) return null; const geos = list.map(m => { m.updateMatrix(); const ge = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); ge.applyMatrix4(m.matrix); ge.deleteAttribute('uv'); const n = ge.attributes.position.count, arr = new Float32Array(n * 3), col = m.material.color; for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; } ge.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return ge; }); const merged = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); return merged; };
    c = { lit: make(lit), glow: make(glow) }; bakeCache.set(key, c);
  }
  for (const m of [...lit, ...glow]) g.remove(m);
  if (c.lit) { const m = new THREE.Mesh(c.lit, litVC); m.castShadow = true; g.add(m); }
  if (c.glow) { const m = new THREE.Mesh(c.glow, glowVC); g.add(m); }
}

export function makeWeaponModel(id, wskinId = 'default') {
  const def = WEAPONS[id];
  const skin = WSKINS.find(w => w.id === wskinId) || WSKINS[0];
  const M = mats(skin);
  const accHex = skin.glow ?? def.color;
  const acc = glowMat(accHex);
  const g = new THREE.Group(); g.name = id;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  const mk = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); g.userData[name] = o; return o; };
  const B = M.body, D = M.dark, G = M.grip;
  let mag = null, pump = null, bolt = null;
  switch (id) {
    case 'viper':
      add(rbox(0.045, 0.06, 0.26), B, 0, 0.055, 0.1); add(rbox(0.04, 0.045, 0.2), D, 0, 0.02, 0.07);
      add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.01, -0.2); add(rbox(0.012, 0.012, 0.2), acc, 0.0, 0.09, 0.1);
      mag = add(rbox(0.035, 0.09, 0.04), D, 0, -0.1, -0.015, -0.2);
      add(cyl(0.012, 0.012, 0.06, 8), D, 0, 0.055, 0.25, Math.PI / 2);
      mk('muzzle', 0, 0.055, 0.29); mk('gripL', -0.01, -0.05, 0.02); mk('mag', 0, -0.12, 0.0); break;
    case 'magnum':
      add(rbox(0.05, 0.07, 0.2), B, 0, 0.06, 0.08); add(cyl(0.032, 0.032, 0.07, 12), D, 0, 0.06, 0.05, Math.PI / 2);
      add(rbox(0.03, 0.03, 0.3), B, 0, 0.075, 0.28); add(rbox(0.045, 0.14, 0.055), G, 0, -0.045, -0.015, -0.25); add(rbox(0.014, 0.014, 0.25), acc, 0, 0.1, 0.25);
      add(rbox(0.05, 0.02, 0.1), D, 0, 0.03, 0.09);
      mk('muzzle', 0, 0.075, 0.44); mk('gripL', -0.01, -0.06, 0.03); mk('mag', 0, -0.05, 0.05); break;
    case 'striker':
      add(rbox(0.06, 0.09, 0.42), B, 0, 0.07, 0.15); add(rbox(0.05, 0.05, 0.28), D, 0, 0.07, 0.5); add(cyl(0.014, 0.014, 0.18, 8), D, 0, 0.075, 0.76, Math.PI / 2);
      add(rbox(0.055, 0.09, 0.3), G, 0, 0.0, -0.3, 0.08); add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2);
      mag = add(rbox(0.045, 0.16, 0.07), D, 0, -0.1, 0.15, 0.12); add(rbox(0.018, 0.03, 0.12), D, 0, 0.14, 0.15); add(rbox(0.012, 0.012, 0.3), acc, 0.031, 0.075, 0.22); add(rbox(0.012, 0.012, 0.3), acc, -0.031, 0.075, 0.22);
      add(rbox(0.06, 0.03, 0.2), D, 0, 0.12, 0.45);
      mk('muzzle', 0, 0.075, 0.86); mk('gripL', 0, 0.0, 0.36); mk('mag', 0, -0.14, 0.15); break;
    case 'hornet':
      add(rbox(0.055, 0.08, 0.3), B, 0, 0.065, 0.1); add(cyl(0.02, 0.02, 0.22, 8), D, 0, 0.07, 0.38, Math.PI / 2);
      add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); mag = add(rbox(0.04, 0.2, 0.05), D, 0, -0.12, 0.17);
      add(rbox(0.012, 0.012, 0.25), acc, 0.03, 0.07, 0.15); add(rbox(0.035, 0.04, 0.18), D, 0, 0.04, -0.14); add(rbox(0.02, 0.04, 0.1), D, 0, 0.12, 0.1);
      mk('muzzle', 0, 0.07, 0.5); mk('gripL', 0, -0.01, 0.3); mk('mag', 0, -0.2, 0.17); break;
    case 'breaker':
      add(rbox(0.06, 0.08, 0.3), B, 0, 0.065, 0.05); add(cyl(0.024, 0.024, 0.66, 10), D, 0, 0.09, 0.5, Math.PI / 2); add(cyl(0.022, 0.022, 0.58, 10), D, 0, 0.045, 0.46, Math.PI / 2);
      pump = add(rbox(0.065, 0.055, 0.18), G, 0, 0.0, 0.42); add(rbox(0.05, 0.1, 0.36), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 }), 0, 0.0, -0.28, 0.08);
      add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); add(rbox(0.014, 0.014, 0.34), acc, 0.033, 0.09, 0.2);
      mk('muzzle', 0, 0.09, 0.85); mk('gripL', 0, 0.0, 0.34); mk('mag', 0, -0.02, 0.1); break;
    case 'marksman':
      add(rbox(0.055, 0.085, 0.45), B, 0, 0.07, 0.15); add(cyl(0.015, 0.015, 0.5, 8), D, 0, 0.075, 0.68, Math.PI / 2); add(rbox(0.045, 0.06, 0.3), D, 0, 0.065, 0.5);
      add(rbox(0.05, 0.1, 0.32), G, 0, 0.0, -0.3, 0.06); add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); mag = add(rbox(0.04, 0.13, 0.05), D, 0, -0.1, 0.1);
      add(cyl(0.028, 0.028, 0.22, 10), D, 0, 0.15, 0.2, Math.PI / 2); add(cyl(0.034, 0.034, 0.03, 10), acc, 0, 0.15, 0.33, Math.PI / 2); add(rbox(0.012, 0.012, 0.35), acc, 0.031, 0.07, 0.3);
      mk('muzzle', 0, 0.075, 0.95); mk('gripL', 0, 0.0, 0.38); mk('mag', 0, -0.14, 0.1); break;
    case 'longshot':
      add(rbox(0.06, 0.09, 0.5), B, 0, 0.07, 0.15); add(cyl(0.018, 0.018, 0.9, 8), D, 0, 0.08, 0.85, Math.PI / 2); add(cyl(0.03, 0.03, 0.14, 8), D, 0, 0.08, 1.3, Math.PI / 2);
      add(rbox(0.06, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0x3b4a2e, roughness: 0.8 }), 0, 0.0, -0.36, 0.05); add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2);
      add(cyl(0.04, 0.04, 0.34, 12), D, 0, 0.16, 0.18, Math.PI / 2); add(cyl(0.05, 0.05, 0.05, 12), acc, 0, 0.16, 0.36, Math.PI / 2); add(cyl(0.05, 0.05, 0.05, 12), acc, 0, 0.16, 0.0, Math.PI / 2);
      bolt = add(rbox(0.015, 0.015, 0.1), D, 0.045, 0.08, 0.05); add(rbox(0.012, 0.012, 0.4), acc, 0.033, 0.07, 0.3); mag = add(rbox(0.04, 0.06, 0.08), D, 0, -0.02, 0.15);
      add(cyl(0.012, 0.012, 0.35, 6), D, 0.05, -0.1, 0.9, 0, 0, 0.3); add(cyl(0.012, 0.012, 0.35, 6), D, -0.05, -0.1, 0.9, 0, 0, -0.3);
      mk('muzzle', 0, 0.08, 1.38); mk('gripL', 0, 0.0, 0.4); mk('mag', 0, -0.05, 0.15); break;
    case 'stormcaller':
      add(cyl(0.1, 0.1, 1.05, 14), B, 0, 0.12, 0.3, Math.PI / 2); add(cyl(0.13, 0.09, 0.2, 14), D, 0, 0.12, -0.3, Math.PI / 2); add(cyl(0.085, 0.12, 0.1, 14), D, 0, 0.12, 0.84, Math.PI / 2);
      add(cyl(0.1, 0.0, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xc23b22, metalness: 0.5, roughness: 0.4 }), 0, 0.12, 0.95, Math.PI / 2);
      add(rbox(0.04, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); add(rbox(0.04, 0.1, 0.04), G, 0, 0.02, 0.45); add(rbox(0.1, 0.04, 0.3), D, 0, 0.24, 0.2); add(cyl(0.01, 0.01, 0.3, 6), acc, 0.0, 0.26, 0.2, Math.PI / 2);
      for (let i = 0; i < 3; i++) add(tor(0.105, 0.012), acc, 0, 0.12, 0.0 + i * 0.3, 0, Math.PI / 2);
      mk('muzzle', 0, 0.12, 1.0); mk('gripL', 0, 0.02, 0.38); mk('mag', 0, 0.12, 0.2); break;
    case 'pulse':
      add(rbox(0.09, 0.1, 0.46), B, 0, 0.07, 0.15); add(cyl(0.035, 0.045, 0.3, 12), D, 0, 0.075, 0.55, Math.PI / 2);
      add(cyl(0.02, 0.02, 0.4, 8), acc, 0, 0.075, 0.2, Math.PI / 2); for (let i = 0; i < 3; i++) add(tor(0.05, 0.01), acc, 0, 0.075, 0.42 + i * 0.1, 0, Math.PI / 2);
      add(rbox(0.05, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); add(rbox(0.06, 0.08, 0.3), D, 0, 0.0, -0.3, 0.08);
      mag = add(rbox(0.06, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x20323a, metalness: 0.6, roughness: 0.3, emissive: accHex, emissiveIntensity: 0.6 }), 0, -0.06, 0.2);
      add(rbox(0.02, 0.05, 0.14), D, 0, 0.14, 0.2);
      mk('muzzle', 0, 0.075, 0.74); mk('gripL', 0, 0.0, 0.36); mk('mag', 0, -0.1, 0.2); break;
    case 'lancer':
      add(rbox(0.07, 0.09, 0.4), B, 0, 0.07, 0.12); add(cyl(0.02, 0.02, 0.7, 8), D, 0, 0.075, 0.65, Math.PI / 2);
      for (let i = 0; i < 5; i++) add(tor(0.045 - i * 0.002, 0.01), acc, 0, 0.075, 0.38 + i * 0.12, 0, Math.PI / 2);
      add(cyl(0.035, 0.02, 0.06, 10), acc, 0, 0.075, 1.0, Math.PI / 2);
      add(rbox(0.05, 0.12, 0.05), G, 0, -0.04, -0.02, -0.2); add(rbox(0.05, 0.07, 0.26), D, 0, 0.03, -0.26, 0.05);
      mag = add(cyl(0.04, 0.04, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x20323a, emissive: accHex, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3 }), 0, -0.04, 0.2, 0, 0, Math.PI / 2);
      mk('muzzle', 0, 0.075, 1.04); mk('gripL', 0, 0.0, 0.38); mk('mag', 0, -0.08, 0.2); break;
    case 'blade':
      add(cyl(0.022, 0.022, 0.16, 8), G, 0, 0.0, 0.0, Math.PI / 2); add(rbox(0.04, 0.12, 0.03), D, 0, 0.0, 0.1); add(rbox(0.03, 0.03, 0.04), acc, 0, 0.0, -0.1);
      const blade = add(rbox(0.016, 0.07, 0.95, 0.004), acc, 0, 0.0, 0.62); const core = add(rbox(0.007, 0.045, 0.92, 0.002), glowMat(0xffffff, 3), 0, 0, 0.62);
      g.userData.blade = blade; mk('muzzle', 0, 0, 1.1); mk('gripL', 0, 0, -0.1); mk('mag', 0, 0, 0); break;
  }
  g.userData.mag = g.userData.mag || null; g.userData.magMesh = mag; g.userData.pump = pump; g.userData.bolt = bolt; g.userData.def = def;
  g.userData.muzzleLight = null;
  bake(g, id + '|' + wskinId);
  return g;
}

// Halte-Pose pro Waffenklasse (relativ zur Brust): Position, Rotation
export const HOLD = {
  pistol:   { pos: [-0.14, 0.3, 0.38], rot: [0, 0, 0], twoHand: true },
  rifle:    { pos: [-0.1, 0.27, 0.26], rot: [0, 0, 0], twoHand: true },
  smg:      { pos: [-0.1, 0.27, 0.28], rot: [0, 0, 0], twoHand: true },
  dmr:      { pos: [-0.09, 0.27, 0.27], rot: [0, 0, 0], twoHand: true },
  shotgun:  { pos: [-0.1, 0.26, 0.26], rot: [0, 0, 0], twoHand: true },
  sniper:   { pos: [-0.08, 0.26, 0.26], rot: [0, 0, 0], twoHand: true },
  launcher: { pos: [-0.17, 0.5, 0.1], rot: [0, 0, 0], twoHand: true },
  plasma:   { pos: [-0.1, 0.27, 0.26], rot: [0, 0, 0], twoHand: true },
  laser:    { pos: [-0.1, 0.27, 0.26], rot: [0, 0, 0], twoHand: true },
  melee:    { pos: [-0.3, 0.22, 0.34], rot: [-0.9, 0, 0], twoHand: false },
};
