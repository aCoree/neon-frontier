// Rückenstücke ("Back Bling"): reine Deko am Rücken des Charakters – vom Rucksack bis zum Galaxie-Portal. Alles ist an die Brust gehängt
// (bewegt sich mit), aus wenigen zusammengefassten Meshes gebaut und wird pro Frame leicht animiert (Flügelschlag, Flammen, Rotation, Schweben).
import * as THREE from 'three';
import { part, merge, blade, spike, paint } from './skinfx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), BZ = -0.34;   // BZ: Rückenfläche der Brust (z)

// Quader zwischen zwei Punkten
function seg(p0, p1, w, t, color) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length(), g = new THREE.BoxGeometry(w, L, t).translate(0, L / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().compose(p0, new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), V(1, 1, 1))); g.deleteAttribute('uv'); return paint(g, color);
}
// Dreieck mit je einer Farbe pro Ecke (Membranen)
function tri(a, b, c, ca, cb, cc) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3));
  const k = new THREE.Color(), col = []; for (const cx of [ca, cb, cc]) { k.set(cx); col.push(k.r, k.g, k.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const litMat = (emi, k = 0.25, metal = 0.5, rough = 0.4) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, emissive: emi, emissiveIntensity: k, side: THREE.DoubleSide });
const glowMat = (opts = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, ...opts });
const flatGlow = (hex, k = 1.8, opts = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, side: THREE.DoubleSide, ...opts });

// Flügel einer Seite: pivot an der Schulter, Fingerrichtungen (Winkel über der Waagerechten, Länge)
function wingSide(side, fingers, o) {
  const piv = V(0, 0, 0), tips = fingers.map(([a, L]) => V(side * Math.cos(a) * L, Math.sin(a) * L, -0.28 * L)), bones = [], mem = [];
  tips.forEach((t, i) => bones.push(seg(piv, t, o.bone[0] * (1 - i * 0.12), o.bone[1], o.boneCol)));
  if (o.feathers) {   // Federn: zweite, kürzere Reihe + Spitze
    tips.forEach((t, i) => { const a = fingers[i][0] - 0.1, L = fingers[i][1] * 0.62; bones.push(seg(V(0, 0, 0.0), V(side * Math.cos(a) * L, Math.sin(a) * L - 0.03, -0.2 * L), o.bone[0] * 1.35, o.bone[1] * 0.8, o.col2 || '#f3ecd2')); });
  }
  if (o.m0) tips.forEach((t, i) => { if (i < tips.length - 1) mem.push(tri(piv, t, tips[i + 1], o.m0, o.m1, o.m1)); });
  return { bones, mem, tips };
}

export function buildBack(ch, id) {
  disposeBack(ch); if (!id || id === 'none') return;
  const B = ch.back = { id, t: Math.random() * 6, geos: [], mats: [], flaps: [], spin: [], flames: [], hue: [], embers: [], pulses: [], bobs: [], tex: [], sway: null, group: new THREE.Group() };
  B.group.name = 'back'; ch.chest.add(B.group);
  const add = (geo, mat, parent = B.group) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = false; parent.add(m); B.geos.push(geo); return m; };
  const mat = (m) => { B.mats.push(m); return m; };
  const grp = (x, y, z, parent = B.group) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  switch (id) {
    case 'pack': {
      const g = merge([part(new THREE.BoxGeometry(0.34, 0.44, 0.15), '#4d5b3c', 0, 0.02, BZ - 0.02), part(new THREE.BoxGeometry(0.35, 0.1, 0.17), '#3b4630', 0, 0.27, BZ - 0.02),
        part(new THREE.BoxGeometry(0.1, 0.2, 0.09), '#445233', 0.21, -0.06, BZ), part(new THREE.BoxGeometry(0.1, 0.2, 0.09), '#445233', -0.21, -0.06, BZ),
        part(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10), '#7a6a4a', 0, -0.27, BZ - 0.02, 0, 0, Math.PI / 2), part(new THREE.BoxGeometry(0.03, 0.46, 0.17), '#2a3022', 0.1, 0.02, BZ - 0.02), part(new THREE.BoxGeometry(0.03, 0.46, 0.17), '#2a3022', -0.1, 0.02, BZ - 0.02)]);
      add(g, mat(litMat('#000', 0, 0.1, 0.8))); add(merge([part(new THREE.BoxGeometry(0.1, 0.05, 0.01), '#ffb347', 0, 0.13, BZ - 0.105)]), mat(glowMat()));
      break;
    }
    case 'sniper': {
      const k = merge([part(blade(0.032, 0.95, 0.036), '#2b2f36', 0, -0.3, 0), part(new THREE.BoxGeometry(0.05, 0.34, 0.075), '#5a3d28', 0, -0.52, 0), part(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 10), '#15171b', 0, 0.02, -0.05), part(new THREE.BoxGeometry(0.02, 0.2, 0.08), '#1b1d22', 0, -0.2, 0.0), part(new THREE.BoxGeometry(0.06, 0.07, 0.05), '#3b4048', 0, -0.18, 0.04)]);
      k.rotateZ(-0.62); k.translate(0.05, 0.1, BZ - 0.02); add(k, mat(litMat('#000', 0, 0.7, 0.35)));
      const lens = merge([part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10), '#ff3a3a', 0, 0.14, -0.05)]); lens.rotateZ(-0.62); lens.translate(0.05, 0.1, BZ - 0.02); add(lens, mat(glowMat()));
      break;
    }
    case 'jetpack': {
      const g = merge([part(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), '#555d68', 0.105, 0, BZ - 0.01), part(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), '#555d68', -0.105, 0, BZ - 0.01),
        part(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), '#2a2f36', 0.105, 0.22, BZ - 0.01), part(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), '#2a2f36', -0.105, 0.22, BZ - 0.01),
        part(new THREE.CylinderGeometry(0.06, 0.085, 0.1, 12, 1, true), '#20242a', 0.105, -0.26, BZ - 0.01), part(new THREE.CylinderGeometry(0.06, 0.085, 0.1, 12, 1, true), '#20242a', -0.105, -0.26, BZ - 0.01), part(new THREE.BoxGeometry(0.2, 0.12, 0.08), '#3b4048', 0, 0.1, BZ + 0.0)]);
      add(g, mat(litMat('#000', 0, 0.8, 0.35)));
      add(merge([part(new THREE.CylinderGeometry(0.078, 0.078, 0.02, 12), '#ff9a3c', 0.105, 0.12, BZ - 0.01), part(new THREE.CylinderGeometry(0.078, 0.078, 0.02, 12), '#ff9a3c', -0.105, 0.12, BZ - 0.01)]), mat(glowMat()));
      for (const s of [-1, 1]) {
        const o = grp(s * 0.105, -0.31, BZ - 0.01), c1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 10, 1, true).rotateX(Math.PI).translate(0, -0.17, 0), mat(flatGlow('#ff7a1a', 1.9, { transparent: true, opacity: 0.9, depthWrite: false })));
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 8, 1, true).rotateX(Math.PI).translate(0, -0.1, 0), mat(flatGlow('#fff1a8', 2.4, { transparent: true, opacity: 0.95, depthWrite: false })));
        for (const c of [c1, c2]) { c.frustumCulled = false; o.add(c); B.geos.push(c.geometry); B.flames.push({ o: c, ph: Math.random() * 6 }); }
      }
      break;
    }
    case 'shield': {
      const hex = (r, d) => new THREE.CylinderGeometry(r, r, d, 6).rotateX(Math.PI / 2);
      const o = grp(0, 0.06, BZ - 0.03); B.sway = o;
      add(merge([part(hex(0.27, 0.035), '#344560', 0, 0, 0), part(hex(0.215, 0.05), '#5d7fb0', 0, 0, -0.01), part(hex(0.08, 0.06), '#2a3850', 0, 0, -0.02)]), mat(litMat('#1a2a44', 0.2, 0.85, 0.28)), o);
      const rim = new THREE.TorusGeometry(0.268, 0.013, 6, 6).rotateZ(Math.PI / 2); rim.translate(0, 0, -0.02); add(rim, mat(flatGlow('#6fd8ff', 2)), o);
      const inner = new THREE.TorusGeometry(0.17, 0.008, 6, 6).rotateZ(Math.PI / 2); inner.translate(0, 0, -0.04); const im = add(inner, mat(flatGlow('#ffffff', 1.6)), o); B.pulses.push({ o: im, k: 0.12 });
      add(new THREE.OctahedronGeometry(0.05, 0).translate(0, 0, -0.05), mat(flatGlow('#9fe8ff', 2.4)), o);
      break;
    }
    case 'drone': {
      const o = grp(0.32, 0.45, BZ + 0.02); B.bobs.push({ o, x: 0.32, y: 0.45, z: BZ + 0.02, r: 0.07 });
      add(merge([part(new THREE.SphereGeometry(0.065, 12, 8), '#dfe6ee', 0, 0, 0, 0, 0, 0, 1, 0.65, 1.1), part(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), '#3b4048', 0, 0, 0, 0, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), '#3b4048', 0, 0, 0, Math.PI / 2, 0, 0)]), mat(litMat('#000', 0, 0.6, 0.3)), o);
      add(merge([part(new THREE.SphereGeometry(0.02, 8, 6), '#7ee8ff', 0, 0, 0.065), part(new THREE.TorusGeometry(0.085, 0.006, 6, 24), '#7ee8ff', 0, 0, 0, Math.PI / 2, 0, 0)]), mat(glowMat()), o);
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 14), mat(flatGlow('#bfefff', 1.2, { transparent: true, opacity: 0.55, depthWrite: false }))); r.position.set(dx * 0.1, 0.012, dz * 0.1); r.frustumCulled = false; o.add(r); B.geos.push(r.geometry); B.spin.push({ o: r, ax: 'y', v: 40 }); }
      break;
    }
    case 'reactor': {
      add(merge([part(new THREE.BoxGeometry(0.32, 0.32, 0.05), '#2c3340', 0, 0.05, BZ), part(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), '#1a1f28', 0, 0.05, BZ - 0.035, Math.PI / 2, 0, 0)]), mat(litMat('#000', 0, 0.7, 0.4)));
      const o = grp(0, 0.05, BZ - 0.07), r1 = add(new THREE.TorusGeometry(0.125, 0.018, 8, 36), mat(flatGlow('#38e8ff', 2)), o), r2 = add(new THREE.TorusGeometry(0.175, 0.011, 8, 40), mat(flatGlow('#b9f6ff', 1.6)), o);
      const core = add(new THREE.SphereGeometry(0.05, 12, 10), mat(flatGlow('#ffffff', 2.4)), o); r1.rotation.x = 0.5; r2.rotation.x = -0.6;
      B.spin.push({ o: r1, ax: 'z', v: 2.4 }, { o: r2, ax: 'z', v: -1.6 }); B.pulses.push({ o: core, k: 0.25 });
      break;
    }
    case 'angel': case 'demon': case 'dragon': {
      const dragon = id === 'dragon', demon = id === 'demon', S = dragon ? 1.0 : 0.86;
      const fin = id === 'angel' ? [[1.15, 0.78], [0.85, 0.92], [0.55, 0.96], [0.25, 0.88], [-0.05, 0.74], [-0.32, 0.58]].map(([a, L]) => [a, L * S])
        : dragon ? [[1.2, 0.8], [0.88, 1.05], [0.58, 1.12], [0.3, 1.05], [0.02, 0.86]].map(([a, L]) => [a, L * S]) : [[1.2, 0.7], [0.85, 0.92], [0.5, 0.92], [0.15, 0.72]];
      const look = id === 'angel' ? { bone: [0.07, 0.014], boneCol: '#ffffff', col2: '#f6efd6', feathers: true, m0: '#f7f3ea', m1: '#ffe6a6' } : demon ? { bone: [0.026, 0.02], boneCol: '#1a1013', m0: '#2a0508', m1: '#a21a1a' } : { bone: [0.032, 0.024], boneCol: '#ffcc55', m0: '#5a0a05', m1: '#ff7a1a' };
      for (const side of [-1, 1]) {
        const w = wingSide(side, fin, look), pivot = grp(side * 0.1, 0.2, BZ + 0.05);
        const bones = merge(w.bones); add(bones, mat(litMat(id === 'angel' ? '#fff2c0' : dragon ? '#ff9a2a' : '#ff3a10', id === 'angel' ? 0.22 : 0.35, 0.3, 0.5)), pivot);
        if (w.mem.length) add(merge(w.mem), mat(litMat(id === 'angel' ? '#fff0c8' : dragon ? '#ff4a10' : '#701010', id === 'angel' ? 0.35 : dragon ? 0.22 : 0.25, 0.1, 0.8)), pivot);
        if (id === 'angel') { const tipG = merge(w.tips.map((t, i) => part(new THREE.OctahedronGeometry(0.024, 0), '#ffe27a', t.x, t.y, t.z))); add(tipG, mat(glowMat()), pivot); }
        else { const veins = merge(w.tips.map(t => seg(V(0, 0, 0.012), V(t.x, t.y, t.z + 0.012), 0.008, 0.006, dragon ? '#ffe9a0' : '#ff5a22'))); add(veins, mat(glowMat()), pivot); }
        B.flaps.push({ g: pivot, side, base: 0.05, amp: id === 'angel' ? 0.18 : demon ? 0.22 : 0.16, rate: id === 'angel' ? 2.0 : 1.5, ph: side < 0 ? 0.08 : 0 });
      }
      if (dragon) {   // Rückenstacheln + aufsteigende Glut
        add(merge([0, 1, 2].map(i => part(spike(0.035 - i * 0.006, 0.2 - i * 0.04, 5), '#ffcc55', 0, 0.22 - i * 0.2, BZ - 0.01, -0.5, 0, 0))), mat(litMat('#ff8a20', 0.5, 0.6, 0.3)));
        for (let i = 0; i < 9; i++) { const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.014 + (i % 3) * 0.004, 0), mat(flatGlow(i % 2 ? '#ffb040' : '#ff6a1a', 2.4))); e.frustumCulled = false; B.group.add(e); B.geos.push(e.geometry); B.embers.push({ o: e, s: 0.25 + Math.random() * 0.4, x: (Math.random() - 0.5) * 1.1, ph: Math.random() }); }
      }
      break;
    }
    case 'galaxy': {
      const o = grp(0, 0.08, BZ - 0.04), cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.18, 'rgba(255,140,255,.75)'); gr.addColorStop(0.55, 'rgba(110,60,255,.45)'); gr.addColorStop(1, 'rgba(20,10,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 520; i++) { const arm = i % 3, rr = Math.pow(Math.random(), 0.75) * 58, a = rr * 0.115 + arm * 2.094 + (Math.random() - 0.5) * 0.5; x.fillStyle = `hsla(${250 + Math.random() * 90},90%,${65 + Math.random() * 25}%,${0.25 + Math.random() * 0.6})`; x.beginPath(); x.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 0.6 + Math.random() * 1.4, 0, 6.3); x.fill(); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; B.tex.push(tex);
      const disc = add(new THREE.CircleGeometry(0.29, 40).rotateY(Math.PI), mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })), o);
      const ring = add(new THREE.TorusGeometry(0.31, 0.02, 8, 48), mat(flatGlow('#ffffff', 1.8)), o); B.hue.push(ring.material);
      const st = new THREE.Group(); o.add(st); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, m = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), mat(flatGlow('#ffffff', 2.2))); m.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0); m.frustumCulled = false; st.add(m); B.geos.push(m.geometry); B.hue.push(m.material); }
      B.spin.push({ o: disc, ax: 'z', v: 1.1 }, { o: st, ax: 'z', v: -0.7 });
      break;
    }
  }
}

export function tickBack(ch, dt, speed) {
  const B = ch.back; if (!B) return; B.t += dt; const t = B.t, sp = Math.min(1, speed / 8);
  for (const f of B.flaps) f.g.rotation.y = f.side * (f.base + sp * 0.28 + Math.sin(t * f.rate * 2 + f.ph) * f.amp * (1 - 0.5 * sp));
  for (const s of B.spin) s.o.rotation[s.ax] += dt * s.v;
  for (const f of B.flames) { const k = 0.75 + 0.45 * Math.abs(Math.sin(t * 41 + f.ph)) + 0.3 * sp; f.o.scale.set(1, k, 1); }
  for (const p of B.pulses) p.o.scale.setScalar(1 + p.k * Math.sin(t * 4));
  for (const b of B.bobs) b.o.position.set(b.x + Math.cos(t * 0.9) * b.r, b.y + Math.sin(t * 1.7) * 0.05, b.z + Math.sin(t * 0.9) * b.r);
  if (B.sway) B.sway.rotation.z = Math.sin(t * 1.4) * 0.05 + sp * 0.02;
  if (B.hue.length) { const h = (t * 0.15) % 1; for (const m of B.hue) m.color.setHSL(h, 0.85, 0.62).multiplyScalar(1.8); }
  for (const e of B.embers) { const u = (t * e.s + e.ph) % 1; e.o.position.set(e.x * 0.35 + Math.sin(t * 2 + e.ph * 9) * 0.04, -0.05 + u * 0.95, BZ - 0.1 - Math.sin(u * 3.14) * 0.12); e.o.scale.setScalar(Math.sin(u * 3.14)); e.o.rotation.y += dt * 4; }
}

export function disposeBack(ch) {
  const B = ch.back; if (!B) return; B.group.removeFromParent();
  for (const g of B.geos) g.dispose(); for (const m of B.mats) m.dispose(); for (const t of B.tex) t.dispose(); ch.back = null;
}
