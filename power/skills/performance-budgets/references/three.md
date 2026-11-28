# Budgets in three.js 0.170 games

## Measuring with renderer.info

`renderer.render()` resets `renderer.info` on every call. The Kit stage's post-processing chain calls it once per pass, so with `quality: 'high'` the counters show only the final output pass, usually 1 draw call. Reset once per frame yourself and read after the stage draws:

```ts
import { checkBudget } from '@gamedna/kit/contracts';
import { createFrameSampler, createQualityGovernor, frameBudgetMs } from '@gamedna/kit/budget';
import { exposeDevHook } from '@gamedna/kit/loop';

const info = stage.renderer.info;
info.autoReset = false;
const frames = createFrameSampler(120);
const governor = createQualityGovernor({
  performance: CONTRACTS.performance,
  targetMs: frameBudgetMs(CONTRACTS.performance) * 1.15,
  hysteresis: 0.1,
  onChange: (level) => applyQuality(level),
});
let last = performance.now();

function render(alpha: number, dt: number): void {
  const now = performance.now();
  frames.push(now - last);
  governor.frame(now - last);
  last = now;
  info.reset();
  stage.render(dt, focus);
}

exposeDevHook({
  perf: () => ({
    ...frames.stats(),
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    budget: checkBudget(CONTRACTS.performance, { frameMs: frames.quantile(0.95), drawCalls: info.render.calls, triangles: info.render.triangles }),
  }),
});
```

- `info.memory.geometries` and `info.memory.textures` count live GPU resources. They are the leak signal: after a level unloads they must return to the count before it loaded.
- Each new material permutation compiles a shader program on first draw and stalls that frame. Call `await stage.renderer.compileAsync(stage.scene, stage.camera)` behind the loading screen, and keep `info.programs.length` flat during play.
- Shadow casters are drawn again into the shadow map: each caster adds one draw call per shadow-casting light.

## Instancing and batching

- `new THREE.InstancedMesh(geometry, material, max)`, then set `mesh.count` to the live number. Cost follows `count`, not `max`.
- After `setMatrixAt`, set `instanceMatrix.needsUpdate = true`. After `setColorAt`, set `instanceColor.needsUpdate = true`; `instanceColor` exists only after the first `setColorAt`.
- The culling sphere of an `InstancedMesh` is computed once, on first use. When instances move, call `computeBoundingSphere()`; for sets spread over the whole world, such as skid marks, set `frustumCulled = false`.
- Different geometries with one material: `new THREE.BatchedMesh(maxInstances, maxVertices, maxIndices, material)` with `addGeometry` and `addInstance`. Per-instance culling is on by default (`perObjectFrustumCulled`).
- Static meshes with one material: `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`, merged per chunk so each chunk still culls.

## Culling and shadows

- When the far plane is long, also hide whole chunks by distance: give each chunk a `Group` and set `visible = false` beyond the view distance.
- Cast shadows only inside the stage's `shadowExtent` box (30 to 60 m around the focus point). Set `castShadow = false` on distant scatter.
- Lower `stage.camera.far` together with fog density; geometry past the fog costs draws and shows nothing.

## Quality levels at runtime

`createStage({ quality })` is fixed at creation: `low` drops post-processing, uses a 1024 shadow map and pixel ratio 1. Choose it at startup from a saved setting or `?quality=low`. The governor's `onChange` then adjusts what the game owns: instance `count`, particle caps, `castShadow` on secondary objects, chunk view distance. Without post-processing (`low`), pixel ratio can also change live with `stage.renderer.setPixelRatio(r)` followed by `stage.renderer.setSize(innerWidth, innerHeight)`.

## Disposal

- `scene.remove(obj)` frees nothing on the GPU. Call `disposeObject3D(obj)` after removing it; it frees geometries, materials, textures, instance buffers, light shadow maps and skeletons, each once.
- Resources shared outside the subtree go in `keep`. Ridgeline Racer's `effects.ts` builds a 110-sprite `RingBuffer` and an 800-instance skid mesh through `createResourceTracker({ keep: [scenery.softTexture, scenery.skidGeometry] })`, so one `dispose()` frees the effects and leaves the shared scenery alone.
- Dispose a render target, never its texture alone; the Kit skips render-target textures and counts them as `skipped`.
- `stage.dispose()` frees what the stage made (sky, environment map, shadow map, post-processing, renderer) and removes the canvas. It does not free what the game added to `stage.scene`.

## Textures

- Size maps to their largest on-screen footprint: a prop never wider than 256 px on screen needs at most a 512 map.
- `proceduralSurface({ size: 512 })` makes three maps, about 4 MB with mipmaps; at `size: 1024` it is about 16 MB.
- Pass `anisotropy: stage.anisotropy` (at most 8) to ground and road textures only.
- Free per-level textures with the level's tracker. Textures the GLTFLoader created are reached through the materials, so `disposeObject3D(gltf.scene)` frees them.
