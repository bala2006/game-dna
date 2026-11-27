---
name: threejs-kit
description: Setting up a three.js 0.170 game on the GameDNA Kit. Where the code comes from, module layout, render loop wiring, glTF loading, version checks and single-file builds. Use when starting, wiring or upgrading a three.js game. Not for lighting (rendering-and-lighting), budgets (performance-budgets) or 2D games (phaser-starter).
license: MIT
metadata:
  owner: engine
  topics: three.js project setup, three.js render loop integration, gltf assets, three.js version compatibility, kit integration, single-file builds
  engines: three@0.170
  kit: kit/stage, kit/loop, kit/dispose, kit/contracts
---

# three.js on the Kit

## Scope

Owns how a three.js game is assembled on the Kit. When choosing exposure, materials, shadows or post-processing, use `rendering-and-lighting`; when a scene must fit a frame or memory budget, use `performance-budgets`; when the game is 2D, use `phaser-starter`.

## Decisions

- **Tested: three 0.170.0 with `@types/three` 0.170.0**, reported by the fingerprint profile as `engine.support: "tested"`.
- **`untested-version`:** use only APIs present in the installed `three` and `@types/three` typings, check the three.js release notes and migration guide for each API the game and Kit touch, never upgrade or downgrade without the user's authorization, and report the version and what was checked.
- **`unsupported`** (Babylon.js, PlayCanvas, native engines): the Kit and this guidance do not apply. Say so; do not port the Kit.
- **Code source.** In this repo, `"*"` workspace dependencies as in `apps/trail-walk/package.json`, importing `@gamedna/kit/stage` and the other subpaths. Elsewhere, copy the Power's `kit/src/` to `src/kit/`, install `three@0.170.0` exactly and import `./kit/stage.js`; leave copied files unedited.
- **Module layout**, as in both three.js apps: `contracts.ts`, `layout.ts` or `track.ts` (the world as seeded data), `sim.ts` (state and `step(input)` at the contract rate), `scenery.ts` (meshes from the layout) and `main.ts` (stage, input, camera, loop, `exposeDevHook`). The first three never import `three`, so their tests run in Node.
- **One loop.** `runFixedStep({ hz, maxStepsPerFrame, tick, render })`: `tick` samples input and steps the sim; `render(alpha, dt)` interpolates by `alpha`, updates the camera and calls `stage.render(dt, focus, ahead)` once.
- **glTF** loads with `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`; Draco and KTX2 need their decoder files copied into `public/`. glTF is meters, +Y up, facing +Z, the Kit's own axes, so a correct model needs no rotation.
- **WebGL only.** The stage uses `WebGLRenderer`, GLSL shaders and `EffectComposer`; `three/webgpu` is not used or tested.

## Mistakes

- Addon imports without `.js` (`three/addons/loaders/GLTFLoader`) fail to resolve.
- Two copies of three from a dependency's own pin: `instanceof` checks fail and the console warns about multiple instances.
- Color textures without `colorSpace = THREE.SRGBColorSpace` look washed out and data maps with it shade wrongly. Leave `renderer.outputColorSpace` at sRGB and add no gamma pass after the stage's `OutputPass`, or colors convert twice.
- A `ShaderMaterial` missing `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` renders darker than its neighbors.
- Uncapped `renderer.setPixelRatio(devicePixelRatio)`: a 3x phone draws 9 times the pixels. The stage caps it at 1.5 (1 at `low`).
- `renderer.setAnimationLoop` beside `runFixedStep`: every frame renders twice.
- Vite hot reload stacking a second canvas: stop the loop and `stage.dispose()` in `import.meta.hot?.dispose`.

## Reuse

- `@gamedna/kit/stage`: `createStage(options)` returns `renderer`, `scene`, `camera`, `sun`, `canvas`, `anisotropy`, `render(dt, focus, ahead?)` and `dispose()`; plus `proceduralSurface`, `canvasTexture`, `hsv`.
- `@gamedna/kit/loop`: `runFixedStep`, `FixedStepClock`, `onPageHidden`, `onFirstGesture`, `exposeDevHook`.
- `@gamedna/kit/dispose`: `disposeObject3D`, `createResourceTracker`. `@gamedna/kit/contracts`: `defineContracts`, `stepSeconds`, `ticksFor`.
- `packages/kit/tools/single-file.mjs`, in the Power as `kit/tools/single-file.mjs`.

The game keeps its layout, rules, scenery and dev-hook state shape.

## Engines

- three.js 0.170: read `references/three.md` when writing `main.ts`, loading glTF or building one HTML file, and `references/compatibility.md` when the installed version differs or an API looks unfamiliar.

## Verify

- `npm ls three` shows one `three@0.170.0`; `npm run typecheck` passes.
- `grep -n "from 'three'" src/sim.ts src/layout.ts` prints nothing, and the sim tests run in Node.
- `npm run build -w <app>`, then a browser test at `?dev&quality=low` with no page or console errors.
- One HTML file: open it through `file://` with `?dev` and wait for `window.__game`.
