// Engine: Renderer, Szene, Kamera, Himmel, Post-Processing, Weltansicht.
import * as THREE from 'three';
import { createMaterials } from './textures.js';
import { buildMap } from '../shared/mapdata.js';
import { World } from '../shared/world.js';
import { WorldView } from './world.js';
import { Sky } from './sky.js';
import { Post } from './post.js';

export const QUALITY = {
  low:    { pr: 0.8, shadow: 1024, bloom: true, ao: false, grass: 0.3, grassDist: 28, lights: 4 },
  medium: { pr: 1.0, shadow: 2048, bloom: true, ao: false, grass: 0.6, grassDist: 40, lights: 5 },
  high:   { pr: 1.25, shadow: 2048, bloom: true, ao: false, grass: 1.0, grassDist: 55, lights: 6 },
  ultra:  { pr: 2.0, shadow: 4096, bloom: true, ao: true, grass: 1.3, grassDist: 70, lights: 8 },
};

export class Engine {
  constructor(canvas, qualityName = 'high') {
    this.canvas = canvas; this.qname = qualityName; this.q = { ...QUALITY[qualityName] };
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1400);
    this.camera.position.set(0, 20, 0);
    this.scene.add(this.camera);
    this.time = 0;
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
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setHour(15);
    progress(1, 'Bereit');
  }

  applyQuality(name, overrides = {}) {
    this.qname = name; Object.assign(this.q, QUALITY[name], overrides);
    this.sky.setShadowQuality(this.q.shadow);
    this.post.setBloom(this.q.bloom, 0.42);
    this.post.setAO(this.q.ao);
    this.view.q.grassDist = this.q.grassDist;
    this.resize();
  }

  setHour(h) { this.hour = h; this.sky.setHour(h, this.time); this.view.setNight(this.sky.night); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.min(this.q.pr, window.devicePixelRatio * Math.max(1, this.q.pr > 1.5 ? 1.2 : 1));
    this.renderer.setPixelRatio(Math.min(pr, 2)); this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, Math.min(pr, 2));
  }

  render(dt, focus) {
    this.time += dt; this.frame = (this.frame || 0) + 1;
    this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = this.qname === 'low' || this.qname === 'medium' ? this.frame % 2 === 0 : true;
    this.sky.u.uTime.value = this.time;
    this.sky.follow(this.camera.position, focus || this.camera.position);
    if (this.underground) { this.sky.sun.intensity = 0; this.sky.moon.intensity = 0; this.renderer.shadowMap.needsUpdate = false; this.scene.environmentIntensity = 0.3; this.sky.hemi.intensity = 0.6; }
    this.view.update(dt, this.time, this.camera.position, focus);
    this.post.render(dt);
  }
}
