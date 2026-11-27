# Game feel in three.js 0.170 games

## Shake on a rig camera

`createCameraRig` rewrites the camera's position and orientation on every `update`, so add shake after it and nothing accumulates:

```ts
// check: compile
import * as THREE from 'three';
import { createShake } from '@gamedna/kit/feedback';

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.25, 3000);
const trauma = createShake({ seed: 7, maxOffset: 0.12, maxAngle: 0.03, decay: 1.5 });

/** Call right after rig.update(dt, ...), before rendering. */
export function applyShake(dt: number, reducedMotion: boolean): void {
  trauma.reducedMotion = reducedMotion;
  const o = trauma.update(dt);
  camera.translateX(o.x);
  camera.translateY(o.y);
  camera.rotateZ(o.angle);
}
```

Close views magnify the same offset: use about 0.1 to 0.3 m for chase views and 0.02 to 0.05 m for cockpit and first person. Ridgeline Racer still shakes with its own exponential decay and uniform noise, which ignores reduced motion; `createShake` replaces both.

## Hit flash on meshes

Drive `material.emissive.setScalar(flash.intensity)` on a `MeshStandardMaterial` and set it back to black when the flash ends. Clone the material per enemy at spawn, or one hit lights every enemy that shares it. For instanced crowds, flash through `InstancedMesh.setColorAt` and set `instanceColor.needsUpdate`.

## Squash in 3D

Parent the visual mesh to a pivot group at the feet and scale the pivot, never the body the simulation moves. Keep volume with `k = 1 + s / 2` and `pivot.scale.set(k, 1 / (k * k), k)`.

## FOV kick

A boost or heavy hit can add 3 to 6 degrees for 150 to 250 ms with a `Tween`. Add it to `camera.fov` after `rig.update` and call `updateProjectionMatrix()`; the rig restores its own FOV next frame. Skip it under reduced motion.
