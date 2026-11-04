// Post-Processing: MSAA, optionales GTAO (Ambient Occlusion), Bloom, Vignette/Chromatic/Schadensblitz, Tone-Mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uDamage: { value: 0 }, uLow: { value: 0 }, uSpeed: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(0, 0, 0) }, uScope: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
  uniform sampler2D tDiffuse; uniform float uDamage, uLow, uSpeed, uTime, uFlash, uScope, uAspect; uniform vec3 uTint; varying vec2 vUv;
  void main(){
    vec2 c = vUv - 0.5; float r2 = dot(c,c);
    float ab = 0.0016 + uSpeed*0.004 + uDamage*0.004;
    vec2 dir = normalize(c + 1e-5) * r2;
    vec3 col;
    col.r = texture2D(tDiffuse, vUv + dir*ab*6.0).r;
    col.g = texture2D(tDiffuse, vUv).g;
    col.b = texture2D(tDiffuse, vUv - dir*ab*6.0).b;
    if (uSpeed > 0.01) { vec3 acc = col; for (int i=1;i<4;i++){ acc += texture2D(tDiffuse, vUv - c*uSpeed*0.02*float(i)).rgb; } col = mix(col, acc*0.25, clamp(uSpeed*r2*4.0,0.0,0.6)); }
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col = mix(col, vec3(lum), uLow*0.65);
    float vig = smoothstep(0.85, 0.2, length(c*vec2(1.0,0.9)) );
    col *= mix(0.55, 1.0, vig);
    col += uTint * (0.08 + 0.35*r2);
    col = mix(col, vec3(1.0,0.12,0.1)*(0.4+r2*2.0), uDamage*(0.15+r2*1.6));
    col += uFlash;
    if (uScope > 0.5) { float d = length(vec2(c.x*uAspect, c.y)); col *= smoothstep(0.46, 0.44, d); col += vec3(0.0) ; }
    gl_FragColor = vec4(col, 1.0);
  }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.gtao = null; this.enabled = true;
  }
  setSize(w, h, pr) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.final.uniforms.uAspect.value = w / h; }
  async setAO(on) {
    if (on && !this.gtao) {
      try {
        const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
        const s = this.renderer.getSize(new THREE.Vector2());
        this.gtao = new GTAOPass(this.scene, this.camera, s.x, s.y);
        this.gtao.output = GTAOPass.OUTPUT.Default;
        this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
        this.composer.insertPass(this.gtao, 1);
      } catch (e) { console.warn('GTAO nicht verfügbar', e); }
    }
    if (this.gtao) this.gtao.enabled = on;
  }
  setBloom(on, strength = 0.55) { this.bloom.enabled = on; this.bloom.strength = strength; }
  render(dt) { this.final.uniforms.uTime.value += dt; this.composer.render(dt); }
  get u() { return this.final.uniforms; }
}
