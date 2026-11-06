// Baut die komplette 3D-Welt (Gelände, Gebäude, Vegetation, Wasser, Lichter, Animationen) aus den Kartendaten.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fixCoplanar } from './zfix.js';
import { Batch, addBox, addCyl, addSphere, addRibbon, treeGeos, smallGeos } from './geo.js';
import { terrainTextures, glowSpriteTexture, labelTexture, updateNight } from './textures.js';
import { fbm, noise2, smoothstep, lerp, clamp, mulberry32 } from '../shared/util.js';
import { ZONES, LAKE, SEA_LEVEL, zoneNorm, grassMask } from '../shared/mapdata.js';

const CELL = 110;
const PLATEAU = { city: '#74777d', industrial: '#6f6a60', military: '#8a9097', coast: '#d9c58f', training: '#767b72', station: '#6c716d' };

export class WorldView {
  constructor(scene, map, world, mats, quality) {
    this.scene = scene; this.map = map; this.world = world; this.M = mats; this.q = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.windU = { value: 0 };
    this.anims = []; this.dynDoors = new Map(); this.dynMovers = new Map(); this.chestMeshes = new Map(); this.switchMeshes = new Map();
    this.labels = []; this.glowPoints = []; this.night = 0;
    this.lightPool = []; this.lightTimer = 0; this.fx = null;
    this.propSets = []; this.grassChunks = [];
    this.rng = mulberry32(5);
  }

  async build(progress = () => {}) {
    const step = async (name, fn, p) => { progress(p, name); await new Promise(r => setTimeout(r, 0)); fn(); };
    await step('Gelände formen…', () => this.buildTerrain(), 0.1);
    await step('Gebäude errichten…', () => this.buildParts(), 0.3);
    await step('Wälder pflanzen…', () => this.buildProps(), 0.6);
    await step('Gras säen…', () => this.buildGrass(), 0.75);
    await step('Wasser einlassen…', () => this.buildWater(), 0.82);
    await step('Lichter & Details…', () => { this.buildGlows(); this.buildLabels(); this.buildLights(); this.buildAnims(); this.buildInteractive(); }, 0.9);
    progress(1, 'Fertig');
  }

  // ---------------- Gelände ----------------
  biome(x, z, h, slope) {
    const c = new THREE.Color();
    const n = fbm(x * 0.06, z * 0.06, 3), n2 = fbm(x * 0.4 + 9, z * 0.4, 2);
    const forest = ZONES.find(q => q.id === 'forest');
    const fw = 1 - smoothstep(0.7, 1.3, zoneNorm(forest, x, z));
    const g0 = new THREE.Color('#6fb040').lerp(new THREE.Color('#a5c850'), n);
    const g1 = new THREE.Color('#427f3a').lerp(new THREE.Color('#639e46'), n);
    c.copy(g0).lerp(g1, fw * 0.8);
    c.multiplyScalar(0.9 + n2 * 0.2);
    c.lerp(new THREE.Color('#d6c48e'), smoothstep(110, 128, z) * smoothstep(3, 0.5, h));
    c.lerp(new THREE.Color('#8f8466'), smoothstep(-0.2, -2.5, h));
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    c.lerp(new THREE.Color('#9a8c68'), (1 - smoothstep(LAKE.r * 0.9, LAKE.r * 1.5, dl)));
    for (const zn of ZONES) {
      const col = PLATEAU[zn.id]; if (!col) continue;
      const w = 1 - smoothstep(0.86, 1.3, zoneNorm(zn, x, z));
      if (w > 0) c.lerp(new THREE.Color(col).multiplyScalar(0.92 + n2 * 0.16), w);
    }
    c.lerp(new THREE.Color('#8b857b').multiplyScalar(0.85 + n2 * 0.3), Math.max(smoothstep(0.55, 1.0, slope), smoothstep(15, 24, h)));
    c.lerp(new THREE.Color('#f1f5f9'), smoothstep(38, 48, h + n * 6) * 0.95);
    return c;
  }

  buildTerrain() {
    const step = 2, R = 258, N = (R * 2) / step;
    const pos = [], col = [], uv = [], idx = [];
    const hs = this.map.holes, T = this.map.terrainY;
    const hv = (x, z) => T(x, z);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -R + i * step, z = -R + j * step, h = hv(x, z);
      const sl = Math.hypot(hv(x + 1.5, z) - hv(x - 1.5, z), hv(x, z + 1.5) - hv(x, z - 1.5)) / 3;
      const c = this.biome(x, z, h, sl);
      pos.push(x, h, z); col.push(c.r, c.g, c.b); uv.push(x / 7, z / 7);
    }
    const inHole = (x, z) => { for (const h of hs) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true; return false; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cx = -R + (i + 0.5) * step, cz = -R + (j + 0.5) * step;
      if (inHole(cx, cz)) continue;
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: terrainTextures(), vertexColors: true, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.castShadow = false;
    this.terrain = mesh; this.group.add(mesh);
  }

  // ---------------- Bauteile ----------------
  buildParts() {
    fixCoplanar(this.map.parts);   // gleiche Ebene = Flackern (Z-Fighting) → minimal staffeln
    const M = this.M, batches = new Map();
    const getB = (m, p) => {
      const nc = p.nocast || p.m === 'roadLine' ? 1 : 0;
      const key = m + '|' + nc + '|' + Math.floor((p.x ?? p.pts?.[0][0]) / CELL) + '|' + Math.floor((p.z ?? p.pts?.[0][1]) / CELL);
      let b = batches.get(key); if (!b) { b = { b: new Batch(), m, nc }; batches.set(key, b); } return b.b;
    };
    const missing = new Set();
    for (const p of this.map.parts) {
      let mat = M[p.m]; if (!mat) { missing.add(p.m); mat = M.concrete; p.m = 'concrete'; }
      const tile = p.tile || mat.userData.tile || 4;
      if (p.dyn) { this.buildDyn(p, mat, tile); continue; }
      if (p.t === 'b') addBox(getB(p.m, p), p, tile);
      else if (p.t === 'c') addCyl(getB(p.m, p), p, tile);
      else if (p.t === 's') addSphere(getB(p.m, p), p);
      else if (p.t === 'r') addRibbon(getB(p.m, p), p, this.map.terrainY);
    }
    if (missing.size) console.warn('Fehlende Materialien:', [...missing]);
    for (const { b, m, nc } of batches.values()) {
      if (!b.n) continue;
      const mat = M[m];
      const mesh = new THREE.Mesh(b.build(), mat);
      const trans = mat.transparent || mat.userData.glow;
      mesh.castShadow = !nc && !trans; mesh.receiveShadow = !mat.userData.glow;
      if (mat.transparent) mesh.renderOrder = 2;
      this.group.add(mesh); (this.staticMeshes || (this.staticMeshes = [])).push(mesh);
    }
  }
  buildDyn(p, mat, tile) {
    const b = new Batch(); if (p.t === 'b') addBox(b, p, tile);
    const mesh = new THREE.Mesh(b.build(), mat); mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const [kind, id] = p.dyn.split(':');
    if (kind === 'door') this.dynDoors.set(id, { mesh, y0: 0, t: 0, p, target: 0 });
    else this.dynMovers.set(id, { mesh, y0: p.y });
  }
  setDoor(id, open) { const d = this.dynDoors.get(id); if (d) d.target = open ? 1 : 0; }
  setMoverY(id, y) { const m = this.dynMovers.get(id); if (m) m.mesh.position.y = y - m.y0; }

  // ---------------- Vegetation ----------------
  buildProps() {
    const T = this.map.terrainY, tg = treeGeos(), sg = smallGeos();
    const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const windU = this.windU;
    foliage.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sw = max(position.y, 0.0);
        transformed.x += sin(uTime*1.3 + ip.x*0.37 + sw*0.4) * sw*sw*0.0042;
        transformed.z += cos(uTime*1.05 + ip.z*0.31 + sw*0.4) * sw*sw*0.0036;`);
    };
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const mushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color(0x6a3cff), emissiveIntensity: 0.0 });
    this.mushMat = mushMat;
    const types = {
      pine: [tg.pine, tg.pineFar, foliage], oak: [tg.oak, tg.oakFar, foliage], birch: [tg.birch, tg.birchFar, foliage], palm: [tg.palm, tg.palm, foliage], dead: [tg.dead, tg.dead, foliage],
      bush: [sg.bush, null, foliage], rock1: [sg.rock1, null, rockMat], rock2: [sg.rock2, null, rockMat], rock3: [sg.rock3, null, rockMat], flower: [sg.flower, null, foliage], mush: [sg.mush, null, mushMat],
    };
    const by = {};
    for (const p of this.map.props) (by[p.t] || (by[p.t] = [])).push(p);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const flowerCols = [0xffffff, 0xffd84a, 0xff6a8a, 0xb28aff, 0x6ad0ff];
    for (const [t, list] of Object.entries(by)) {
      const def = types[t]; if (!def) continue;
      const near = new THREE.InstancedMesh(def[0], def[2], list.length);
      const far = def[1] && def[1] !== def[0] ? new THREE.InstancedMesh(def[1], def[2], list.length) : null;
      near.castShadow = !['flower'].includes(t); near.receiveShadow = true; near.frustumCulled = false;
      if (far) { far.frustumCulled = false; far.receiveShadow = false; }
      const set = { t, list, near, far, mats: [], dist: t.startsWith('rock') || t === 'bush' ? 120 : 260, nearD: t === 'pine' || t === 'oak' || t === 'birch' ? 75 : 1e9 };
      if (t === 'flower' || t === 'bush' || t === 'pine' || t === 'oak' || t === 'birch') { const col = new THREE.Color(); list.forEach((p, i) => { col.set(t === 'flower' ? flowerCols[i % 5] : 0xffffff).multiplyScalar(t === 'flower' ? 1 : 0.85 + (noise2(p.x * 0.3, p.z * 0.3) * 0.3)); near.setColorAt(i, col); if (far) far.setColorAt(i, col); }); }
      list.forEach((p, i) => {
        const y = p.y ?? T(p.x, p.z);
        q.setFromAxisAngle(up, p.rot || 0); s.setScalar(p.s || 1); pv.set(p.x, y - 0.05, p.z);
        m4.compose(pv, q, s); set.mats.push(m4.clone());
      });
      this.propSets.push(set); this.group.add(near); if (far) this.group.add(far);
    }
    this.lastLodPos = new THREE.Vector3(1e9, 0, 1e9);
    this.updateLOD(new THREE.Vector3(0, 0, 0), true);
  }
  updateLOD(cam, force = false) {
    if (!force && cam.distanceToSquared(this.lastLodPos) < 25) return;
    this.lastLodPos.copy(cam);
    for (const set of this.propSets) {
      let n = 0, f = 0; const d2n = set.nearD * set.nearD, d2f = set.dist * set.dist;
      for (let i = 0; i < set.list.length; i++) {
        const p = set.list[i], dx = p.x - cam.x, dz = p.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > d2f) continue;
        if (d2 < d2n || !set.far) { set.near.setMatrixAt(n, set.mats[i]); if (set.near.instanceColor) set.near.instanceColor.setXYZ(n, ...this._ic(set, i)); n++; }
        else { set.far.setMatrixAt(f, set.mats[i]); if (set.far.instanceColor) set.far.instanceColor.setXYZ(f, ...this._ic(set, i)); f++; }
      }
      set.near.count = n; set.near.instanceMatrix.needsUpdate = true; if (set.near.instanceColor) set.near.instanceColor.needsUpdate = true;
      if (set.far) { set.far.count = f; set.far.instanceMatrix.needsUpdate = true; if (set.far.instanceColor) set.far.instanceColor.needsUpdate = true; }
    }
  }
  _ic(set, i) {
    if (!set._cols) { const c = new THREE.Color(), arr = []; const fl = [0xffffff, 0xffd84a, 0xff6a8a, 0xb28aff, 0x6ad0ff]; set.list.forEach((p, k) => { c.set(set.t === 'flower' ? fl[k % 5] : 0xffffff).multiplyScalar(set.t === 'flower' ? 1 : 0.85 + noise2(p.x * 0.3, p.z * 0.3) * 0.3); arr.push([c.r, c.g, c.b]); }); set._cols = arr; }
    return set._cols[i];
  }

  buildGrass() {
    const sg = smallGeos();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const windU = this.windU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        transformed.x += sin(uTime*2.1 + ip.x*0.6 + ip.z*0.4) * position.y * position.y * 0.35;
        transformed.z += cos(uTime*1.7 + ip.z*0.5) * position.y * position.y * 0.25;`);
    };
    this.grassMat = mat;
    const CH = 32, rng = this.rng, T = this.map.terrainY, dens = this.q.grass;
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (let cx = -208; cx < 208; cx += CH) for (let cz = -208; cz < 208; cz += CH) {
      const pts = [];
      const target = Math.round(CH * CH * 0.2 * dens);
      for (let i = 0; i < target; i++) {
        const x = cx + rng() * CH, z = cz + rng() * CH;
        const mk = grassMask(x, z); if (rng() > mk) continue;
        const y = T(x, z); if (y < SEA_LEVEL + 0.5 || y > 24) continue;
        // nicht in/auf Bauwerken
        const gy = this.world.groundAt(x, z, y + 3, 0.5); if (gy > y + 0.25) continue;
        pts.push([x, y, z]);
      }
      if (pts.length < 4) continue;
      const mesh = new THREE.InstancedMesh(sg.grass, mat, pts.length);
      pts.forEach((p, i) => {
        qq.setFromAxisAngle(up, rng() * 6.28); const s = 0.55 + rng() * 0.55; sc.set(s, s * (0.75 + rng() * 0.5), s); pv.set(p[0], p[1] - 0.04, p[2]);
        m4.compose(pv, qq, sc); mesh.setMatrixAt(i, m4);
        col.setHSL(0.24 + rng() * 0.08, 0.35 + rng() * 0.2, 0.55 + rng() * 0.3); mesh.setColorAt(i, col);
      });
      mesh.receiveShadow = false; mesh.castShadow = false; mesh.computeBoundingSphere();
      mesh.userData.c = new THREE.Vector3(cx + CH / 2, 0, cz + CH / 2);
      this.grassChunks.push(mesh); this.group.add(mesh);
    }
  }

  // ---------------- Wasser ----------------
  buildWater() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), d = x.createImageData(S, S);
    const H = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const u = i / S, v = j / S; const f = (a, b) => fbm(a * 6, b * 6, 4); H[j * S + i] = f(u, v) * (1 - u) * (1 - v) + f(u - 1, v) * u * (1 - v) + f(u, v - 1) * (1 - u) * v + f(u - 1, v - 1) * u * v; }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = H[j * S + (i + 1) % S] - H[j * S + (i + S - 1) % S], dz = H[((j + 1) % S) * S + i] - H[((j + S - 1) % S) * S + i];
      const l = Math.hypot(dx * 8, dz * 8, 1), k = (j * S + i) * 4;
      d.data[k] = (-dx * 8 / l * 0.5 + 0.5) * 255; d.data[k + 1] = (-dz * 8 / l * 0.5 + 0.5) * 255; d.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; d.data[k + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    const nm = new THREE.CanvasTexture(c); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(60, 60); nm.anisotropy = 4;
    const nm2 = nm.clone(); nm2.repeat.set(37, 37); nm2.needsUpdate = true;
    const mk = (map, op) => new THREE.MeshStandardMaterial({ color: 0x1f6c8d, roughness: 0.06, metalness: 0.15, transparent: true, opacity: op, normalMap: map, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.6, depthWrite: false });
    this.waterMats = [mk(nm, 0.82), mk(nm2, 0.4)];
    this.waterTex = [nm, nm2];
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1000), this.waterMats[0]); sea.rotation.x = -Math.PI / 2; sea.position.set(0, SEA_LEVEL, 100 + 500); sea.renderOrder = 1;
    const sea2 = new THREE.Mesh(sea.geometry, this.waterMats[1]); sea2.rotation.x = -Math.PI / 2; sea2.position.set(0, SEA_LEVEL + 0.04, 600); sea2.renderOrder = 1;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 1.8, 40), this.waterMats[0]); lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, SEA_LEVEL + 0.1, LAKE.z); lake.renderOrder = 1;
    // Tiefe Meeres-Verlängerung nach Süden & Seiten (Horizont)
    this.group.add(sea, sea2, lake);
  }
  waterUpdate(t) {
    this.waterTex[0].offset.set(t * 0.004, t * 0.002); this.waterTex[1].offset.set(-t * 0.003, t * 0.0045);
  }

  // ---------------- Glows / Labels / Lichter ----------------
  buildGlows() {
    const tex = glowSpriteTexture(), list = this.map.glows, n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), c = new THREE.Color();
    list.forEach((g, i) => { pos.set([g.x, g.y, g.z], i * 3); c.set(g.c).multiplyScalar(g.a * 1.1); col.set([c.r, c.g, c.b], i * 3); size[i] = g.s; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.glowU = { uMap: { value: tex }, uOp: { value: 0.1 }, uScale: { value: 360 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.glowU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'attribute vec3 aCol; attribute float aSize; uniform float uScale; varying vec3 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uOp; varying vec3 vC; void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vC, a * uOp); }' });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; this.group.add(pts); this.glowPoints = [pts];
  }
  buildLabels() {
    const cache = new Map();
    for (const l of this.map.labels) {
      const key = l.text + l.color;
      let tex = cache.get(key); if (!tex) { tex = labelTexture(l.text, l.color, l.bg); cache.set(key, tex); }
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l.size * 2.2, l.size * 0.55), mat);
      m.position.set(l.x, l.y, l.z); m.rotation.y = l.ry || 0; m.renderOrder = 3; m.userData.p = new THREE.Vector3(l.x, l.y, l.z);
      this.group.add(m); this.labels.push(m);
    }
  }
  buildLights() {
    for (let i = 0; i < this.q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1.6); l.userData = { src: null }; this.scene.add(l); this.lightPool.push(l); }
    this.dynLights = [];
  }
  updateLights(cam, t, dt) {
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.35;
      const lights = this.map.lights, cand = [];
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i], dx = l.x - cam.x, dy = l.y - cam.y, dz = l.z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) - l.d * 0.4;
        if (d < l.d * 1.4 + 6) cand.push([d, l]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      this.lightPool.forEach((pl, i) => { const c = cand[i]; pl.userData.src = c ? c[1] : null; if (c) { pl.position.set(c[1].x, c[1].y, c[1].z); pl.color.set(c[1].color); pl.distance = c[1].d; } });
    }
    const nightK = 0.35 + 0.65 * this.night;
    for (const pl of this.lightPool) {
      const s = pl.userData.src; if (!s) { pl.intensity = lerp(pl.intensity, 0, 0.2); continue; }
      let k = s.i * nightK * 8; if (s.f) k *= 1 - s.f * (0.5 + 0.5 * Math.sin(t * 17 + s.x) * Math.sin(t * 7.3 + s.z));
      pl.intensity = lerp(pl.intensity, k, 0.25);
    }
  }

  // ---------------- Animationen & Deko ----------------
  buildAnims() {
    const addA = (pos, fn, range = 170) => this.anims.push({ pos: new THREE.Vector3(pos.x, pos.y, pos.z), fn, range });
    const hdr = (hex, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.4, metalness: 0.2 });
    const darkM = this.M.metalDark;
    const beamMat = (hex, o = 0.16) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    for (const a of this.map.anims) {
      const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); this.group.add(g);
      switch (a.type) {
        case 'holo': {
          const rings = [0, 1, 2].map(i => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.7, 0.05, 6, 40), hdr(a.color, 2.2)); g.add(r); return r; });
          const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(a.color).multiplyScalar(2), wireframe: true, toneMapped: false })); g.add(core);
          addA(g.position, (t) => { rings.forEach((r, i) => { r.rotation.x = t * (0.5 + i * 0.3); r.rotation.y = t * (0.7 - i * 0.2); }); core.rotation.y = t; g.position.y = a.y + Math.sin(t) * 0.25; });
          break;
        }
        case 'beacon': case 'searchlight': {
          const len = a.type === 'beacon' ? 80 : 45, r = a.type === 'beacon' ? 7 : 4;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 14, 1, true), beamMat(a.type === 'beacon' ? 0xfff0b0 : 0xcfeaff, a.type === 'beacon' ? 0.22 : 0.12));
          cone.geometry.translate(0, -len / 2, 0); cone.geometry.rotateZ(Math.PI / 2); // Spitze am Ursprung, Strahl entlang +x... (nach -x wegen translate)
          cone.geometry.rotateY(Math.PI); g.add(cone);
          const sp = a.type === 'beacon' ? 0.9 : 0.5, ph = a.a || 0;
          addA(g.position, (t) => { g.rotation.y = t * sp + ph; g.rotation.z = a.type === 'searchlight' ? -0.35 : 0.05; }, 300);
          break;
        }
        case 'turbine': {
          const rotor = new THREE.Group(), r = a.r, geos = [0, 1, 2].map(i => new THREE.BoxGeometry(0.5, r, 0.14).translate(0, r / 2, 0).rotateZ(i * 2.094));
          const blades = new THREE.Mesh(mergeGeometries(geos), white); blades.castShadow = true; rotor.add(blades);
          const hub = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), white); g.add(hub);
          const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; holder.add(rotor); g.add(holder);
          const sp = 0.6 + this.rng() * 0.4, off = this.rng() * 6;
          addA(g.position, (t) => { rotor.rotation.z = t * sp + off; }, 260);
          break;
        }
        case 'radar': {
          const s = a.big ? 1.6 : 1;
          const dish = new THREE.Mesh(new THREE.SphereGeometry(3.2 * s, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xe0e6ea, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
          dish.rotation.x = -Math.PI / 3; dish.position.y = 2.4 * s; dish.castShadow = true;
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 3 * s, 6), darkM); arm.position.set(0, 3.0 * s, -0.5 * s); arm.rotation.x = -0.5;
          const feed = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 6, 6), hdr(0xff3355, 2)); feed.position.set(0, 4.4 * s, 1.8 * s);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 2.4 * s, 8), darkM); mast.position.y = 1.2 * s;
          const rot = new THREE.Group(); rot.add(dish, arm, feed); g.add(mast, rot);
          addA(g.position, (t) => { rot.rotation.y = t * 0.5; }, 240);
          break;
        }
        case 'rotor': {
          const rot = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(a.r, 0.06, 0.4), darkM); b.position.x = a.r / 2; b.rotation.y = i * Math.PI / 2; const h = new THREE.Group(); h.rotation.y = i * Math.PI / 2; b.rotation.y = 0; h.add(b); rot.add(h); }
          g.add(rot); addA(g.position, (t) => { rot.rotation.y = t * 22; }, 150);
          break;
        }
        case 'fan': {
          const rot = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.08), darkM); b.position.y = 1.6; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2; h.add(b); rot.add(h); }
          const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.2, 6, 24), darkM); g.add(rot, ring);
          addA(g.position, (t) => { rot.rotation.z = t * 6; }, 120);
          break;
        }
        case 'crane': {
          const trolley = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 3), this.M.craneYellow); const hook = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 0.2), darkM); hook.position.y = -3.5;
          const cont = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.45), this.M.containerRed); cont.position.y = -8.2; trolley.add(hook, cont); trolley.castShadow = cont.castShadow = true; g.add(trolley);
          addA(g.position, (t) => { trolley.position.x = Math.sin(t * 0.18) * a.span * 0.45; trolley.children[1].position.y = -8.2 + Math.sin(t * 0.9) * 0.6; }, 160);
          break;
        }
        case 'belt': {
          const crates = []; for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), this.M.militaryCrate); c.castShadow = true; g.add(c); crates.push(c); }
          addA(g.position, (t) => { crates.forEach((c, i) => { const u = ((t * 0.12 + i / crates.length) % 1); c.position.x = (u - 0.5) * a.len; c.position.y = 0.55; }); }, 90);
          break;
        }
        case 'piston': {
          const p = new THREE.Mesh(new THREE.BoxGeometry(3.4, a.h, 3.4), this.M.hazard); p.castShadow = true;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8), darkM); r.position.y = a.h / 2 + 7; p.add(r); g.add(p);
          addA(g.position, (t) => { const k = Math.max(0, Math.sin(t * 0.9)); p.position.y = -k * k * 7; }, 100);
          break;
        }
        case 'flag': {
          const geo = new THREE.PlaneGeometry(3.2, 1.9, 12, 4); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: a.color, side: THREE.DoubleSide, emissive: a.color, emissiveIntensity: 0.4, roughness: 0.8 })); m.position.x = 1.6; g.add(m);
          addA(g.position, (t) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.6; p.setZ(i, Math.sin(x * 2 - t * 5) * 0.12 * x); } p.needsUpdate = true; }, 100);
          break;
        }
        case 'reactor': {
          const rings = [0, 1, 2].map(i => { const r = new THREE.Mesh(new THREE.TorusGeometry(3.6 + i * 0.5, 0.08, 6, 36), hdr(0x40e8ff, 2)); g.add(r); return r; });
          addA(g.position, (t) => { rings.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(t * (0.8 + i * 0.3)) * 0.4; r.rotation.y = t * (0.6 + i * 0.2); r.position.y = Math.sin(t * 1.3 + i) * 1.6; }); }, 70);
          break;
        }
        case 'smoke': case 'fire': case 'fireflies': {
          const rate = a.type === 'smoke' ? (a.big ? 6 : 3.5) : a.type === 'fire' ? 26 : 2.2; let acc = 0;
          addA(g.position, (t, dt) => {
            const fx = this.fx; if (!fx) return; acc += dt * rate;
            while (acc > 1) {
              acc -= 1;
              if (a.type === 'smoke') fx.spawn({ x: a.x + (this.rng() - 0.5) * 1.4, y: a.y, z: a.z + (this.rng() - 0.5) * 1.4, vx: 1.2, vy: 3.2 + this.rng(), vz: 0.4, size: a.big ? 7 : 4, grow: a.big ? 3.2 : 2.4, life: 7, r: 0.7, g: 0.7, b: 0.72, a: 0.5, add: false, drag: 0.1 });
              else if (a.type === 'fire') fx.spawn({ x: a.x + (this.rng() - 0.5) * 0.6, y: a.y, z: a.z + (this.rng() - 0.5) * 0.6, vx: (this.rng() - 0.5) * 0.4, vy: 1.6 + this.rng() * 1.4, vz: (this.rng() - 0.5) * 0.4, size: 1.1, grow: -0.8, life: 0.8, r: 1.4, g: 0.55, b: 0.12, a: 0.9, add: true, drag: 0.3 });
              else { const aa = this.rng() * 6.28, rr = Math.sqrt(this.rng()) * a.r; const c = new THREE.Color(a.color ?? 0xd8ff7a); fx.spawn({ x: a.x + Math.cos(aa) * rr, y: a.y + (this.rng() - 0.5) * 2.4, z: a.z + Math.sin(aa) * rr, vx: (this.rng() - 0.5) * 0.5, vy: (this.rng() - 0.5) * 0.4, vz: (this.rng() - 0.5) * 0.5, size: 0.35, grow: 0, life: 4, r: c.r * 1.5, g: c.g * 1.5, b: c.b * 1.5, a: 0.9, add: true, drag: 0 }); }
            }
          }, a.type === 'fireflies' ? 70 : 150);
          break;
        }
      }
    }
  }

  // ---------------- Interaktive Objekte ----------------
  buildInteractive() {
    const M = this.M;
    const tierCol = [0x8aa4c8, 0xb36bff, 0xffc23d];
    const woodM = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.7, metalness: 0.1 });
    for (const c of this.map.chests) {
      const tc = tierCol[Math.min(2, c.tier - 1)];
      const g = new THREE.Group(); g.position.set(c.x, c.yv ?? this.world.groundAt(c.x, c.z, (c.y ?? 100) + 0.6), c.z); g.rotation.y = c.ry || 0;
      const metal = new THREE.MeshStandardMaterial({ color: tc, roughness: 0.3, metalness: 0.85, emissive: tc, emissiveIntensity: 0.25 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.75), woodM); base.position.y = 0.25; base.castShadow = true;
      const bands = [-0.4, 0.4].map(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.54, 0.79), metal); b.position.set(x, 0.25, 0); return b; });
      const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.5, -0.375);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 1.1, 12, 1, false, 0, Math.PI), woodM); lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.set(0, 0, 0.375); lid.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0);
      lid.geometry.rotateX(0);
      const lidBands = [-0.4, 0.4].map(x => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.12, 12, 1, false, 0, Math.PI), metal); b.rotation.z = Math.PI / 2; b.rotation.y = Math.PI / 2; b.position.set(x, 0, 0.375); return b; });
      lidPivot.add(lid, ...lidBands);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), metal); lock.position.set(0, 0.45, 0.4);
      const glowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(tc).multiplyScalar(2.5), toneMapped: false })); glowMesh.position.y = 0.52; glowMesh.visible = false;
      g.add(base, ...bands, lidPivot, lock, glowMesh);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.5, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: tc, transparent: true, opacity: 0.18 + 0.06 * c.tier, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); beam.position.y = 2.7; g.add(beam);
      this.group.add(g);
      this.chestMeshes.set(c.id, { g, lidPivot, open: 0, target: 0, glowMesh, beam, tc });
    }
    for (const s of this.map.switches) {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.ry || 0; this.group.add(g);
      const col = new THREE.Color(s.color);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.18), M.techDark); plate.position.y = 0.7; plate.castShadow = true; g.add(plate);
      const lampM = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), lampM); lamp.position.set(0, 1.12, 0.1); g.add(lamp);
      let arm = null;
      if (s.kind === 'lever') { const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), M.metal); base.position.set(0, 0.55, 0.1); arm = new THREE.Group(); arm.position.set(0, 0.55, 0.14); const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), M.metal); stick.position.y = 0.3; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), toneMapped: false })); knob.position.y = 0.62; arm.add(stick, knob); arm.rotation.x = -0.7; g.add(base, arm); }
      else if (s.kind === 'button') { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 12), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5), toneMapped: false })); cap.rotation.x = Math.PI / 2; cap.position.set(0, 0.6, 0.15); g.add(cap); }
      else { const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), toneMapped: false })); scr.position.set(0, 0.7, 0.1); g.add(scr); }
      this.switchMeshes.set(s.id, { g, arm, lampM, col, on: false });
    }
  }
  setChest(id, open) { const c = this.chestMeshes.get(id); if (c) { c.target = open ? 1 : 0; c.beam.visible = !open; c.glowMesh.visible = !open; } }
  setSwitch(id, on) { const s = this.switchMeshes.get(id); if (s) { s.on = on; s.lampM.color.copy(on ? new THREE.Color(0x4dff8a).multiplyScalar(2.2) : s.col.clone().multiplyScalar(2.2)); if (s.arm) s.arm.rotation.x = on ? 0.7 : -0.7; } }

  // ---------------- Update ----------------
  setNight(n) {
    this.night = n; updateNight(this.M, n);
    if (this.glowU) this.glowU.uOp.value = 0.10 + 0.55 * n;
    if (this.mushMat) this.mushMat.emissiveIntensity = n * 2.2;
  }
  update(dt, t, cam, focus) {
    this.windU.value = t; if (this.glowU && this.pxScale) this.glowU.uScale.value = this.pxScale;
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0 && this.staticMeshes) { // Distanz-Culling großer Kacheln (Sichtweite aus den Grafikeinstellungen)
      this.cullT = 0.4; const vd = this.viewDist || 450;
      for (const m of this.staticMeshes) { const bs = m.geometry.boundingSphere; m.visible = cam.distanceTo(bs.center) - bs.radius < vd; }
    }
    this.waterUpdate(t);
    this.updateLOD(cam);
    this.updateLights(focus || cam, t, dt);
    for (const a of this.anims) if (a.pos.distanceToSquared(cam) < a.range * a.range) a.fn(t, dt);
    const gd = this.q.grassDist;
    for (const c of this.grassChunks) c.visible = c.userData.c.distanceToSquared(cam) < gd * gd;
    for (const l of this.labels) l.visible = l.userData.p.distanceToSquared(cam) < 130 * 130;
    for (const d of this.dynDoors.values()) {
      d.t += (d.target - d.t) * Math.min(1, dt * 4);
      const h = d.p.h; d.mesh.position.y = d.t * (h - 0.15);
    }
    for (const c of this.chestMeshes.values()) { c.open += (c.target - c.open) * Math.min(1, dt * 6); c.lidPivot.rotation.x = -c.open * 1.9; }
  }
}
