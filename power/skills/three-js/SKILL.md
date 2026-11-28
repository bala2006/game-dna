---
name: three-js
description: Build and check 3D games in three.js on the GameDNA Kit. Vite or one HTML file, fixed-step loop, stage with sky and shadows, textures, instancing, budgets and Playwright checks. Use for any 3D build, or when a 3D game is slow, flickers or looks wrong.
---

# three.js

GameDNA's MCP tools have no three.js adapter yet. Until it ships, this skill replaces them: you write the checks with Playwright, and a `?dev` hook stands in for `gd_observe`.

Build on the GameDNA Kit (`packages/kit`, README there). It is the tested foundation for every 3D step; write only the game's own rules and dressing. Two apps show the whole shape: `apps/ridgeline-racer` (driving) and `apps/trail-walk` (on foot).

## The data shape

One game has four parts, each in its own module:

1. **Layout** (`layout.ts` or `track.ts`): the world as data from the seed: paths, `height(x, z)`, scatter results, prop boxes. Pure.
2. **Simulation** (`sim.ts`): plain state and `step(input)` at a fixed 60 Hz. Seeded `createRng`, no `Math.random()`, no clock reads, no three.js scene objects. It emits events (`hit`, `collect`, `finish`) for the view.
3. **View** (`scenery.ts`, `main.ts`): the scene built from the layout, then a `render(alpha, dt)` that reads state, interpolates by `alpha` and never writes state.
4. **Dev hook**: `exposeDevHook({ state, input, ... })` exposes `window.__game` only with `?dev`.

```ts
runFixedStep({
  tick() { sim.step(toActions(input.sample(), cameraYaw)); },
  render(alpha, dt) { /* place meshes from sim state */ cameraYaw = rig.update(dt, target, input.takeLook(dt)).heading; stage.render(dt, focus); },
});
```

## Step 1: Pick a setup

| Setup | Pick when | How |
|---|---|---|
| Vite project in this repo | Default | Copy an app's `package.json` and `vite.config.ts`. Depend on `"@gamedna/kit": "*"` and `"three": "0.170.0"`; the build copies the three.js license |
| Vite project elsewhere | The game lives outside this repo | Copy the Power's `kit/src` into the game as `src/kit/`, install `three@0.170.0`, import `./kit/<module>.js` |
| One HTML file | The user asks for one file to share | Build with Vite, then `node packages/kit/tools/single-file.mjs dist game.html` (the Power ships it as `kit/tools/single-file.mjs`). It runs from disk with no server or network |

| Kit module | Gives | Skill with the numbers |
|---|---|---|
| `@gamedna/kit/stage` | `createStage`: renderer, camera, sky, sky-lit environment, sun shadows that follow the player, fog, bloom, vignette, resize. `proceduralSurface`, `canvasTexture`, `hsv` | art-direction, light-and-color |
| `@gamedna/kit/loop` | `runFixedStep`, `onPageHidden`, `onFirstGesture`, `exposeDevHook` | this skill |
| `@gamedna/kit/random` | `createRng`, `deriveSeed`, `createNoise`, `smoothstep`, `ease`, `wrapAngle` | this skill |
| `@gamedna/kit/world` | Paths, ribbons, height field, scatter, terrain geometry, distance fade | world-building |
| `@gamedna/kit/vehicle` | Car presets, body, wheels, cockpit, mounts, animation, `measureCar` | vehicle-design |
| `@gamedna/kit/character` | Proportions, rig, planted-foot gait, eye mount | character-design |
| `@gamedna/kit/input` | Every input device, touch overlay, default bindings, layout audit | controls-and-input |
| `@gamedna/kit/camera` | View presets and the camera rig | camera |

If the Kit lacks something two games would both need, add it to the Kit with a unit test in `packages/kit/tests`, then run `npm run build:power` so `power/kit` matches.

## Step 2: Stage and light

`createStage` holds these defaults; pass options to change them:

- ACES filmic tone mapping, exposure 0.9-1.1, soft shadows, pixel ratio capped at 1.5.
- One sky shader draws the background and, through PMREM, lights every material, so reflections match the sky. `environmentIntensity` 0.6-0.9.
- Fog color is the sky's horizon color (world-building skill). `fog` 0.0006-0.0012 for views of 1-2 km, about 0.004 for a 300 m meadow.
- Sun intensity 2.5-3.5 with a 2048 shadow map. `shadowExtent` 30-60 m around the focus point: `stage.render(dt, focus, ahead)` moves the shadow box with the player each frame. A shadow box over the whole world gives blurry shadows.
- Bloom with a threshold above 1, so only emissive parts glow; vignette 0.2-0.35.
- `quality: 'low'` drops post-processing, halves the shadow map and caps pixel ratio at 1. Use it on phones and in headless tests (`?quality=low`).

For a realistic look, follow the art-direction skill's `references/realistic-3d.md`.

## Step 3: Textures

- `proceduralSurface({ size, sample, normalStrength, anisotropy: stage.anisotropy })` builds a color map, a roughness map and a normal map from one `sample(x, y, u, v)` function returning `{ h, r, g, b, rough }`. It also returns the average color, for distance fades.
- Sample tileable noise (`noise.fbm(u * n, v * n, channel, octaves, n)`) so textures repeat without seams.
- Color maps are sRGB. Roughness and normal maps stay linear.
- `canvasTexture` draws signs, banners and decals with the 2D canvas. All text is original (polish-and-detail skill).
- A custom `ShaderMaterial` must end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`, or it renders too dark and saturated when drawn straight to the screen.

## Step 4: Geometry

- Build in meters (world-building skill).
- One `InstancedMesh` per repeated object: trees, posts, grass, skid marks, crowds. Set per-instance color with `setColorAt`.
- Merge static meshes that share a material with `mergeGeometries`.
- Decals on roads use `polygonOffset` with a negative factor; terrain under a road gets a positive one.
- Reuse `Vector3`, `Quaternion` and `Matrix4` objects in per-frame code. Allocation in the loop causes garbage-collection stutter.

## Step 5: Budgets

| Measure | Desktop | Phone |
|---|---|---|
| Draw calls (`renderer.info.render.calls`) | Under 300 | Under 150 |
| Triangles | Under 2 M | Under 500 k |
| Shadow casters | Near the player only | Fewer; or a blob shadow |
| Pixel ratio | 1.5 | 1-1.25 |
| Frame time | 16.7 ms at 60 fps | 33 ms at 30 fps or better |

Measure on a real GPU. Headless Chromium with SwiftShader renders on the CPU at a few frames per second, so it proves correctness, not speed.

## Step 6: Browser lifecycle

The Kit handles resize (`createStage`), blur release (`createInput`) and gives you the rest:

- `onPageHidden(() => sim.pause())`: pause when the tab is hidden.
- `onFirstGesture(startAudio)`: browsers block sound before a user gesture.

## Verify

- Unit test the simulation in `tests/sim.test.ts`: every protected rule, and the same seed and inputs give the same state. These tests need no browser.
- Browser test the built game in `tests/e2e/<app>.e2e.test.ts` with the helpers in `tests/e2e/kit-browser.ts` (`serveDist`, `launchChromium`, `openGame`, `frames`, `touch`), at `?dev&quality=low`:
  - No `pageerror` and no console error. `openGame` fails on the first page error.
  - Every camera view, by screenshot and by the view name in `__game.state`.
  - Every input device: keyboard, mouse look through `input.raw.look`, the stub gamepad `window.__pad`, and two-finger touch at 844x390.
  - `auditTouchLayout(measureTouchLayout())` at 667x375, 844x390 and 932x430.
  - An automatic player behind a URL flag, or a dev-hook shortcut, reaches the core loop's goal.
- Look at every screenshot. Measure them against the art-direction brightness and saturation band.

Report what was not checked: frame rate on a real GPU, sound and feel.

## Sources

- three.js documentation and examples, r170: `WebGLRenderer`, `PMREMGenerator`, `InstancedMesh`, `EffectComposer`, `UnrealBloomPass`, shader chunks.
- Fiedler, "Fix Your Timestep!" (2004): accumulator loop and interpolation.
- Akenine-Möller et al., *Real-Time Rendering* (4th edition, 2018): shadow maps, tone mapping, image-based lighting.
- Playwright documentation: browser contexts, touch emulation, CDP sessions.
