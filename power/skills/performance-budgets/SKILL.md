---
name: performance-budgets
description: Frame, draw-call, memory and simulation budgets for web games, and the profiling, pooling, instancing, culling, disposal and adaptive quality that meet them. Use when a game stutters, leaks or must hold its frame rate on a phone. Not for visual choices (rendering-and-lighting) or the timestep (fixed-step-simulation).
license: MIT
metadata:
  owner: performance
  topics: profiling, frame budgets, draw calls, instancing, batching, culling, object pooling, memory management, texture budgets, asset streaming, adaptive quality, resource disposal
  engines: portable, three@0.170, phaser@3.90
  kit: kit/contracts, kit/budget, kit/pool, kit/dispose
---

# Performance budgets

## Scope

Owns the numbers a game must fit, how they are measured, and the techniques that restore them. When a cut changes the look, use `rendering-and-lighting` to decide what goes; when ticks are slow because of their rate or order, use `fixed-step-simulation`; when a measurement needs a browser harness, use `game-verification`.

## Decisions

- **Budgets live in the contract's `performance` block.** Defaults when the user names none, judged at p95 because spikes feel worse than a slow mean:

| Budget | Integrated laptop GPU | Mid-range phone |
|---|---|---|
| Frame time, p95 | 16.7 ms | 16.7 ms (33.3 if 30 fps is declared) |
| All ticks in one frame | 2 ms | 2 ms |
| Draw calls | 300 | 150 |
| Triangles drawn | 2 M | 500 k |
| Texture memory | 256 MB | 128 MB |
| Pixel ratio | 1.5 | 1 to 1.25 |
| First download, gzipped | 6 MB (5 s at 10 Mbit/s) | 6 MB |

- **Texture bytes are width x height x 4, plus a third for mipmaps**, whatever the file size: a 2048 x 2048 map costs about 22 MB. KTX2 stays compressed on the GPU at a quarter to an eighth of that.
- **No allocation in `tick` or `render` after warm-up.** Anything spawned more than once a second comes from a pool with a hard maximum.
- **One draw per repeated thing:** ten or more copies become one instanced draw, static meshes sharing a material merge, 2D sprites share an atlas.
- **Cull by chunk**, 50 to 100 m in 3D or one screen in 2D. Culling is per object, so one merged world is never culled.
- **Stream in tiers:** load the title and first level, fetch the next level during play, free a level's assets when it ends.
- **Quality adapts to sustained overrun only.** Feed `createQualityGovernor` the animation-frame interval with `targetMs: frameBudgetMs(perf) * 1.15` and `hysteresis: 0.1`, so vsync jitter stays in band while two dropped frames per 30-frame window count as over. Levels change pixel ratio, shadows and effect counts, never rules.

## Mistakes

- A sawtooth heap graph with 5 to 20 ms pauses: vectors, arrays or closures made every frame.
- Removing an object from the scene and calling it freed: GPU memory grows with every level.
- `whenFull: 'recycle-oldest'` on gameplay objects: a live enemy vanishes. Recycle effects only.
- A governor fed smoothed deltas never sees a spike.

## Reuse

- `@gamedna/kit/contracts`: `checkBudget(perf, { frameMs, simulationMs, drawCalls, triangles, textureMemoryMB })` returns `{ ok, overruns }`.
- `@gamedna/kit/budget`: `frameBudgetMs`, `createFrameSampler(capacity)` (mean and percentiles, no allocation), `createQualityGovernor` with `frame`, `judge` and `set`, and `measure(fn, now)`.
- `@gamedna/kit/pool`: `createPool({ create, reset, max, whenFull })`, and `RingBuffer` for effects.
- `@gamedna/kit/dispose`: `disposeObject3D(root, { keep })`, `createResourceTracker()`.

The game keeps what each quality level changes and which assets each level needs.

## Engines

- three.js 0.170: read `references/three.md` when reading `renderer.info`, instancing, culling, disposing or budgeting textures.
- Phaser 3.90: read `references/phaser.md` when batching sprites, pooling game objects or timing a Phaser scene.

## Verify

- Governor test: 90 frames at 40 ms step one level down, then 180 at 16.7 ms step back up.
- `checkBudget(CONTRACTS.performance, sample)` on dev-hook samples prints `overruns` on failure.
- Leak test: load and unload a level five times; GPU geometry and texture counts return to their first value.
- Pool test: after warm-up `size` stops growing and `inUse` never exceeds `max`.
- 60 s on a real target-class device for p95 frame time and draw calls, or report frame rate as unverified.
