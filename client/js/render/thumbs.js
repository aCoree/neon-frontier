// Vorschau-Bilder für den Skin-Shop: Jeder Skin wird einmal mit einem kleinen eigenen Renderer als Büste (Kopf bis Bauch) bzw. als Waffe
// gerendert und als Bild zwischengespeichert. So erkennt man einen Skin sofort, ohne alle durchzuklicken.
import * as THREE from 'three';
import { Character } from './character.js';
import { makeWeaponModel, tickWeaponFx } from './weapons.js';
import { SKINS, WSKINS, BACKS, RARITY } from '../shared/defs.js';

const W = 240, H = 280, WH = 150;   // Büsten hochkant, Waffen im Querformat
let R = null;
const cache = new Map();

function init() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
  // Umgebung für Metall-Reflexe: Verlaufs-Raum mit hellen Lichtflächen
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.05,.06,.1),vec3(.55,.65,.85),smoothstep(-.4,.9,h));gl_FragColor=vec4(c,1.);}' })));
  for (const [x, y, z, w, h, k] of [[4, 5, 4, 5, 3, 7], [-6, 3, 2, 3, 6, 4], [0, 7, -6, 8, 2, 5], [0, -4, 5, 6, 2, 1.5]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03).texture; scene.environmentIntensity = 1.0;
  scene.add(new THREE.HemisphereLight(0xdbe9ff, 0x242a44, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2.5, 3.5, 3.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88ccff, 1.8); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
  R = { cv, renderer, scene, cam, rim, size(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } };
}
const snap = () => R.cv.toDataURL('image/png');

// Büste: Kopf bis Bauch im Dreiviertel-Winkel
export function skinThumb(id) {
  const k = 's:' + id; if (cache.has(k)) return cache.get(k); if (!R) init();
  const s = SKINS.find(x => x.id === id) || SKINS[0], ch = new Character(s.id, 'default');
  ch.setWeapon('blade'); ch.equipT = 1; if (ch.fx) ch.fx.t = 2.5;
  for (let i = 0; i < 4; i++) ch.update(0.016, { speed: 0, grounded: true, pitch: 0 });
  ch.weaponGroup.visible = false; ch.root.rotation.y = 0.45; R.scene.add(ch.root);
  R.size(W, H); R.rim.color.set(s.accent); R.cam.position.set(0.45, 1.66, 2.05); R.cam.lookAt(0, 1.5, 0);
  R.renderer.render(R.scene, R.cam); const url = snap();
  R.scene.remove(ch.root); ch.dispose(); cache.set(k, url); return url;
}

// Waffe: Seitenansicht, automatisch eingepasst
export function wskinThumb(id, weapon = 'striker') {
  const k = 'w:' + id + ':' + weapon; if (cache.has(k)) return cache.get(k); if (!R) init();
  const s = WSKINS.find(x => x.id === id) || WSKINS[0]; tickWeaponFx(1.7);
  const g = makeWeaponModel(weapon, s.id), root = new THREE.Group(); root.add(g); g.rotation.y = -Math.PI / 2 + 0.5; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  g.position.sub(c); R.size(W, WH); const t = Math.tan(THREE.MathUtils.degToRad(15)), d = Math.max(sz.x * 0.47 / (t * (W / WH)), sz.y * 0.8 / t) + sz.z * 0.5;
  R.scene.add(root); R.rim.color.set(s.glow ?? 0x88ccff); R.cam.position.set(0, 0.04, d); R.cam.lookAt(0, 0, 0);
  R.renderer.render(R.scene, R.cam); const url = snap();
  R.scene.remove(root); cache.set(k, url); return url;
}
// Rückenstück: Büste von hinten (Flügel & Co. gut erkennbar)
export function backThumb(id) {
  const k = 'b:' + id; if (cache.has(k)) return cache.get(k); if (!R) init();
  const b = BACKS.find(x => x.id === id) || BACKS[0], ch = new Character('vanguard', 'default', b.id);
  ch.setWeapon('blade'); ch.equipT = 1; for (let i = 0; i < 6; i++) ch.update(0.1, { speed: 0, grounded: true, pitch: 0 });
  ch.weaponGroup.visible = false; ch.root.rotation.y = Math.PI + 0.35; R.scene.add(ch.root);
  const wide = (b.fx || []).includes('wings') || b.id === 'galaxy'; R.size(W, H); R.rim.color.set(RARITY[b.rarity].color); R.cam.position.set(-0.2, wide ? 1.6 : 1.62, wide ? 3.7 : 2.7); R.cam.lookAt(0, wide ? 1.4 : 1.42, 0);
  R.renderer.render(R.scene, R.cam); const url = snap();
  R.scene.remove(ch.root); ch.dispose(); cache.set(k, url); return url;
}
export const clearThumbs = () => cache.clear();
