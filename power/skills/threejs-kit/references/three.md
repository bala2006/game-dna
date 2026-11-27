# Wiring a three.js 0.170 game

## Contents

- Project files
- main.ts
- glTF assets
- One HTML file

## Project files

- `package.json`: `"type": "module"`, `three` pinned to `0.170.0`, `vite` `7.3.8` as a dev dependency, and in this repo the Kit's workspace entry copied from `apps/trail-walk/package.json`. Build script: `vite build && node ../../scripts/copy-licenses.mjs dist three`, which writes `dist/THIRD_PARTY_LICENSES.txt`.
- `vite.config.ts`: `base: './'` so the build runs from any folder and from disk, `build.target: 'es2022'` for top-level `await`, and `chunkSizeWarningLimit: 2000` because three alone is about 600 KB minified (160 KB gzipped).
- `index.html`: viewport meta with `viewport-fit=cover`, `html, body { margin: 0; height: 100%; overflow: hidden }`, `canvas { display: block; touch-action: none }`, HUD elements with class `hud` (the touch-layout audit avoids them), and one `<script type="module" src="./src/main.ts">`. `createStage` creates and prepends the canvas itself.
- `tests/`: `sim.test.ts` and `contracts.test.ts`, run in Node by the root Vitest config.

## main.ts

The sample keeps contracts, rules and wiring in one file for brevity; a game splits them into `contracts.ts`, `sim.ts` and `main.ts`.

```ts
// check: compile
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { defineContracts, stepSeconds } from '@gamedna/kit/contracts';
import { createResourceTracker } from '@gamedna/kit/dispose';
import { exposeDevHook, onPageHidden, runFixedStep } from '@gamedna/kit/loop';
import { createStage } from '@gamedna/kit/stage';

const CONTRACTS = defineContracts({
  name: 'crate-slide',
  spatial: { unit: 'meter', up: '+y', forward: '+z', ground: 'xz', scales: { crate: 1 } },
  simulation: { hz: 60, maxStepsPerFrame: 5, deterministic: true, order: ['movement'] },
  performance: { targetFps: 60, targetHardware: 'mid-range phone, 2022', simulationBudgetMs: 2, maxDrawCalls: 150, quality: ['high', 'low'] },
});

// Rules: plain data stepped at the contract rate, no three.js objects.
const DT = stepSeconds(CONTRACTS);
const sim = { x: 0, prevX: 0, paused: false };
function tick(): void {
  if (sim.paused) return;
  sim.prevX = sim.x;
  sim.x += 3 * DT;
}

const params = new URLSearchParams(location.search);
const stage = createStage({
  sunDirection: new THREE.Vector3(-0.5, 0.4, -0.8).normalize(),
  quality: params.get('quality') === 'low' ? 'low' : 'high',
});
const tracker = createResourceTracker();

const draco = new DRACOLoader().setDecoderPath('./draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('./basis/').detectSupport(stage.renderer);
const gltf = await new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).loadAsync('./models/crate.glb');
draco.dispose();
ktx2.dispose();
const crate = tracker.track(gltf.scene);
stage.scene.add(crate);
await stage.renderer.compileAsync(stage.scene, stage.camera);

onPageHidden(() => { sim.paused = true; });
const focus = new THREE.Vector3();
const loop = runFixedStep({
  hz: CONTRACTS.simulation.hz,
  maxStepsPerFrame: CONTRACTS.simulation.maxStepsPerFrame,
  tick,
  render(alpha, dt) {
    crate.position.x = sim.prevX + (sim.x - sim.prevX) * alpha;
    stage.render(dt, focus.copy(crate.position));
  },
});

exposeDevHook({ get state() { return { x: sim.x, paused: sim.paused }; } });

import.meta.hot?.dispose(() => {
  loop.stop();
  stage.scene.remove(crate);
  tracker.dispose();
  stage.dispose();
});
```

- Render reads `sim` and writes only meshes and the camera. Rules never read `mesh.position`.
- `compileAsync` compiles every shader the scene needs before the first frame, so the first second of play does not hitch.
- Dispose the loaders after the last model of a batch loads; they hold worker threads.

## glTF assets

- `GLTFLoader` sets `colorSpace` on the textures it creates, so do not change it. Textures you add by hand still need `colorSpace = THREE.SRGBColorSpace` for color and none for data maps.
- Check scale on load: `new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3())` should match the size recorded in the spatial contract's `scales` within about 2 percent. Fix the export, not the scene graph, when it does not.
- Several copies of a static model share geometry and materials: use `gltf.scene.clone()`, and when the last copy goes, call `disposeObject3D` once on any one of them. Skinned models need `clone` from `three/addons/utils/SkeletonUtils.js`, and one `THREE.AnimationMixer` per copy, updated in `render` with the frame `dt`.
- Draco geometry: copy `draco_wasm_wrapper.js`, `draco_decoder.wasm` and `draco_decoder.js` from `node_modules/three/examples/jsm/libs/draco/gltf/` to `public/draco/`.
- KTX2 textures: copy `basis_transcoder.js` and `basis_transcoder.wasm` from `node_modules/three/examples/jsm/libs/basis/` to `public/basis/`, and call `detectSupport(renderer)` before loading.
- Both decoders are Apache-2.0 code. Record them in `docs/DEPENDENCY_INVENTORY.md` and ship their license next to three's.
- Meshopt compression needs no files: `setMeshoptDecoder(MeshoptDecoder)` with `MeshoptDecoder` from `three/addons/libs/meshopt_decoder.module.js`, whose wasm is embedded in the module.
- Use only models the user authored or GameDNA generated, and record each in `.gamedna/assets-manifest.json`.

## One HTML file

`node packages/kit/tools/single-file.mjs apps/<app>/dist game.html` inlines every module script and stylesheet that `dist/index.html` references and drops `modulepreload` links. It does not inline files from `public/` or anything fetched at runtime, and Chromium blocks fetches from a `file://` page, so those break.

- Kit-made content (`createStage`, `proceduralSurface`, `canvasTexture`, `buildCar`, `buildHumanoid`) needs no files and works as is.
- Import each model from `src/` as `import crateUrl from './models/crate.glb?url&inline'`; Vite embeds it as a base64 data URL, about a third larger than the file. Images imported from `src/` inline below `build.assetsInlineLimit` (4096 bytes) unless imported with `?inline`.
- Draco and KTX2 decoders fetch their wasm and cannot run from disk. Use uncompressed or meshopt-compressed glTF.
- Expect about 600 KB for three and the Kit before game code and embedded assets; the file is not gzipped when opened from disk.
