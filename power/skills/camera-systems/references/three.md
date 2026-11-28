# Cameras in three.js 0.170 games

## Wiring the rig

Create one rig per `PerspectiveCamera`. Each rendered frame: interpolate the target's root transform with the loop's `alpha`, call `rig.update`, then render. Pass the rolling body as `mountObject` (`car.shell` from `buildCar`) so hood and cockpit views lean with the car, and the unrolled root as `object` so chase views stay level. `ground` is the terrain height function the world already has (Trail Walk passes `layout.height`, Ridgeline Racer a road-aware `scenery.cameraGround`).

## Occluders

Give the rig a ray test against a short list of simplified meshes, such as building boxes and cliff faces. Use non-recursive tests on flat lists; a recursive test over a whole scene every frame costs milliseconds on phones.

```ts
// check: compile
import * as THREE from 'three';
import { VIEW_PRESETS, createCameraRig } from '@gamedna/kit/camera';

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.25, 3000);
const occluders: THREE.Object3D[] = []; // walls and building shells only, no props or foliage
const ray = new THREE.Raycaster();
export const rig = createCameraRig(camera, {
  views: [VIEW_PRESETS.shoulder, VIEW_PRESETS.firstPerson],
  ground: () => 0,
  occlude: (from, dir, far) => {
    ray.set(from, dir);
    ray.far = far;
    return ray.intersectObjects(occluders, false)[0]?.distance ?? null;
  },
});
```

## FOV and aspect

The rig writes `camera.fov` every frame from the view's `fov` pair and the speed ratio, so a per-device FOV must go into the views. For portrait screens, convert a wanted horizontal FOV `h` to vertical with `v = 2 * atan(tan(h / 2) / aspect)` and pass spread copies of the presets with that `fov` on resize. Call `camera.updateProjectionMatrix()` after changing `aspect`; `createStage` does this on window resize.

## Interior views

In `onChange`, `setCockpitView(car, inside)` shows the interior and fades the glass, and `setFirstPersonView(rig, on)` hides the head. Hide the driver's head mesh too when a driver sits in the car, as Ridgeline Racer does. Restore all of them when leaving the view.

## Debug

Expose `rig.view.name`, `camera.position`, `camera.fov` and `camera.near` through `exposeDevHook` so browser tests can assert framing per view.
