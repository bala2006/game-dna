---
name: world-building
description: The land a game happens on, in 2D and 3D. Real-world scale, map layout, terrain, roads and tracks, vegetation, landmarks and boundaries. Use when building a map or track, or when a world looks empty, fake, too big or too small.
---

# World building

A world reads as real when everything shares one scale, the land explains the paths on it, and detail varies at every distance. The level-design skill decides what the player does in a space. This skill builds the space.

## The data shape

1. **Scale**: 1 unit = 1 m in 3D. In 2D, pick pixels per meter from the player's sprite height and record it in the design record.
2. **Paths**: the routes players travel, as point lists: track centerline, roads, trails, rivers. Everything else is placed relative to them.
3. **Height**: a pure function `height(x, z)` built from seeded noise and flattened along paths.
4. **Scatter rules**: what grows or stands where, as data: type, density mask, spacing, distance from paths, scale and color ranges.
5. **Landmarks and bounds**: named places the player steers by, and the edges of the playable area.

`@gamedna/kit/world` implements this for three.js: `createPathIndex(points)`, `pathFrames(points)` (with `at(s, side)` for a point along the path), `ribbonGeometry(frames, ...)`, `createHeightField(...)`, `scatter(...)`, `heightfieldGeometry(...)` and `fadeTextureWithDistance(material, farColor)`. Seeded randomness and noise come from `@gamedna/kit/random`: `createRng`, `deriveSeed` and `createNoise`. Keep the layout (paths, height, scatter results, prop positions) in a pure module, so the simulation collides with the same data the view draws.

## Step 1: Scale

| Thing | Real size | Game note |
|---|---|---|
| Adult | 1.55-1.95 m, eye at 0.936 x height | character-design skill |
| Door | 2.0-2.1 m tall, 0.8-0.9 m wide | Over-shoulder games use 2.4-2.6 m by 1.2-1.4 m |
| Room height | 2.4-2.7 m | 3-4 m when a third-person camera works inside |
| Corridor | 1.0-1.5 m | At least 2.5-3 m for an over-shoulder camera |
| Stair | Rise up to 0.18 m, tread at least 0.28 m | Collision uses a ramp |
| Table, counter, chair seat | 0.75 m, 0.9 m, 0.45 m | |
| Storey of a building | 3-3.5 m | Window sill 0.9 m |
| Road lane | 3.0-3.6 m | Two-lane road 7-7.5 m with 1-2.5 m shoulders |
| Lane line | 0.1-0.15 m wide; dashes 3 m long with 9 m gaps | |
| Race track | 12-15 m wide | Curbs 1-1.5 m, run-off and barrier 5-8 m past the edge |
| Guardrail | Rail top at 0.75-0.8 m, posts every 2-4 m | |
| Street light | 8-10 m tall, 25-40 m apart | |
| Trees | Broadleaf 8-20 m, conifer 10-30 m | Scale variation 0.75-1.5x |
| Car | 4.0-4.9 m long | vehicle-design skill |

- Stylized games may enlarge spaces, never shrink them below the player's collision size. Scale every row by the same factor.
- 2D: pixels per meter = player sprite height / 1.75. A 48 px player gives about 27 px per meter. Tiles, doors and jump heights follow from that number.

## Step 2: Layout

Lay out paths first, then the land around them, then dressing.

- **Track or road**: a closed centripetal Catmull-Rom spline through 10-16 seeded control points, resampled every 1-2 m. Keep corner radii above 25 m for fast cars, and reject seeds whose track crosses itself.
- **Open areas**: connect places with paths along the easiest ground. Players follow paths, edges and lines of light (pacing-and-guidance skill).
- **Districts**: give each area one ground type, one vegetation mix and one accent color (art-direction and light-and-color skills).
- **Landmarks**: one tall, unique shape every 10-20 s of travel, visible from far away: a tower, a gantry, a lone tree, a ridge notch.
- **Bounds**: use land that explains itself: ridges, water, dense forest, fences, barriers. Avoid invisible walls. Keep a vista band beyond the bounds, so the edge never shows.

## Step 3: Terrain

- Hills: `fbm` noise at a 150-300 m scale with 20-40 m amplitude for rolling land. Add a ring of ranges 500-1000 m out, 200-400 m high, for a horizon.
- Flatten along paths: keep the land flat to the road's half width plus shoulders plus 5-10 m, then blend back to the hills. Blend over 3-6x the hill amplitude for grassy banks; 1-2x gives cut embankments.
- Resolution: about 10-12 m between vertices for land seen from a vehicle, 1-2 m for land a character walks on. Put fine detail into textures, not vertices.
- Color the land by rules, not by hand: slope picks rock, height picks forest or snow, a low-frequency noise picks dry patches.
- Break texture tiling: tile every 8-10 m, multiply by a vertex color from noise, and fade the texture toward its average color with distance (`fadeTextureWithDistance`).

## Step 4: Roads, paths and edges

`pathFrames` gives each path point a tangent and a distance along the path. `ribbonGeometry` builds a strip between two side offsets of a path, at two heights. With it, one function builds:

| Feature | From, to (m from center) | Heights | Notes |
|---|---|---|---|
| Road surface | -W/2 to W/2, split into 2-4 strips | 0.02 | Vertex color darkens the racing line and adds patches |
| Lines | 0.3-0.5 m inside each edge; center -0.1 to 0.1 | 0.022 | `skip` makes dashes; polygon offset stops flicker |
| Curbs | W/2 to W/2 + 1.1 | 0.025 to 0.09 | Alternate colors every 1-2.5 m |
| Rail | One offset, twice | 0.48 to 0.82 | A vertical ribbon; posts are instanced |
| River or trail | Any | Below or on the ground | Same frames, different material |

## Step 5: Scatter and vegetation

- Place with Poisson-disc spacing (`scatter`), never on a grid: trees 3-5 m apart, rocks 2-8 m, grass tufts 0.5-1 m.
- Mask density with low-frequency noise so plants form groves and clearings. Keep a clear band along paths and an empty ring around landmarks.
- Mix 2-3 species per area. Vary each instance's scale (0.75-1.5x), yaw and color (hue ±15°, value ±20%).
- Draw repeats with `InstancedMesh`: one draw call per species, with per-instance color (three-js skill).
- Densest detail goes where the camera is closest: tufts along road edges, sparse trees far out, then the fogged ranges.

## Step 6: Distance

- Far things lose contrast and take the sky color. Set the fog color to the sky's horizon color. `FogExp2` density 0.0006-0.0012 suits views of 1-2 km.
- Put at least three depth bands in every outward view: near dressing, the play band and the far ranges (art-direction skill).
- Show the scale of far things with known objects: people, cars and posts near the path.

## Verify

- Unit test the height field: the height is flat along each path, inside the flat width.
- Unit test scatter: no two points closer than the spacing, and none inside a path's clear band.
- Screenshot a 1.75 m person and a car next to a door, a lane and a tree. Each must look the right size against the others.
- Fly the camera along each path at player height. No floating plants, no holes at path edges, no visible world edge.

## Sources

- AASHTO, *A Policy on Geometric Design of Highways and Streets* (2018): lane and shoulder widths.
- FHWA, *Manual on Uniform Traffic Control Devices* (2009), section 3A.06: broken line segments and gaps.
- FIA International Sporting Code, Appendix O: circuit width and run-off.
- International Code Council, *International Building Code* (2021): door, stair and ceiling dimensions.
- Bridson, "Fast Poisson Disk Sampling in Arbitrary Dimensions" (SIGGRAPH sketches, 2007).
- Ebert, Musgrave et al., *Texturing and Modeling: A Procedural Approach* (3rd edition, 2003): fractal noise terrain.
- Lynch, *The Image of the City* (1960): paths, edges, districts, nodes and landmarks.
