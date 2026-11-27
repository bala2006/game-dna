import * as THREE from 'three';
import { createResourceTracker } from '@gamedna/kit/dispose';
import { RingBuffer } from '@gamedna/kit/pool';
import type { Rng } from '@gamedna/kit/random';
import type { CarView } from '@gamedna/kit/vehicle';
import type { Scenery } from './scenery.js';
import type { RaceSim } from './sim.js';

const SMOKE = new THREE.Color(0.9, 0.89, 0.87), DUST = new THREE.Color(0.55, 0.48, 0.36);

/** Tire smoke, dust and fresh skid marks from the rear wheels, driven by the car's slip and off-road state. Presentation only. */
export function createEffects(scene: THREE.Scene, scenery: Scenery, carView: CarView, rng: Rng) {
  type Puff = { sprite: THREE.Sprite; material: THREE.SpriteMaterial; life: number; vy: number; alpha: number; grow: number };
  // The soft texture and skid geometry belong to the scenery, which other meshes share.
  const resources = createResourceTracker({ keep: [scenery.softTexture, scenery.skidGeometry] });
  const puffs = new RingBuffer<Puff>(110, () => {
    const material = new THREE.SpriteMaterial({ map: scenery.softTexture, transparent: true, opacity: 0, depthWrite: false, fog: true });
    const sprite = resources.track(new THREE.Sprite(material));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, material, life: 0, vy: 0, alpha: 0, grow: 0 };
  });
  const skids = resources.track(new THREE.InstancedMesh(scenery.skidGeometry, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), 800));
  skids.count = 0;
  skids.frustumCulled = false;
  scene.add(skids);
  const rear = carView.layout.wheels.filter((w) => !w.front);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1.3), up = new THREE.Vector3(0, 1, 0);
  let skidNext = 0, frame = 0;

  const puff = (x: number, z: number, color: THREE.Color, alpha: number, grow: number) => {
    const p = puffs.next();
    p.sprite.position.set(x + (rng.next() - 0.5) * 0.4, 0.35, z + (rng.next() - 0.5) * 0.4);
    p.material.color.copy(color);
    p.material.rotation = rng.next() * Math.PI * 2;
    Object.assign(p, { life: 1, vy: 0.5 + rng.next() * 0.6, alpha, grow });
    p.sprite.scale.setScalar(0.8);
    p.sprite.visible = true;
  };

  return {
    clear() { skids.count = 0; skidNext = 0; },
    update(dt: number, sim: RaceSim) {
      const { car, race } = sim, speed = Math.abs(car.vf), sliding = car.slip > 3.2 && speed > 6;
      frame++;
      if (!race.paused && frame % 2 === 0) for (const w of rear) {
        const s = Math.sin(car.h), c = Math.cos(car.h), wx = car.x + c * w.x + s * w.z, wz = car.z - s * w.x + c * w.z;
        if (car.offroad && speed > 4) { if (frame % 4 === 0) puff(wx, wz, DUST, 0.35, 2.6); }
        else if (sliding) {
          puff(wx, wz, SMOKE, 0.42, 3.4);
          skids.setMatrixAt(skidNext % 800, m4.compose(pv.set(wx, 0.027, wz), q.setFromAxisAngle(up, Math.atan2(car.vx, car.vz)), sv));
          skidNext++;
          skids.count = Math.min(800, skidNext);
          skids.instanceMatrix.needsUpdate = true;
        }
      }
      for (const p of puffs.items) {
        if (!p.sprite.visible) continue;
        p.life -= dt / 1.6;
        if (p.life <= 0) { p.sprite.visible = false; continue; }
        p.sprite.position.y += p.vy * dt;
        p.sprite.scale.setScalar(0.8 + (1 - p.life) * p.grow);
        p.material.opacity = p.alpha * p.life;
      }
    },
    /** Removes the effects from the scene and frees their materials and instance buffers. The scenery's shared texture and geometry stay. */
    dispose() {
      for (const p of puffs.items) scene.remove(p.sprite);
      scene.remove(skids);
      resources.dispose();
    },
  };
}
