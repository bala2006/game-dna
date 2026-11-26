# GameDNA Kit

GameDNA Kit is the reusable code foundation for browser games. It handles the parts every game rebuilds and most games get wrong: input on every device, camera views, real-world proportions for cars and people, terrain and roads, a lit three.js scene and a fixed-step loop. You write the rules. The Kit draws, listens and keeps the numbers honest.

Each module has one job and a small surface. Import only the modules you need.

| Module | What it gives you |
|---|---|
| `@gamedna/kit/random` | Seeded `createRng` and `deriveSeed`, tileable value noise, `smoothstep`, `ease`, `wrapAngle` |
| `@gamedna/kit/loop` | `runFixedStep({ tick, render })` at 60 Hz with interpolation, `onPageHidden`, `onFirstGesture`, `exposeDevHook` |
| `@gamedna/kit/input` | `createInput`: keyboard, pointer-lock mouse look, gamepad and an on-screen touch overlay, with taps latched to the next tick. Default `BINDINGS` and `TOUCH_LAYOUTS` for driving and on foot. `auditTouchLayout` checks button sizes and gaps |
| `@gamedna/kit/camera` | `createCameraRig` with `VIEW_PRESETS`: chase, far chase, hood, cockpit, over-shoulder, first person and top-down. Smoothing, look input, recentering, collision pull-in, cuts and blends, near plane per view |
| `@gamedna/kit/vehicle` | `buildCar` from real dimensions (hatch, sedan, coupe, SUV) with wheels, cockpit, mirrors and camera mounts. `animateCar` drives wheels, roll, pitch and brake lights. `measureCar` checks the body against its spec |
| `@gamedna/kit/character` | `humanoidLayout` from measured body ratios in five proportion styles, `buildHumanoid` with a joint rig and an eye mount, `animateHumanoid` with planted feet |
| `@gamedna/kit/world` | Path index and frames, `ribbonGeometry` for roads, curbs, rails and trails, `createHeightField` flattened along paths, Poisson `scatter`, terrain geometry, distance texture fade |
| `@gamedna/kit/stage` | `createStage`: renderer, camera, sky shader, sky-lit environment, sun shadows that follow the player, fog, bloom and vignette, resize. `proceduralSurface` makes color, roughness and normal maps from one function |

`random`, `loop` and `input` do not need three.js. The other modules import `three` 0.170.0 as a peer dependency.

## Featured apps

Two games in this repository are built only on the Kit. They share no game code.

| App | What it shows | Run |
|---|---|---|
| `apps/ridgeline-racer` | A seeded circuit with terrain, trees and marshals; a coupe with four camera views; keyboard, mouse, gamepad and touch pedals; three laps against the clock; an automatic driver behind `?auto=1` | `npm run dev -w ridgeline-racer` |
| `apps/trail-walk` | A 1.75 m character on a meadow trail with a doorway and a parked sedan; third and first person; jump, run and collect eight markers; keyboard, mouse, gamepad and touch | `npm run dev -w trail-walk` |

## Start a game

```ts
import * as THREE from 'three';
import { VIEW_PRESETS, createCameraRig } from '@gamedna/kit/camera';
import { BINDINGS, TOUCH_LAYOUTS, createInput } from '@gamedna/kit/input';
import { runFixedStep } from '@gamedna/kit/loop';
import { createStage } from '@gamedna/kit/stage';
import { animateCar, buildCar } from '@gamedna/kit/vehicle';

const stage = createStage({ sunDirection: new THREE.Vector3(-0.5, 0.35, -0.8).normalize() });
const car = buildCar({ preset: 'sedan' });
stage.scene.add(car.root);
const input = createInput({ element: stage.canvas, bindings: BINDINGS.driving, touchLayout: TOUCH_LAYOUTS.driving });
const rig = createCameraRig(stage.camera, { views: [VIEW_PRESETS.chase, VIEW_PRESETS.cockpit] });

const sim = { x: 0, z: 0, heading: 0, speed: 0 };
runFixedStep({
  tick() {
    const frame = input.sample();
    if (frame.pressed.has('camera')) rig.next();
    sim.speed += ((frame.axes.throttle ?? 0) * 20 - sim.speed) / 60;
    sim.heading -= (frame.axes.steer ?? 0) * 0.02;
    sim.x += Math.sin(sim.heading) * sim.speed / 60;
    sim.z += Math.cos(sim.heading) * sim.speed / 60;
  },
  render(_alpha, dt) {
    car.root.position.set(sim.x, 0, sim.z);
    car.root.rotation.y = sim.heading;
    animateCar(car, { speed: sim.speed }, dt);
    rig.update(dt, { object: car.root, mountObject: car.shell, mounts: car.mounts, speed: sim.speed }, input.takeLook(dt));
    stage.render(dt, car.root.position);
  },
});
```

Keep game rules in `tick`, in plain data, with a seeded `createRng`. `render` reads that state and never writes it. Then the rules run in unit tests without a browser, as both featured apps show in their `tests/sim.test.ts`.

## Ship one HTML file

Build with Vite, then pack the build: `node tools/single-file.mjs dist game.html`. The file runs from disk with no server and no network, because three.js is bundled.

## Use the Kit outside this repository

The GameDNA Power ships the Kit source in `power/kit/`. Copy its `src/` folder into your project as `src/kit/`, install `three@0.170.0`, and import from `./kit/input.js` and the other module files. The skills in `power/skills/` say which module each step uses.

## Check your game

- Unit test the rules: same seed and inputs give the same state.
- Drive the built game with Playwright through a `?dev` hook from `exposeDevHook`. `tests/e2e/kit-browser.ts` has a static server, a stub gamepad and multi-finger touch.
- Run `auditTouchLayout(measureTouchLayout())` at phone sizes.

Everything in the Kit was written for GameDNA. Sources for the numbers are cited in the matching skills.
