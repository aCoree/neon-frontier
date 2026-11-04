// Effekte: GPU-Partikel (additiv + normal), Leuchtspuren, Laserstrahlen, Mündungsfeuer, Explosionen, Einschläge, Decals, Schadenszahlen.
import * as THREE from 'three';

const VERT = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; varying float vFog;
uniform float uScale; uniform float uFogD;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.1,-mv.z), 0.0, 480.0); gl_Position = projectionMatrix * mv;
  float d = -mv.z; vFog = exp(-uFogD*uFogD*d*d); }`;
const FRAG = `
varying vec4 vColor; varying float vFog; uniform vec3 uFogC; uniform float uAdd;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c)*2.0; if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.0, d); a = a*a*(3.0-2.0*a);
  vec3 col = vColor.rgb; float al = vColor.a * a;
  if (uAdd < 0.5) col = mix(uFogC, col, vFog);
  gl_FragColor = vec4(col, al); }`;

class PSystem {
  constructor(scene, n, add) {
    this.n = n; this.head = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n); this.a0 = new Float32Array(n); this.s0 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.u = { uScale: { value: 800 }, uFogD: { value: 0.004 }, uFogC: { value: new THREE.Color(0xb2d2ec) }, uAdd: { value: add ? 1 : 0 } };
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = add ? 5 : 4;
    scene.add(this.points);
  }
  spawn(o) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.max[i] = o.life || 1; this.grow[i] = o.grow || 0; this.drag[i] = o.drag ?? 0.5; this.grav[i] = o.grav || 0;
    this.s0[i] = o.size || 0.3; this.size[i] = this.s0[i]; this.a0[i] = o.a ?? 1;
    this.col[i * 4] = o.r ?? 1; this.col[i * 4 + 1] = o.g ?? 1; this.col[i * 4 + 2] = o.b ?? 1; this.col[i * 4 + 3] = this.a0[i];
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt), t = 1 - this.life[i] / this.max[i];
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0, this.s0[i] + this.grow[i] * t * this.max[i]);
      this.col[i * 4 + 3] = this.a0[i] * (t < 0.12 ? t / 0.12 : 1) * (1 - Math.pow(t, 2.2));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}

function gradTex(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 0);
  if (kind === 'tracer') { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)'); }
  else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
  x.fillStyle = g; x.fillRect(0, 0, 128, 16);
  const v = x.createLinearGradient(0, 0, 0, 16); v.addColorStop(0, 'rgba(0,0,0,0.9)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.9)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = v; x.fillRect(0, 0, 128, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class FX {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.add = new PSystem(scene, 3500, true);
    this.norm = new PSystem(scene, 1800, false);
    // Leuchtspuren
    this.tracerTex = gradTex('tracer'); this.beamTex = gradTex('beam');
    this.tracers = []; this.tPool = [];
    const quad = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: this.tracerTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 6; scene.add(m); this.tPool.push(m);
    }
    this.beams = new Map();
    this.quad = quad;
    // Lichter für Blitze
    this.flashLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffaa55, 0, 22, 1.6); scene.add(l); return { l, t: 0, dur: 0.1, k: 0 }; });
    // Decals
    const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dx = dc.getContext('2d'); const rg = dx.createRadialGradient(32, 32, 2, 32, 32, 30); rg.addColorStop(0, 'rgba(0,0,0,0.95)'); rg.addColorStop(0.55, 'rgba(10,10,10,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); dx.fillStyle = rg; dx.fillRect(0, 0, 64, 64);
    const dtex = new THREE.CanvasTexture(dc);
    this.decals = []; this.dHead = 0;
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true })); m.visible = false; m.userData.t = 0; scene.add(m); this.decals.push(m); }
    // Schockwellen
    this.rings = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.visible = false; m.userData = { t: 0, dur: 0.5, r: 5 }; scene.add(m); this.rings.push(m); }
    this.layer = document.getElementById('dmg-layer');
    this.numbers = []; this.nPool = [];
    this.shake = 0; this.shakeV = new THREE.Vector3(); this.fogD = 0.0042;
  }
  spawn(o) { (o.add ? this.add : this.norm).spawn(o); }

  // ---- Leuchtspur ----
  tracer(a, b, color = 0xffe08a, o = {}) {
    const m = this.tPool.find(t => !t.visible); if (!m) return;
    const len = Math.max(0.1, a.distanceTo(b));
    this.tracers.push({ m, a: a.clone(), b: b.clone(), t: 0, dur: Math.max(0.05, len / (o.speed || 320)), len: Math.min(len, o.len || 9), w: o.w || 0.05, color, hold: o.hold || 0 });
    m.material.color.set(color).multiplyScalar(o.k || 3); m.visible = true;
  }
  orient(m, a, b, w, cam) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1e-4;
    const X = new THREE.Vector3(dx / l, dy / l, dz / l);
    const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const Z = cam.position.clone().sub(mid); Z.addScaledVector(X, -Z.dot(X)).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    m.matrix.makeBasis(X.multiplyScalar(l), Y.multiplyScalar(w), Z); m.matrix.setPosition(mid); m.matrixAutoUpdate = false; m.matrixWorld.copy(m.matrix); m.matrixWorldNeedsUpdate = false;
  }
  // Dauerstrahl (Laser): key = Schütze, jedes Frame aktualisieren
  beam(key, a, b, color, w = 0.09) {
    let e = this.beams.get(key);
    if (!e) {
      const m = new THREE.Mesh(this.quad, new THREE.MeshBasicMaterial({ map: this.beamTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }));
      const core = new THREE.Mesh(this.quad, new THREE.MeshBasicMaterial({ map: this.beamTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false }));
      m.frustumCulled = core.frustumCulled = false; m.renderOrder = 6; core.renderOrder = 7; this.scene.add(m, core); e = { m, core, t: 0 }; this.beams.set(key, e);
    }
    e.t = 0.09; e.a = a.clone(); e.b = b.clone(); e.w = w; e.m.material.color.set(color).multiplyScalar(3); e.core.material.color.set(0xffffff).multiplyScalar(3.5);
    e.m.visible = e.core.visible = true;
  }

  // ---- Mündungsfeuer ----
  muzzle(pos, dir, color = 0xffd27a, size = 1, light = true) {
    const c = new THREE.Color(color);
    this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, size: 0.9 * size, life: 0.06, r: c.r * 5, g: c.g * 5, b: c.b * 5, a: 1, drag: 0, grow: 0 });
    this.add.spawn({ x: pos.x + dir.x * 0.3, y: pos.y + dir.y * 0.3, z: pos.z + dir.z * 0.3, size: 0.55 * size, life: 0.05, r: c.r * 4, g: c.g * 4, b: c.b * 4, a: 1, drag: 0 });
    for (let i = 0; i < 4; i++) this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 12 + (Math.random() - 0.5) * 6, vy: dir.y * 12 + (Math.random() - 0.5) * 6, vz: dir.z * 12 + (Math.random() - 0.5) * 6, size: 0.1, life: 0.12, r: c.r * 4, g: c.g * 4, b: c.b * 4, a: 1, drag: 2 });
    if (light) this.flash(pos, color, 2.2 * size, 0.07, 14);
  }
  flash(pos, color, k, dur, dist = 16) {
    const f = this.flashLights.reduce((a, b) => (a.t < b.t ? a : b));
    f.l.position.copy(pos); f.l.color.set(color); f.l.distance = dist; f.k = k * 40; f.t = dur; f.dur = dur;
  }

  // ---- Einschläge ----
  impact(pos, n, kind = 'concrete', color = 0xffd27a) {
    const cols = { concrete: [0.75, 0.72, 0.68], dirt: [0.45, 0.34, 0.22], metal: [1, 0.85, 0.5], wood: [0.6, 0.42, 0.25], glass: [0.7, 0.9, 1], energy: null, flesh: [1, 0.3, 0.3] };
    const c = cols[kind] || [0.7, 0.7, 0.7];
    const ec = new THREE.Color(color);
    const count = kind === 'energy' ? 8 : 6;
    for (let i = 0; i < count; i++) {
      const sp = 2 + Math.random() * 6, a = Math.random() * 6.28, s = Math.random() * 0.8;
      const vx = n.x * sp + Math.cos(a) * s * sp * 0.5, vy = n.y * sp + (Math.random() * 2), vz = n.z * sp + Math.sin(a) * s * sp * 0.5;
      if (kind === 'energy') this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx, vy, vz, size: 0.12, life: 0.35, r: ec.r * 4, g: ec.g * 4, b: ec.b * 4, a: 1, drag: 3, grav: 6 });
      else if (kind === 'flesh') this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx, vy, vz, size: 0.11, life: 0.3, r: 3.5, g: 1.2, b: 0.6, a: 1, drag: 3, grav: 8 });
      else this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx, vy, vz, size: 0.07, life: 0.25, r: 4, g: 3, b: 1.6, a: 1, drag: 2, grav: 9 });
    }
    if (kind !== 'energy' && kind !== 'flesh') this.norm.spawn({ x: pos.x + n.x * 0.05, y: pos.y + n.y * 0.05, z: pos.z + n.z * 0.05, vx: n.x * 0.6, vy: n.y * 0.6 + 0.4, vz: n.z * 0.6, size: 0.5, grow: 0.9, life: 0.7, r: c[0], g: c[1], b: c[2], a: 0.45, drag: 1.5 });
    this.add.spawn({ x: pos.x + n.x * 0.05, y: pos.y + n.y * 0.05, z: pos.z + n.z * 0.05, size: kind === 'energy' ? 0.7 : 0.35, life: 0.07, r: ec.r * 3, g: ec.g * 3, b: ec.b * 3, a: 1, drag: 0 });
  }
  decal(pos, n, size = 0.22, life = 25) {
    const m = this.decals[this.dHead]; this.dHead = (this.dHead + 1) % this.decals.length;
    m.position.set(pos.x + n.x * 0.02, pos.y + n.y * 0.02, pos.z + n.z * 0.02);
    m.lookAt(pos.x + n.x, pos.y + n.y, pos.z + n.z); m.rotateZ(Math.random() * 6); m.scale.set(size, size, 1); m.visible = true; m.userData.t = life; m.userData.life = life; m.material.opacity = 1;
  }

  explosion(pos, radius = 5, o = {}) {
    const r = radius, c = o.color ? new THREE.Color(o.color) : new THREE.Color(1, 0.55, 0.15);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, sp = r * (0.4 + Math.random() * 1.3), h = Math.sqrt(1 - u * u);
      this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * h * sp, vy: u * sp * 0.8 + 1, vz: Math.sin(a) * h * sp, size: r * (0.4 + Math.random() * 0.5), grow: -r * 0.3, life: 0.5 + Math.random() * 0.3, r: c.r * 3.5, g: c.g * 3, b: c.b * 3, a: 0.95, drag: 3.5 });
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28, sp = r * (0.8 + Math.random() * 1.4);
      this.norm.spawn({ x: pos.x + (Math.random() - 0.5) * r * 0.5, y: pos.y + Math.random() * r * 0.3, z: pos.z + (Math.random() - 0.5) * r * 0.5, vx: Math.cos(a) * sp * 0.5, vy: 1.5 + Math.random() * r * 0.8, vz: Math.sin(a) * sp * 0.5, size: r * (0.5 + Math.random() * 0.5), grow: r * 0.55, life: 1.8 + Math.random() * 1.6, r: 0.2, g: 0.19, b: 0.18, a: 0.55, drag: 0.9 });
    }
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, u = Math.random() * 0.8, sp = r * (2 + Math.random() * 3); this.add.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * sp, vy: 4 + u * sp, vz: Math.sin(a) * sp, size: 0.14, life: 0.7 + Math.random() * 0.5, r: 5, g: 3, b: 1, a: 1, drag: 0.6, grav: 14 }); }
    this.add.spawn({ x: pos.x, y: pos.y + 0.5, z: pos.z, size: r * 2.4, life: 0.16, r: 6, g: 4.5, b: 2.5, a: 1, drag: 0 });
    const ring = this.rings.find(q => !q.visible); if (ring) { ring.visible = true; ring.userData = { t: 0, dur: 0.45, r: r * 1.2 }; ring.position.set(pos.x, pos.y + 0.15, pos.z); ring.rotation.x = -Math.PI / 2; ring.material.color.copy(c).multiplyScalar(3); }
    this.flash(pos, 0xffa050, 5, 0.35, r * 6);
    this.shakeAt(pos, r * 0.12);
  }
  shakeAt(pos, k) { const d = this.camera.position.distanceTo(pos); this.shake = Math.max(this.shake, k * Math.max(0, 1 - d / 40)); }
  smokeCloud(pos, radius, time = 14) { // Rauchbombe: dauerhafte Wolke (wird von game aufgerufen, spawnt periodisch)
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * radius * 0.7; this.norm.spawn({ x: pos.x + Math.cos(a) * d, y: pos.y + 0.4 + Math.random() * 1.5, z: pos.z + Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8, size: radius * 0.7, grow: radius * 0.06, life: 5 + Math.random() * 3, r: 0.82, g: 0.84, b: 0.86, a: 0.8, drag: 0.4 }); }
  }

  // ---- Schadenszahlen ----
  damageNumber(pos, text, kind = '') {
    if (!this.layer) return;
    let el = this.nPool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'dmgnum'; this.layer.appendChild(el); }
    el.textContent = text; el.className = 'dmgnum ' + kind; el.style.display = 'block';
    this.numbers.push({ el, p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), t: 0, vy: 1.4 });
  }

  update(dt, cam, quality = 1) {
    const h = this.renderer.domElement.height / this.renderer.getPixelRatio();
    const scale = (this.renderer.domElement.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    for (const s of [this.add, this.norm]) { s.u.uScale.value = scale; s.u.uFogD.value = this.fogD; s.update(dt); if (this.scene.fog) { s.u.uFogC.value.copy(this.scene.fog.color); s.u.uFogD.value = this.scene.fog.density; } }
    // Spuren
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]; tr.t += dt;
      const u = tr.t / tr.dur;
      if (u > 1 + tr.len / Math.max(0.1, tr.a.distanceTo(tr.b)) + 0.02) { tr.m.visible = false; this.tracers.splice(i, 1); continue; }
      const L = tr.a.distanceTo(tr.b), hd = Math.min(1, u), tl = Math.max(0, u - tr.len / L);
      const head = tr.a.clone().lerp(tr.b, hd), tail = tr.a.clone().lerp(tr.b, Math.min(1, tl));
      if (head.distanceToSquared(tail) < 1e-5) { tr.m.visible = false; continue; }
      this.orient(tr.m, tail, head, tr.w, cam);
      tr.m.material.opacity = 1;
    }
    for (const [k, e] of this.beams) {
      e.t -= dt;
      if (e.t <= 0) { e.m.visible = e.core.visible = false; continue; }
      const flick = 1 + Math.sin(performance.now() * 0.05) * 0.15;
      this.orient(e.m, e.a, e.b, e.w * 2.6 * flick, cam); this.orient(e.core, e.a, e.b, e.w * 0.9 * flick, cam);
    }
    for (const f of this.flashLights) { f.t = Math.max(0, f.t - dt); f.l.intensity = f.dur > 0 ? f.k * (f.t / f.dur) : 0; }
    for (const d of this.decals) { if (!d.visible) continue; d.userData.t -= dt; d.material.opacity = Math.min(1, d.userData.t / 3); if (d.userData.t <= 0) d.visible = false; }
    for (const r of this.rings) { if (!r.visible) continue; const u = r.userData; u.t += dt; const k = u.t / u.dur; if (k >= 1) { r.visible = false; continue; } const s = 0.5 + k * u.r; r.scale.set(s, s, s); r.material.opacity = (1 - k) * 0.8; }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    // Zahlen
    const v = new THREE.Vector3(), w = window.innerWidth, hh = window.innerHeight;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]; n.t += dt; n.p.y += n.vy * dt; n.vy *= 0.97;
      if (n.t > 0.95) { n.el.style.display = 'none'; this.nPool.push(n.el); this.numbers.splice(i, 1); continue; }
      v.copy(n.p).project(this.camera);
      if (v.z > 1 || v.z < -1) { n.el.style.opacity = 0; continue; }
      n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * hh}px) translate(-50%,-50%) scale(${0.9 + Math.max(0, 0.3 - n.t) * 2})`;
      n.el.style.opacity = Math.min(1, (0.95 - n.t) * 3);
    }
  }
}
