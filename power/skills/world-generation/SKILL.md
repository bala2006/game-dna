---
name: world-generation
description: Seeded terrain, noise, roads and paths, vegetation scatter, dungeons, navigation grids, spatial indexes, streaming and terrain level of detail. Use when building the ground a game happens on, or when it looks tiled, empty or wrong in size. Not for routes and gating (level-design) or surface shading (rendering-and-lighting).
license: MIT
metadata:
  owner: world
  topics: terrain, noise functions, seeded generation, roads and paths, vegetation scatter, procedural dungeons, environment placement, navigation grids, spatial partitioning, world streaming, terrain level of detail
  engines: portable, three@0.170, phaser@3.90
  kit: kit/world, kit/random, kit/rooms, kit/nav
---

# World generation

## Scope

Owns the world as data: height function, paths, scatter, dungeon tiles, the navigation grid built from them, spatial indexes over static content, and which chunks exist at what resolution. When the question is where the critical path, keys or secrets go, use `level-design`. When agents need routes over the grid, use `enemy-ai`. When noise becomes a texture, use `procedural-assets`. When streaming or instancing hits a frame or memory limit, use `performance-budgets`.

## Decisions

- **One seed tree.** Each subsystem draws from its own `createRng(deriveSeed(seed, 'trees'))`. With a shared Rng, one extra prop reshuffles the forest.
- **Layout is a pure module**, 1 unit = 1 m, tested in Node. The simulation collides with the same height function, boxes and points the view draws (`apps/trail-walk/src/layout.ts`).
- **Placement sizes.** Person 1.75 m; door 2.0-2.1 x 0.8-0.9 m; storey 3-3.5 m; road lane 3.5 m, two-lane road 7-7.5 m plus 1-2.5 m shoulders; race track 12-15 m; car 4.0-4.9 m; trees 8-20 m (broadleaf) and 10-30 m (conifer).
- **Steepness is amplitude over wavelength.** In `createHeightField`, 0.1 (Trail Walk: 7 m over 70 m) gives median slopes of 6° and a 99th percentile of 15°; 0.18 (Ridgeline: 38 m over 210 m) gives 11° and 27°. Keep walked ground near 0.1. Octave, warp and ridge recipes are in `references/noise.md`.
- **Flatten along paths**: `flatWidth` covers road, curbs and run-off; `blend` of 3-6x the hill amplitude gives grassy banks, 1-2x gives cut embankments.
- **Roads**: closed centripetal Catmull-Rom through 10-16 jittered control points, resampled every 1-2 m. Reject seeds whose tightest radius is below v²/a at the vehicle's corner speed (44 m at 20 m/s and 9 m/s² of grip).
- **Scatter**: trees 3-5 m apart, rocks 2-8 m, tufts 0.5-1 m. `scatter` saturates near 0.7 points per spacing² of area and silently returns fewer beyond that. Mask with fbm at a 40-110 m wavelength: a 3-octave threshold of 0.5 covers 50% of the ground, 0.6 covers 25%. Keep clear bands along paths and 10-15 m around spawn and landmarks.
- **Dungeon tiles**: 32 px in 2D; 2.5-3 m in 3D so a one-tile corridor fits an over-shoulder camera. `loops` 0.1-0.25.
- **Navigation grid** from the same data: 0.5-1 m cells for walkers, cost 0 where blocked or too steep, 2-3 on rough ground so agents prefer paths.
- **Streaming**: 64-256 m chunks generated from `(seed, cx, cz)` alone; load a 3x3 to 5x5 ring, unload one ring further out.
- **Terrain LOD**: vertex spacing 3-5 m for walked ground, 10-12 m for land seen from a car. Switch levels when the error projects under 2 px: at 1080 px and 60° FOV, distance = error x 470.

## Mistakes

- Trees placed at y = 0, or unsunk on slopes: floating bases. Sample `height(x, z)` and sink trunks 0.2-0.4 m.
- Uniform Catmull-Rom: cusps and loops where control points bunch.
- Sim and view each build their own height function: characters float or sink.
- `createPathIndex(...).nearest` scans every segment for points more than 4 cells from the path. Size `cell` to a quarter of the farthest query, or cache heights.
- Chunk normals from `computeVertexNormals`: a lighting seam at every chunk edge.

## Reuse

`@gamedna/kit/world`: `createHeightField`, `createPathIndex`, `pathFrames` (`at(s, side)`, `offset(i, side)`), `scatter`, `ribbonGeometry`, `heightfieldGeometry`, `fadeTextureWithDistance`. `@gamedna/kit/random`: `createRng`, `deriveSeed`, `createNoise`. `@gamedna/kit/rooms`: `generateDungeon`, `floodDistances`, `TILE`. `@gamedna/kit/nav`: `createGrid`, `setCost`. The game keeps its biome rules and what stands where.

## Engines

- three.js 0.170: read `references/three.md` when turning layout data into terrain, ribbons, instanced scatter, chunks or LOD.
- Phaser 3.90: read `references/phaser.md` when a generated grid becomes a tilemap.

## Verify

- Same seed, same layout hash; another seed differs.
- Height is 0 within `flatWidth` along every path, sampled every 2 m.
- Scatter: no pair closer than `spacing`, none in a clear band, at least 80% of `count` placed.
- Slopes sampled on a 1 m grid stay under the controller's walkable limit where the player walks.
- Every dungeon floor tile has `distance >= 0`. A fly-through at eye height shows no floating props and no world edge.
