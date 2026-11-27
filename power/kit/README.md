# GameDNA Kit

GameDNA Kit is the reusable code foundation for browser games. It covers the parts every game rebuilds and many get wrong: input on every device, collision, movement controllers, vehicle handling, enemy AI and pathfinding, saves, camera views, real-world proportions for cars and people, terrain and roads, a lit three.js scene and a fixed-step loop. You write the rules. The Kit supplies tested building blocks and keeps the numbers honest.

Each module has one job and a small surface. Import only the modules you need. Every module states its units, axes and assumptions in its opening comment.

## Portable modules (no three.js, no DOM unless noted)

| Module | What it gives you |
|---|---|
| `@gamedna/kit/random` | Seeded `createRng`, `restoreRng`, `deriveSeed`, `shuffle`, `weightedPick`, tileable value noise, `clamp`, `smoothstep`, `ease`, `wrapAngle` |
| `@gamedna/kit/loop` | `FixedStepClock`, `runFixedStep({ tick, render })` with interpolation (browser), `onPageHidden`, `onFirstGesture`, `exposeDevHook` |
| `@gamedna/kit/contracts` | `defineContracts` for spatial, simulation, interaction and performance contracts and event names; `stepSeconds`, `ticksFor`, `checkBudget`, `assertEvent` |
| `@gamedna/kit/collision` | AABB, circle and oriented-box tests and push-outs, `rayVsAabb`, `segmentVsCircle`, `moveAndCollideTiles` (axis-separated, sub-stepped against tunneling), `SpatialHash` broad phase |
| `@gamedna/kit/controller` | Platformer body with acceleration curves, coyote time, jump buffer, variable jump and gravity sign; `stepGround` for camera-relative 3D movement with sprint, jump and ground snapping |
| `@gamedna/kit/handling` | `stepVehicle`: arcade vehicle dynamics on XZ with grip, drift, braking and speed-dependent steering; `bounceOffWall` |
| `@gamedna/kit/fsm` | `createStateMachine` with a typed transition table, enter and exit hooks and ticks in state |
| `@gamedna/kit/behavior` | Behavior trees (sequence, selector, parallel, decorators, cooldown in ticks) with per-agent memory, and utility AI (`chooseByUtility` with response curves and inertia) |
| `@gamedna/kit/steering` | Seek, flee, arrive, pursue, evade, seeded wander, separation, obstacle avoidance, `combine`, `integrate` |
| `@gamedna/kit/nav` | Grid `findPath` (A* with a binary heap and typed arrays, no corner cutting by default), `smoothPath`, `losClear`, `flowField` |
| `@gamedna/kit/events` | `createEventQueue`: typed gameplay events with tick stamps, deferred dispatch at `flush`, declared-name checking |
| `@gamedna/kit/save` | `createSaveSystem`: versioned saves with migration chains, FNV-1a checksum, refusal of future versions, injectable storage |
| `@gamedna/kit/inventory` | `createInventory`: slots, stacking, weight limit, move and split, JSON round trip |
| `@gamedna/kit/rooms` | `generateDungeon`: seeded rooms, spanning-tree corridors plus loops, start and end by distance, every floor tile reachable |
| `@gamedna/kit/pool` | `createPool` with a hard maximum and recycle policy, `RingBuffer` for effect sprites |
| `@gamedna/kit/budget` | `createFrameSampler` (mean and percentiles without allocation), `createQualityGovernor` with hysteresis, `measure` |
| `@gamedna/kit/feedback` | Trauma screen shake (seeded, reduced-motion aware), `HitStop` in ticks, `Flash`, `Tween` and easing curves |
| `@gamedna/kit/input` | `createInput` (browser): keyboard, pointer-lock mouse look, gamepad and an on-screen touch overlay, with taps latched to the next tick; `BINDINGS`, `TOUCH_LAYOUTS`, `auditTouchLayout` |

## three.js modules (`three` 0.170.0 peer dependency)

| Module | What it gives you |
|---|---|
| `@gamedna/kit/camera` | `createCameraRig` with `VIEW_PRESETS`: chase, far chase, hood, cockpit, over-shoulder, first person and top-down. Smoothing, look input, recentering, collision pull-in, cuts and blends, near plane per view |
| `@gamedna/kit/vehicle` | `buildCar` from real dimensions (hatch, sedan, coupe, SUV) with wheels, cockpit, mirrors and camera mounts. `animateCar` drives wheels, roll, pitch and brake lights. `measureCar` checks the body against its spec |
| `@gamedna/kit/character` | `humanoidLayout` from measured body ratios in five proportion styles, `buildHumanoid` with a joint rig and an eye mount, `animateHumanoid` with planted feet |
| `@gamedna/kit/world` | Path index and frames, `ribbonGeometry` for roads, curbs, rails and trails, `createHeightField` flattened along paths, Poisson `scatter`, terrain geometry, distance texture fade |
| `@gamedna/kit/stage` | `createStage`: renderer, camera, sky shader, sky-lit environment, sun shadows that follow the player, fog, bloom and vignette, resize, full disposal. `proceduralSurface` makes color, roughness and normal maps from one function |
| `@gamedna/kit/dispose` | `disposeObject3D` (geometries, materials and every referenced texture, each once) and `createResourceTracker` |

## Featured apps

All four games in this repository use the Kit. The two three.js games are built only on it; the two Phaser games combine it with `@gamedna/starter`.

| App | Kit modules it uses | Run |
|---|---|---|
| `apps/ridgeline-racer` | contracts, handling, pool, dispose, camera, vehicle, character, world, stage, input, loop, random | `npm run dev -w ridgeline-racer` |
| `apps/trail-walk` | contracts, collision, controller, camera, character, vehicle, world, stage, input, loop, random | `npm run dev -w trail-walk` |
| `apps/gravity-shift` | collision (tile mover), controller (platformer body) | `npm run dev -w gravity-shift` |
| `apps/neon-survivor` | fsm (run state), steering (chasers), random | `npm run dev -w neon-survivor` |

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

Keep game rules in `tick`, in plain data, with a seeded `createRng`. `render` reads that state and never writes it. Then the rules run in unit tests without a browser, as the featured apps show in their `tests/` folders.

## Ship one HTML file

Build with Vite, then pack the build: `node tools/single-file.mjs dist game.html`. The file runs from disk with no server and no network, because three.js is bundled.

## Use the Kit outside this repository

The GameDNA Power ships the Kit source in `power/kit/`. Copy its `src/` folder into your project as `src/kit/`, install `three@0.170.0` if you use the three.js modules, and import from `./kit/input.js` and the other module files. Each skill in `power/skills/` names the modules it relies on in its `metadata.kit` field.

## Check your game

- Unit test the rules: same seed and inputs give the same state.
- Drive the built game with Playwright through a `?dev` hook from `exposeDevHook`. `tests/e2e/kit-browser.ts` has a static server, a stub gamepad and multi-finger touch.
- Run `auditTouchLayout(measureTouchLayout())` at phone sizes.

Everything in the Kit was written for GameDNA. Sources for the numbers are cited in the matching skills.
