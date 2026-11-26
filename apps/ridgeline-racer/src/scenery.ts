import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHumanoid, humanoidLayout, type HumanoidColors, type HumanoidRig } from '@gamedna/kit/character';
import { createNoise, createRng, deriveSeed, smoothstep as smooth, type Rng } from '@gamedna/kit/random';
import { canvasTexture, hsv, proceduralSurface, type Stage } from '@gamedna/kit/stage';
import { createHeightField, fadeTextureWithDistance, heightfieldGeometry, ribbonGeometry, scatter, type GroundPoint, type HeightFn } from '@gamedna/kit/world';
import { ROAD, type Track } from './track.js';

const { width: W, curb: CURB, rail: RAIL } = ROAD;

export interface Marshal {
  rig: HumanoidRig;
  /** Track point the marshal stands by, side offset, and walking speed (0 stands still). */
  k: number;
  offset: number;
  walk: number;
  phase: number;
  dir: 1 | -1;
  along: number;
}

export interface Scenery {
  terrainHeight: HeightFn;
  /** Height the camera must stay above: flat near the track, terrain elsewhere. */
  cameraGround: HeightFn;
  crew: Marshal[];
  skidGeometry: THREE.BufferGeometry;
  softTexture: THREE.Texture;
}

/** Builds everything around the road from the track and its seed: surfaces, road, curbs, rails, terrain, trees, grass, gantry and marshals. */
export function buildScenery(stage: Stage, track: Track): Scenery {
  const { scene, anisotropy } = stage, { frames, turn, index, count: S } = track;
  const noise = createNoise(track.seed), fbm = noise.fbm, rng = createRng(deriveSeed(track.seed, 'scenery')), art = createRng(977);
  const tang = frames.tangents, dist = frames.distance, pts = track.points;
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  };
  const ribbon = (from: number, to: number, y0: number, y1: number, options: Omit<Parameters<typeof ribbonGeometry>[1], 'from' | 'to' | 'y0' | 'y1'> = {}) =>
    ribbonGeometry(frames, { from, to, y0, y1, ...options });

  const asphalt = proceduralSurface({ size: 512, normalStrength: 2.2, anisotropy, sample: (x, y, u, v) => {
    const grain = noise.hash(x, y, 11), fine = fbm(u * 64, v * 64, 3, 3, 64), blot = fbm(u * 4, v * 4, 7, 4, 4);
    const tar = smooth(0.58, 0.72, blot), stone = grain > 0.94 ? grain : 0;
    const g = 0.3 + 0.06 * fine + 0.12 * stone - 0.025 * tar + (grain - 0.5) * 0.05;
    return { h: grain * 0.5 + fine * 0.5 + stone, r: g, g: g * 0.99, b: g * 0.97, rough: 0.86 + 0.1 * grain - 0.15 * tar - 0.2 * stone };
  } });
  const grass = proceduralSurface({ size: 512, normalStrength: 1.6, anisotropy, sample: (x, y, u, v) => {
    const blade = noise.hash(x, y, 41), clump = fbm(u * 24, v * 24, 5, 4, 24), dry = smooth(0.5, 0.7, fbm(u * 6, v * 6, 9, 4, 6));
    const lum = 0.85 + 0.18 * clump + 0.2 * (blade - 0.5);
    return { h: blade * 0.6 + clump * 0.4, r: (0.28 + 0.07 * dry) * lum, g: (0.36 + 0.03 * dry) * lum, b: (0.16 + 0.02 * dry) * lum, rough: 0.92 + 0.08 * blade };
  } });
  const softTexture = canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }, { anisotropy });
  const bladeTex = canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 46; i++) {
      const x = 8 + art.next() * (w - 16), lean = (art.next() - 0.5) * 34, tall = h * (0.45 + art.next() * 0.55), width = 2 + art.next() * 3;
      g.fillStyle = `hsl(${72 + art.next() * 26}, ${26 + art.next() * 16}%, ${16 + art.next() * 16}%)`;
      g.beginPath();
      g.moveTo(x - width, h);
      g.quadraticCurveTo(x + lean * 0.3, h - tall * 0.6, x + lean, h - tall);
      g.quadraticCurveTo(x + lean * 0.3 + width * 0.5, h - tall * 0.6, x + width, h);
      g.fill();
    }
  }, { anisotropy });
  const checkerTex = canvasTexture(256, 32, (g) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1b1b1b' : '#d9d9d6'; g.fillRect(i * 16, j * 16, 16, 16); }
  }, { anisotropy });
  const bannerTex = canvasTexture(1024, 96, (g, w, h) => {
    g.fillStyle = '#1d2733';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8ecef';
    g.font = '800 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('RIDGELINE CIRCUIT', w / 2, h / 2 + 2);
  }, { anisotropy });

  const roadTone = (k: number, off: number) => {
    const tk = turn[k] ?? 0, patch = 0.9 + 0.16 * fbm((dist[k] ?? 0) / 40, 0.5, 61, 3);
    const rubber = 1 - 0.14 * Math.exp(-((off - Math.sign(tk) * -2.5 * Math.min(1, Math.abs(tk) * 8)) ** 2) / 10);
    return new THREE.Color().setScalar(patch * rubber);
  };
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normalMap, roughnessMap: asphalt.roughnessMap, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true });
  for (const [a, b] of [[-W / 2, -W / 4], [-W / 4, 0], [0, W / 4], [W / 4, W / 2]] as const) addMesh(ribbon(a, b, 0.02, 0.02, { colorOf: roadTone }), roadMat);
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.72, 0.72, 0.7), roughness: 0.62, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  addMesh(ribbon(W / 2 - 0.5, W / 2 - 0.28, 0.022, 0.022), paint);
  addMesh(ribbon(-W / 2 + 0.28, -W / 2 + 0.5, 0.022, 0.022), paint);
  addMesh(ribbon(-0.1, 0.1, 0.022, 0.022, { skip: (i) => Math.floor(i / 4) % 2 === 1 }), paint);
  const CURB_RED = hsv(2, 0.82, 0.68), CURB_WHITE = hsv(40, 0.04, 0.86);
  const curbColor = (k: number) => (Math.floor((dist[k] ?? 0) / 2.2) % 2 ? CURB_RED : CURB_WHITE);
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
  addMesh(ribbon(W / 2, W / 2 + CURB, 0.025, 0.09, { colorOf: curbColor, flatColor: true }), curbMat);
  addMesh(ribbon(-W / 2 - CURB, -W / 2, 0.09, 0.025, { colorOf: curbColor, flatColor: true }), curbMat);
  const startLine = addMesh(ribbon(-W / 2, W / 2, 0.024, 0.024, { skip: (i) => i !== 0, vTile: 1 }), new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  startLine.geometry.getAttribute('uv').array.set([0, 0, 1, 0, 0, 1, 1, 1]);

  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9298, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide });
  const groove = new THREE.MeshStandardMaterial({ color: 0x4a5056, metalness: 0.6, roughness: 0.6, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    addMesh(ribbon(side * RAIL, side * RAIL, 0.48, 0.6), steel, { cast: true });
    addMesh(ribbon(side * (RAIL + 0.07), side * (RAIL + 0.07), 0.6, 0.7), groove);
    addMesh(ribbon(side * RAIL, side * RAIL, 0.7, 0.82), steel, { cast: true });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const yawAt = (k: number) => { const t = tang[k] as GroundPoint; return Math.atan2(t.x, t.z); };
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.85, 0.12).translate(0, 0.42, 0), steel, Math.ceil(S / 3) * 2);
  let pc = 0;
  for (let i = 0; i < S; i += 3) for (const side of [-1, 1]) {
    const o = frames.offset(i, side * (RAIL + 0.1));
    posts.setMatrixAt(pc++, m4.compose(pv.set(o.x, 0, o.z), q.setFromAxisAngle(up, yawAt(i)), sv.set(1, 1, 1)));
  }
  posts.count = pc;
  posts.castShadow = true;
  scene.add(posts);

  const skidGeometry = new THREE.PlaneGeometry(0.3, 1, 1, 1).rotateX(-Math.PI / 2);
  const oldSkids = new THREE.InstancedMesh(skidGeometry, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 700);
  let sc = 0;
  for (let i = 0; i < S && sc < 690; i += 2) {
    const tk = turn[i] ?? 0;
    if (Math.abs(tk) < 0.09 || art.next() < 0.45) continue;
    for (const lane of [-0.8, 0.8]) {
      const o = frames.offset(i, Math.sign(tk) * (1.5 + art.next() * 3.5) + lane);
      oldSkids.setMatrixAt(sc++, m4.compose(pv.set(o.x, 0.026, o.z), q.setFromAxisAngle(up, yawAt(i) + (art.next() - 0.5) * 0.15), sv.set(1, 1, 2.6 + art.next() * 2)));
    }
  }
  oldSkids.count = sc;
  scene.add(oldSkids);

  const baseHeight = createHeightField({ noise, path: index, flatWidth: 24, blend: 236, hills: { amplitude: 38, scale: 210 }, ranges: { inner: 520, outer: 1050, stretch: 1.2, scale: 320, height: 330 }, floor: -3 });
  const terrainHeight: HeightFn = (x, z) => baseHeight(x, z) - 0.12 * (1 - smooth(W / 2 + CURB + 0.5, W / 2 + CURB + 3, index.nearest(x, z).distance));
  const ROCK = new THREE.Color(1.45, 1.05, 2.0), FOREST = new THREE.Color(0.62, 0.74, 0.62);
  addMesh(heightfieldGeometry({
    size: 2600, segments: 220, height: terrainHeight, uvTile: 9,
    color: (x, y, z, ny) => {
      const dry = smooth(0.42, 0.7, fbm(x / 70, z / 70, 71, 4)), slope = smooth(0.05, 0.2, 1 - ny), high = smooth(30, 140, y);
      const c = new THREE.Color(1 + 0.12 * dry, 1 + 0.02 * dry, 1 - 0.2 * dry).multiplyScalar(0.86 + 0.24 * fbm(x / 23, z / 23, 73, 3));
      return c.lerp(FOREST, high * (1 - slope) * smooth(0.35, 0.55, fbm(x / 60, z / 60, 75, 3))).lerp(ROCK, Math.max(slope * smooth(20, 90, y), smooth(170, 300, y)) * 0.9);
    },
  }), fadeTextureWithDistance(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: grass.roughnessMap, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), grass.average));

  plantTrees(scene, rng, fbm, index, terrainHeight);

  const tuftGeo = mergeGeometries([0, Math.PI / 2].map((a) => new THREE.PlaneGeometry(0.9, 0.55).translate(0, 0.27, 0).rotateY(a)));
  const NTUFT = 6000;
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), NTUFT);
  for (let i = 0; i < NTUFT; i++) {
    const k = Math.floor(art.next() * S), side = art.next() < 0.5 ? -1 : 1;
    const o = frames.offset(k, side * (art.next() < 0.7 ? W / 2 + CURB + 0.4 + art.next() * (RAIL - W / 2 - CURB - 0.8) : RAIL + 0.6 + art.next() * 14));
    const s = 0.45 + art.next() * 0.7;
    tufts.setMatrixAt(i, m4.compose(pv.set(o.x + (art.next() - 0.5), 0, o.z + (art.next() - 0.5)), q.setFromAxisAngle(up, art.next() * Math.PI), sv.set(s, s * (0.7 + art.next() * 0.6), s)));
    tufts.setColorAt(i, new THREE.Color().setScalar(0.6 + art.next() * 0.35));
  }
  scene.add(tufts);

  const gantry = new THREE.Group(), darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.7, roughness: 0.45 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5).translate(0, 3.75, 0), darkSteel);
    post.position.x = side * (W / 2 + CURB + 0.8);
    post.castShadow = true;
    gantry.add(post);
  }
  const truss = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 0.9, 0.7), darkSteel);
  truss.position.y = 7.5;
  truss.castShadow = true;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.5, 1.4), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7 }));
  banner.position.set(0, 6.6, 0.38);
  const banner2 = banner.clone();
  banner2.position.z = -0.38;
  banner2.rotation.y = Math.PI;
  gantry.add(truss, banner, banner2);
  gantry.position.set((pts[0] as GroundPoint).x, 0, (pts[0] as GroundPoint).z);
  gantry.rotation.y = yawAt(0);
  scene.add(gantry);

  const crew: Marshal[] = [];
  const place = (colors: HumanoidColors, k: number, offset: number, facing: number, walk = 0) => {
    const rig = buildHumanoid(humanoidLayout({ height: rng.range(1.62, 1.88) }), colors), o = frames.offset(k, offset);
    rig.root.position.set(o.x, 0, o.z);
    rig.root.rotation.y = yawAt(k) + facing;
    scene.add(rig.root);
    crew.push({ rig, k, offset, walk, phase: rng.next(), dir: 1, along: 0 });
  };
  const VEST = 0xd9862b;
  place({ top: VEST, bottom: 0x2e3440 }, 18, W / 2 + CURB + 2.4, -Math.PI / 2);
  place({ top: VEST, bottom: 0x2e3440 }, 22, -(W / 2 + CURB + 2.6), Math.PI / 2);
  place({ top: 0x4f6d8f, bottom: 0x23262d }, S - 14, W / 2 + CURB + 3.2, 0, 1.3);
  place({ top: 0x7a3f3f, bottom: 0x3b3b40, skin: 0x8d5a3d }, S - 10, -(W / 2 + CURB + 3.6), Math.PI, 1.1);

  return {
    terrainHeight,
    cameraGround: (x, z) => (index.nearest(x, z).distance < RAIL + 2 ? 0 : terrainHeight(x, z)),
    crew,
    skidGeometry,
    softTexture,
  };
}

function plantTrees(scene: THREE.Scene, rng: Rng, fbm: (x: number, y: number, c?: number, o?: number) => number, index: Track['index'], height: HeightFn): void {
  const sv = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const barkMat = new THREE.MeshStandardMaterial({ color: hsv(25, 0.4, 0.2), roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: true });
  const shadeByHeight = (g: THREE.BufferGeometry, lo: number, hi: number, min = 0.5) => {
    const p = g.getAttribute('position'), c: number[] = [];
    for (let i = 0; i < p.count; i++) { const k = min + (1.08 - min) * smooth(lo, hi, p.getY(i)); c.push(k, k, k); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  };
  const conifer = mergeGeometries([0, 1, 2].map((k) => {
    const h = 4.2 - k * 0.6, y = 3.6 + k * 2.2;
    return shadeByHeight(new THREE.ConeGeometry(2.4 - k * 0.6, h, 12, 2).translate(0, y, 0), y - h / 2, y + h / 2, 0.45 + k * 0.08);
  }));
  const broad = shadeByHeight(mergeGeometries(([[0, 5.4, 0, 2.5], [1.3, 4.7, 0.6, 1.8], [-1.2, 4.9, -0.5, 1.9], [0.2, 6.4, -0.3, 1.7]] as const).map(([cx, cy, cz, r], n) => {
    const ico = new THREE.IcosahedronGeometry(r, 3);
    ico.deleteAttribute('uv');
    ico.deleteAttribute('normal');
    const g = mergeVertices(ico), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      sv.fromBufferAttribute(p, i);
      const k = 0.8 + 0.4 * fbm(sv.x * 0.7 + 9 + n * 3, sv.y * 0.7 + sv.z * 0.7, 81, 3);
      p.setXYZ(i, sv.x * k + cx, sv.y * k * 0.85 + cy, sv.z * k + cz);
    }
    g.computeVertexNormals();
    return g;
  })), 3.2, 7.6, 0.42);
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 4.5, 7).translate(0, 1.75, 0);
  const spots = scatter({
    rng, count: 780, bounds: [-560, -470, 560, 470], spacing: 3.2,
    accept: (x, z) => { if (fbm(x / 110, z / 110, 91, 3) < 0.46) return false; const d = index.nearest(x, z).distance; return d > ROAD.rail + 6 && d < 330; },
  });
  const conifers = new THREE.InstancedMesh(conifer, leafMat, spots.length), broads = new THREE.InstancedMesh(broad, leafMat, spots.length), trunks = new THREE.InstancedMesh(trunk, barkMat, spots.length);
  let ci = 0, bi = 0;
  spots.forEach(({ x, z }, ti) => {
    const s = rng.range(0.75, 1.45);
    m4.compose(pv.set(x, height(x, z) - 0.4, z), q.setFromAxisAngle(up, rng.range(0, Math.PI * 2)), sv.set(s, s * rng.range(0.9, 1.2), s));
    if (rng.next() < 0.55) { conifers.setMatrixAt(ci, m4); conifers.setColorAt(ci++, hsv(rng.range(100, 135), rng.range(0.45, 0.6), rng.range(0.2, 0.3))); }
    else { broads.setMatrixAt(bi, m4); broads.setColorAt(bi++, hsv(rng.range(70, 105), rng.range(0.5, 0.65), rng.range(0.28, 0.4))); }
    trunks.setMatrixAt(ti, m4);
  });
  conifers.count = ci;
  broads.count = bi;
  for (const m of [conifers, broads, trunks]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
}
