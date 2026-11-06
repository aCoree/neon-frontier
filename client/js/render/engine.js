// Engine: Renderer, Szene, Kamera, Himmel, Post-Processing, Weltansicht.
import * as THREE from 'three';
import { createMaterials } from './textures.js';
import { buildMap } from '../shared/mapdata.js';
import { World } from '../shared/world.js';
import { WorldView } from './world.js';
import { Sky } from './sky.js';
import { Post } from './post.js';

export const QUALITY = {
  low:    { pr: 0.8, view: 260, part: 0.5, shadow: 1024, bloom: true, ao: false, grass: 0.3, grassDist: 28, lights: 4 },
  medium: { pr: 1.0, view: 340, part: 0.75, shadow: 2048, bloom: true, ao: false, grass: 0.6, grassDist: 40, lights: 5 },
  high:   { pr: 1.25, view: 420, part: 1, shadow: 2048, bloom: true, ao: false, grass: 1.0, grassDist: 55, lights: 6 },
  ultra:  { pr: 2.0, view: 520, part: 1, shadow: 4096, bloom: true, ao: true, grass: 1.3, grassDist: 70, lights: 8 },
};

export class Engine {
  constructor(canvas, qualityName = 'high') {
    this.canvas = canvas; this.qname = qualityName; this.q = { ...QUALITY[qualityName] };
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.2, 1400);
    this.camera.position.set(0, 20, 0);
    this.scene.add(this.camera);
    this.time = 0; this.dyn = 1; this.settings = null; this.partDensity = 1; this.lastRenderMs = 0;
    renderer.info.autoReset = false;
  }

  async init(progress = () => {}) {
    progress(0.02, 'Materialien backen…');
    await new Promise(r => setTimeout(r, 20));
    this.M = createMaterials(this.renderer);
    progress(0.08, 'Karte generieren…');
    await new Promise(r => setTimeout(r, 20));
    this.map = buildMap();
    this.world = new World(this.map);
    this.sky = new Sky(this.scene, this.renderer);
    this.view = new WorldView(this.scene, this.map, this.world, this.M, this.q);
    await this.view.build((p, name) => progress(0.1 + p * 0.85, name));
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.applyQuality(this.qname);
    window.addEventListener('resize', () => this.resize());
    this.setHour(15);
    progress(1, 'Bereit');
  }

  applyQuality(name, overrides = {}) {
    this.qname = name; this.q = { ...QUALITY[name], ...overrides };
    this.applySettings();
  }
  // Effektive Einstellungen = Qualitätsprofil + Nutzer-Overrides (Schatten, Partikel, Sichtweite, Auflösung, Akku-Sparmodus)
  applySettings(S = this.settings) {
    this.settings = S; const q = { ...QUALITY[this.qname] };
    const bat = !!(S && S.batterySaver);
    if (S) {
      if (S.shadows && S.shadows !== 'auto') q.shadow = S.shadows === 'off' ? 0 : +S.shadows;
      q.part = S.particles ?? q.part; q.view = S.viewDist || q.view;
    }
    if (bat) { q.pr *= 0.75; q.shadow = Math.min(q.shadow, 1024); q.part *= 0.5; q.grassDist *= 0.6; q.ao = false; q.view = Math.min(q.view, 300); }
    this.q = q; this.renderScale = S ? S.renderScale || 1 : 1; this.partDensity = q.part;
    this.sky.setShadowQuality(q.shadow);
    this.post.setBloom(q.bloom, bat ? 0.3 : 0.42); this.post.setAO(q.ao);
    this.view.q.grassDist = q.grassDist; this.view.viewDist = q.view;
    this.resize();
  }
  setDynScale(s) { this.dyn = s; this.resize(); }

  setHour(h) { this.hour = h; this.sky.setHour(h, this.time); this.view.setNight(this.sky.night); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.max(0.4, Math.min(this.q.pr, window.devicePixelRatio || 1, 2) * (this.renderScale || 1) * this.dyn);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, pr);
  }

  render(dt, focus) {
    this.time += dt; this.frame = (this.frame || 0) + 1; this.renderer.info.reset();
    this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = this.qname === 'low' || this.qname === 'medium' ? this.frame % 2 === 0 : true;
    this.sky.u.uTime.value = this.time;
    this.sky.follow(this.camera.position, focus || this.camera.position);
    if (this.underground) { this.sky.sun.intensity = 0; this.sky.moon.intensity = 0; this.renderer.shadowMap.needsUpdate = false; this.scene.environmentIntensity = 0.3; this.sky.hemi.intensity = 0.6; }
    this.view.pxScale = this.renderer.domElement.height * 0.5;
    this.view.update(dt, this.time, this.camera.position, focus);
    const t0 = performance.now(); this.post.render(dt); this.lastRenderMs = performance.now() - t0;
  }
}
