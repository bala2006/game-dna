import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHumanoid, humanoidLayout, type HumanoidRig } from '@gamedna/kit/character';
import { createNoise, createRng, deriveSeed, smoothstep as smooth } from '@gamedna/kit/random';
import { hsv, proceduralSurface, type Stage } from '@gamedna/kit/stage';
import { buildCar, type CarView } from '@gamedna/kit/vehicle';
import { fadeTextureWithDistance, heightfieldGeometry, ribbonGeometry } from '@gamedna/kit/world';
import type { Layout } from './layout.js';

export interface Walker { rig: HumanoidRig; s: number; speed: number; phase: number }

export interface Scenery {
  car: CarView;
  wall: THREE.Group;
  walkers: Walker[];
  /** One post per marker; `setCollected` dims it. */
  markers: THREE.Group[];
  setCollected(index: number, collected: boolean): void;
  /** Objects the third-person camera must not pass through. */
  occluders: THREE.Object3D[];
}

/** Draws the layout: meadow terrain, dirt trail, instanced trees, the wall and doorway, a parked sedan, walkers and markers. */
export function buildScenery(stage: Stage, L: Layout): Scenery {
  const { scene, anisotropy } = stage, noise = createNoise(L.seed), fbm = noise.fbm, rng = createRng(deriveSeed(L.seed, 'scenery'));
  const grass = proceduralSurface({ size: 256, normalStrength: 1.6, anisotropy, sample: (x, y, u, v) => {
    const blade = noise.hash(x, y, 41), clump = fbm(u * 16, v * 16, 5, 4, 16), lum = 0.85 + 0.18 * clump + 0.2 * (blade - 0.5);
    return { h: blade * 0.6 + clump * 0.4, r: 0.29 * lum, g: 0.37 * lum, b: 0.17 * lum, rough: 0.92 + 0.08 * blade };
  } });
  const dirt = proceduralSurface({ size: 256, normalStrength: 2.4, anisotropy, sample: (x, y, u, v) => {
    const grit = noise.hash(x, y, 13), lump = fbm(u * 12, v * 12, 17, 4, 12), lum = 0.82 + 0.25 * lump + 0.12 * (grit - 0.5);
    return { h: lump * 0.7 + grit * 0.3, r: 0.47 * lum, g: 0.39 * lum, b: 0.3 * lum, rough: 0.95 };
  } });
  const dryTint = new THREE.Color(1.3, 1.15, 0.95);
  const terrain = new THREE.Mesh(
    heightfieldGeometry({ size: 900, segments: 180, height: L.height, uvTile: 6,
      color: (x, _y, z) => new THREE.Color().setScalar(0.85 + 0.25 * fbm(x / 18, z / 18, 71, 3)).lerp(dryTint, smooth(0.45, 0.7, fbm(x / 50, z / 50, 73, 3)) * 0.5) }),
    fadeTextureWithDistance(new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), grass.average, 40, 220),
  );
  terrain.receiveShadow = true;
  const trail = new THREE.Mesh(ribbonGeometry(L.trail, { from: -1.2, to: 1.2, y0: 0.01, vTile: 2.4 }), new THREE.MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normalMap, roughnessMap: dirt.roughnessMap }));
  trail.receiveShadow = true;
  scene.add(terrain, trail);

  const crown = mergeGeometries(([[0, 6.2, 0, 2.6], [1.3, 5.4, 0.5, 1.9], [-1.2, 5.6, -0.6, 2.0], [0.2, 7.4, -0.2, 1.8]] as const).map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 2).translate(x, y, z)));
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.85 }), L.trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.3, 5, 8).translate(0, 2.3, 0), new THREE.MeshStandardMaterial({ color: hsv(25, 0.4, 0.2), roughness: 0.95 }), L.trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  L.trees.forEach((t, i) => {
    m4.compose(pv.set(t.x, L.height(t.x, t.z) - 0.2, t.z), q.setFromAxisAngle(up, rng.range(0, Math.PI * 2)), sv.set(t.scale, t.scale * rng.range(0.9, 1.15), t.scale));
    crowns.setMatrixAt(i, m4);
    trunks.setMatrixAt(i, m4);
    crowns.setColorAt(i, hsv(rng.range(75, 110), rng.range(0.5, 0.62), rng.range(0.26, 0.36)));
  });
  for (const m of [crowns, trunks]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  const plaster = new THREE.MeshStandardMaterial({ color: hsv(35, 0.12, 0.72), roughness: 0.9 }), frameMat = new THREE.MeshStandardMaterial({ color: hsv(28, 0.35, 0.3), roughness: 0.7 });
  const W = L.wall, wall = new THREE.Group(), side = (W.width - W.door.width) / 2;
  const block = (w: number, h: number, z: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W.thickness, h, w), plaster); m.position.set(0, y, z); m.castShadow = m.receiveShadow = true; wall.add(m); };
  block(side, W.height, -(W.door.width + side) / 2, W.height / 2);
  block(side, W.height, (W.door.width + side) / 2, W.height / 2);
  block(W.door.width, W.height - W.door.height, 0, (W.height + W.door.height) / 2);
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(W.thickness + 0.04, W.door.height, 0.06), frameMat);
    jamb.position.set(0, W.door.height / 2, s * (W.door.width / 2 + 0.03));
    wall.add(jamb);
  }
  wall.position.set(W.x, L.height(W.x, W.z), W.z);
  scene.add(wall);

  const car = buildCar({ preset: 'sedan', paint: hsv(205, 0.55, 0.42) });
  car.root.position.set(L.car.x, L.height(L.car.x, L.car.z), L.car.z);
  car.root.rotation.y = L.car.yaw;
  scene.add(car.root);

  const skins = [0xc68e6a, 0x8d5a3d, 0xe0b48f] as const;
  const walkers = skins.map((skin, n): Walker => {
    const rig = buildHumanoid(humanoidLayout({ height: rng.range(1.62, 1.88) }), { top: hsv(rng.range(0, 360), 0.35, 0.45), bottom: hsv(220, 0.2, rng.range(0.2, 0.35)), skin });
    scene.add(rig.root);
    return { rig, s: (n * L.trail.total) / 3, speed: n === 2 ? 0 : rng.range(1.2, 1.5), phase: rng.next() };
  });

  const postMat = new THREE.MeshStandardMaterial({ color: hsv(30, 0.3, 0.35), roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: hsv(42, 0.85, 1), emissiveIntensity: 2.4, roughness: 0.4 });
  const spent = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const markers = L.markers.map((m) => {
    const g = new THREE.Group(), post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8).translate(0, 0.55, 0), postMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), glow);
    lamp.position.y = 1.18;
    lamp.name = 'lamp';
    post.castShadow = true;
    g.add(post, lamp);
    g.position.set(m.x, L.height(m.x, m.z), m.z);
    scene.add(g);
    return g;
  });

  return {
    car, wall, walkers, markers,
    setCollected(i, collected) { const lamp = markers[i]?.getObjectByName('lamp') as THREE.Mesh | undefined; if (lamp) lamp.material = collected ? spent : glow; },
    occluders: [wall, car.root],
  };
}
