// Himmel (prozeduraler Shader mit Wolken, Sonne, Mond, Sternen), Tageszeit, Licht, Nebel, Umgebungs-Reflexionen.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../shared/util.js';

const VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const FRAG = `
varying vec3 vDir;
uniform vec3 uSun, uMoon, uTop, uHor, uSunCol, uCloudLit, uCloudDark, uGround;
uniform float uTime, uNight, uCover;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(7.1,3.7); a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y,0.0,1.0);
  vec3 col = mix(uHor, uTop, pow(up, 0.55));
  if (d.y < 0.0) col = mix(uHor, uGround, smoothstep(0.0,-0.25,d.y));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(sd, 6.0)*0.25 + pow(sd, 64.0)*0.7 + smoothstep(0.9993, 0.9998, sd)*12.0);
  float md = max(dot(d, uMoon), 0.0);
  col += vec3(0.75,0.82,1.0) * (smoothstep(0.9990,0.9994,md)*2.5 + pow(md,40.0)*0.25) * uNight;
  // Sterne
  if (uNight > 0.01 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.3) * 120.0;
    float st = step(0.985, h21(floor(sp))) * (0.5 + 0.5*sin(uTime*2.0 + h21(floor(sp))*40.0));
    col += vec3(st) * uNight * smoothstep(0.0,0.2,d.y);
  }
  // Wolken
  if (d.y > 0.015) {
    vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime*0.012, uTime*0.006);
    float n = fbm(cp) * 0.8 + fbm(cp*2.7 + 3.0)*0.35;
    float c = smoothstep(1.0 - uCover, 1.12 - uCover*0.6, n);
    c *= smoothstep(0.015, 0.22, d.y);
    float lit = clamp(fbm(cp + uSun.xz*0.15) * 1.3 - 0.1 + dot(d, uSun)*0.25, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    cc += uSunCol * pow(sd, 8.0) * 0.4;
    col = mix(col, cc, c * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const lerpC = (a, b, t) => a.clone().lerp(b, t);
const C = (h) => new THREE.Color(h);
const NIGHT = { top: C(0x050a1f), hor: C(0x142040), sun: C(0x0), cl: C(0x1a2640), cd: C(0x0a1020), fog: C(0x0c1630), amb: C(0x3a52a0), gnd: C(0x0b1020) };
const DAY = { top: C(0x2f78d6), hor: C(0xa6d0f2), sun: C(0xfff2d0), cl: C(0xffffff), cd: C(0x8fa4bd), fog: C(0xb2d2ec), amb: C(0x8ab0e0), gnd: C(0x4a5a3a) };
const GOLD = { top: C(0x3d5a9e), hor: C(0xffa65a), sun: C(0xffb060), cl: C(0xffd2a0), cd: C(0x8a5a60), fog: C(0xe6a574), amb: C(0xb08a8a), gnd: C(0x4a3a30) };

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.u = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) },
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uTime: { value: 0 }, uNight: { value: 0 }, uCover: { value: 0.55 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
    scene.add(this.mesh);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -72; sc.right = 72; sc.top = 72; sc.bottom = -72; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaac8ff, 0x445533, 0.8); scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x7f9cff, 0.0); scene.add(this.moon);
    scene.fog = new THREE.FogExp2(0xb2d2ec, 0.0042);
    this.hour = 14; this.night = 0; this.sunElev = 1;
    this.envScene = new THREE.Scene(); this.envMesh = new THREE.Mesh(this.mesh.geometry, this.mat); this.envScene.add(this.envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.lastEnvElev = -9; this.envTarget = null;
    this.shadowSize = 2048;
  }

  setShadowQuality(size) {
    this.shadowSize = size;
    this.sun.castShadow = size > 0;
    if (size > 0) { this.sun.shadow.mapSize.set(size, size); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
  }

  setHour(h, t = 0) {
    this.hour = ((h % 24) + 24) % 24;
    const ang = ((this.hour - 6) / 12) * Math.PI;
    const el = Math.sin(ang);
    this.sunElev = el;
    const sd = new THREE.Vector3(Math.cos(ang) * 0.92, el, 0.38).normalize();
    this.u.uSun.value.copy(sd); this.u.uMoon.value.copy(sd).negate();
    const day = smoothstep(-0.05, 0.38, el);
    const gold = Math.max(0, 1 - Math.abs(el - 0.02) / 0.3) * (el > -0.2 ? 1 : 0);
    const night = 1 - smoothstep(-0.18, 0.08, el);
    this.night = night;
    const mix = (k) => { let c = lerpC(NIGHT[k], DAY[k], day); c = lerpC(c, GOLD[k], gold * 0.85); return c; };
    this.u.uTop.value.copy(mix('top')); this.u.uHor.value.copy(mix('hor')); this.u.uSunCol.value.copy(mix('sun'));
    this.u.uCloudLit.value.copy(mix('cl')); this.u.uCloudDark.value.copy(mix('cd')); this.u.uGround.value.copy(mix('gnd'));
    this.u.uNight.value = night; this.u.uTime.value = t;
    // Lichter
    const sunI = smoothstep(-0.04, 0.3, el) * 3.2;
    this.sun.intensity = sunI; this.sun.color.copy(mix('sun')).lerp(C(0xffffff), 0.25 * day);
    this.sunDir = sd;
    this.moon.intensity = night * 1.7; this.moon.position.copy(sd).multiplyScalar(-100);
    this.hemi.color.copy(mix('amb')); this.hemi.groundColor.copy(mix('gnd')).multiplyScalar(1.2);
    this.hemi.intensity = lerp(0.55, 0.95, day) + night * 0.5;
    this.scene.fog.color.copy(mix('fog'));
    this.scene.fog.density = lerp(0.0062, 0.0042, day);
    this.scene.environmentIntensity = lerp(0.4, 0.95, day);
    this.renderer.toneMappingExposure = lerp(1.15, 0.95, day);
    // Umgebungs-Cubemap nur bei merklicher Änderung neu bauen
    if (Math.abs(el - this.lastEnvElev) > 0.07 || !this.envTarget) {
      this.lastEnvElev = el;
      const old = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envTarget.texture;
      if (old) old.dispose();
    }
  }

  follow(pos, tgt) {
    this.mesh.position.copy(pos);
    const d = this.sunDir || new THREE.Vector3(0, 1, 0);
    // Schatten-Kamera am Ziel verankern (Texel-Snapping gegen Flimmern)
    const texel = 144 / (this.shadowSize || 2048);
    const sx = Math.round(tgt.x / texel) * texel, sy = Math.round(tgt.y / texel) * texel, sz = Math.round(tgt.z / texel) * texel;
    this.sun.target.position.set(sx, sy, sz);
    const dd = this.sunElev > -0.02 ? d : this.u.uMoon.value;
    this.sun.position.set(sx + dd.x * 160, sy + Math.max(dd.y, 0.12) * 160 * (dd.y < 0.12 ? 1.4 : 1), sz + dd.z * 160);
    this.sun.target.updateMatrixWorld();
  }
}
