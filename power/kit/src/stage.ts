import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Point3 } from './camera.js';
import { createResourceTracker } from './dispose.js';

/** sRGB color from hue in degrees, saturation and value in 0-1. */
export function hsv(h: number, s: number, v: number): THREE.Color {
  const hh = ((h % 360) + 360) % 360;
  const f = (n: number) => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return new THREE.Color().setRGB(f(5), f(3), f(1), THREE.SRGBColorSpace);
}

export interface SurfaceSample {
  /** Height for the normal map, any scale. */
  h: number;
  r: number;
  g: number;
  b: number;
  rough: number;
}

export interface Surface {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  /** Mean color of `map`, for distance fades. */
  average: THREE.Color;
}

export function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, { srgb = true, anisotropy = 8, repeat = false } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas is not available');
  draw(g, width, height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Color, roughness and normal maps from one sample function. Sample tileable noise for seamless repeats. */
export function proceduralSurface({ size = 512, sample, normalStrength = 2, anisotropy = 8 }: {
  size?: number;
  sample: (x: number, y: number, u: number, v: number) => SurfaceSample;
  normalStrength?: number;
  anisotropy?: number;
}): Surface {
  const n = size * size, height = new Float32Array(n);
  const albedo = new ImageData(size, size), rough = new ImageData(size, size), normal = new ImageData(size, size);
  const avg = [0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, s = sample(x, y, x / size, y / size);
    height[i] = s.h;
    albedo.data.set([s.r * 255, s.g * 255, s.b * 255, 255], i * 4);
    rough.data.set([s.rough * 255, s.rough * 255, s.rough * 255, 255], i * 4);
  }
  const at = (xx: number, yy: number) => height[((yy + size) % size) * size + ((xx + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * normalStrength, dy = (at(x, y + 1) - at(x, y - 1)) * normalStrength;
    const l = Math.hypot(dx, dy, 1), i = y * size + x;
    normal.data.set([(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], i * 4);
    for (let ch = 0; ch < 3; ch++) avg[ch] = (avg[ch] ?? 0) + (albedo.data[i * 4 + ch] ?? 0) / 255 / n;
  }
  const tex = (img: ImageData, srgb: boolean) => canvasTexture(size, size, (g) => g.putImageData(img, 0, 0), { srgb, anisotropy, repeat: true });
  return {
    map: tex(albedo, true), roughnessMap: tex(rough, false), normalMap: tex(normal, false),
    average: new THREE.Color().setRGB(avg[0] ?? 0, avg[1] ?? 0, avg[2] ?? 0, THREE.SRGBColorSpace),
  };
}

const SKY_FRAGMENT = `
uniform vec3 sunDir, zenith, horizon, sunColor; uniform float time, cloudCover; varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 6.0) * 0.22 + pow(s, 90.0) * 0.6);
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 0.9 + vec2(time * 0.004, 0.0);
    float c = fbm(uv);
    float cover = smoothstep(0.74 - 0.22 * cloudCover, 0.74, c) * smoothstep(0.0, 0.18, d.y);
    float lit = smoothstep(-0.12, 0.12, c - fbm(uv + sunDir.xz * 0.06));
    vec3 cloud = mix(vec3(0.42, 0.46, 0.54), vec3(1.05, 1.0, 0.94), lit) * (0.85 + 0.5 * pow(s, 4.0));
    col = mix(col, cloud, cover * 0.92);
  }
  col += sunColor * smoothstep(0.99975, 0.9999, s) * 30.0 * smoothstep(-0.01, 0.02, d.y);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface StageOptions {
  /** Unit vector toward the sun. Elevation sets the mood; see the art-direction skill. */
  sunDirection: THREE.Vector3;
  zenith?: THREE.ColorRepresentation;
  horizon?: THREE.ColorRepresentation;
  sunColor?: THREE.ColorRepresentation;
  /** 0 clear to 1 broken cloud. */
  cloudCover?: number;
  /** `FogExp2` density, in the horizon color. 0.0006-0.0012 for views of 1-2 km. */
  fog?: number;
  sunIntensity?: number;
  /** Half size in meters of the shadow box that follows the focus point. */
  shadowExtent?: number;
  exposure?: number;
  environmentIntensity?: number;
  fov?: number;
  far?: number;
  bloom?: { strength: number; radius: number; threshold: number } | null;
  vignette?: number;
  /** `low` drops post-processing, halves the shadow map and caps pixel ratio at 1: phones and headless tests. */
  quality?: 'high' | 'low';
  container?: HTMLElement;
}

/** One lit three.js scene: renderer, camera, sky, environment light, sun with shadows, fog and post-processing. */
export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly canvas: HTMLCanvasElement;
  /** Max anisotropy to pass to textures. */
  readonly anisotropy: number;
  /** Moves the sky and the sun's shadow box to `focus`, aims the sun at `ahead`, then draws. Call once per frame. */
  render(dt: number, focus: Point3, ahead?: Point3): void;
  /** Frees everything the stage created (sky, environment map, shadow map, post-processing, renderer) and removes the canvas. Not what you added to `scene`. */
  dispose(): void;
}

export function createStage({
  sunDirection,
  zenith = new THREE.Color(0.13, 0.27, 0.62),
  horizon = new THREE.Color(0.6, 0.69, 0.8),
  sunColor = new THREE.Color(1.0, 0.86, 0.66),
  cloudCover = 1,
  fog = 0.0008,
  sunIntensity = 3.1,
  shadowExtent = 55,
  exposure = 0.95,
  environmentIntensity = 0.75,
  fov = 60,
  far = 3000,
  bloom = { strength: 0.22, radius: 0.5, threshold: 1.6 },
  vignette = 0.32,
  quality = 'high',
  container = document.body,
}: StageOptions): Stage {
  const low = quality === 'low', resources = createResourceTracker(), track = resources.track;
  const renderer = new THREE.WebGLRenderer({ antialias: low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, low ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const horizonColor = new THREE.Color(horizon);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: sunDirection }, zenith: { value: new THREE.Color(zenith) }, horizon: { value: horizonColor },
      sunColor: { value: new THREE.Color(sunColor) }, time: { value: 0 }, cloudCover: { value: cloudCover },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FRAGMENT,
  });
  const skyRadius = far * 0.85;
  const sky = track(new THREE.Mesh(new THREE.SphereGeometry(skyRadius, 48, 24), skyMaterial));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  if (fog > 0) scene.fog = new THREE.FogExp2(horizonColor, fog);
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = track(new THREE.Scene());
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
  scene.environment = track(pmrem.fromScene(envScene, 0.02, 0.1, 200)).texture;
  scene.environmentIntensity = environmentIntensity;
  pmrem.dispose();

  const sun = track(new THREE.DirectionalLight(new THREE.Color(sunColor).lerp(new THREE.Color(1, 1, 1), 0.5), sunIntensity));
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent, near: 1, far: 320 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.25, far);
  let composer: EffectComposer | null = null;
  if (!low) {
    composer = track(new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType })));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(track(new RenderPass(scene, camera)));
    if (bloom) composer.addPass(track(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bloom.strength, bloom.radius, bloom.threshold)));
    if (vignette > 0) composer.addPass(track(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, strength: { value: vignette } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; c.rgb *= 1.0 - strength * dot(d, d) * 2.0; gl_FragColor = c; }',
    })));
    composer.addPass(track(new OutputPass()));
  }

  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  const timeUniform = skyMaterial.uniforms.time as THREE.IUniform<number>;
  const sunDistance = 150;

  return {
    renderer, scene, camera, sun,
    canvas: renderer.domElement,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    render(dt, focus, ahead = focus) {
      sky.position.copy(camera.position);
      sky.scale.setScalar(Math.min(1, (camera.far * 0.9) / skyRadius));
      timeUniform.value += dt;
      sun.position.set(focus.x + sunDirection.x * sunDistance, focus.y + sunDirection.y * sunDistance, focus.z + sunDirection.z * sunDistance);
      sun.target.position.set(ahead.x, ahead.y, ahead.z);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      removeEventListener('resize', resize);
      resources.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
