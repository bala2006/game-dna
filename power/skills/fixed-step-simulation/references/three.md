# Fixed-step loops in three.js 0.170 games

## Who owns the frame

`runFixedStep` from `@gamedna/kit/loop` calls `requestAnimationFrame` itself. Keep it unless the renderer must own the loop: in a WebXR session only callbacks passed to `renderer.setAnimationLoop` keep running. Then drive a `FixedStepClock` yourself:

```ts
// check: compile
import * as THREE from 'three';
import { FixedStepClock } from '@gamedna/kit/loop';

export function startXrLoop(renderer: THREE.WebGLRenderer, tick: () => void, render: (alpha: number, dt: number) => void): void {
  const clock = new FixedStepClock(60, 5);
  let last = -1;
  renderer.setAnimationLoop((time: number) => {
    const ms = last < 0 ? 0 : time - last;
    last = time;
    for (let i = clock.advance(ms); i > 0; i--) tick();
    render(clock.alpha, Math.min(0.1, ms / 1000));
  });
}
```

`THREE.Clock` and the `Timer` addon (`three/addons/misc/Timer.js`, which skips time while the page is hidden) are fine for presentation time such as shader uniforms. Neither may step rules.

## Interpolating objects

- Keep `prev` and current transforms as plain numbers in the simulation. In `render`, write `object.position.set(...)` from the blended values and `object.rotation.y = prev + wrapAngle(cur - prev) * alpha`.
- For full 3D orientation, store quaternions as `{ x, y, z, w }` and blend with `object.quaternion.slerpQuaternions(qPrev, qCur, alpha)` using two `THREE.Quaternion` scratch objects created once.
- Give the camera rig the interpolated object, not the simulation position. Otherwise the target judders against a smooth camera. Ridgeline Racer and Trail Walk set `root.position` first, then call `rig.update`.
- `AnimationMixer.update(dt)`, `animateCar` and `animateHumanoid` take the render `dt`. They are presentation and may.

## First-frame stalls

The first draw with a new material compiles its shaders, which can stall 50 to 300 ms. The accumulator clamp turns that into a short slow-down, but a stall in the first second of play still eats input. Call `await renderer.compileAsync(scene, camera)` after building the level and before starting the loop.
