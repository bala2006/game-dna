# World data to three.js 0.170 meshes

## Terrain

- `heightfieldGeometry({ size, segments, height, color, uvTile })` builds one square centered on the origin. `size / segments` is the vertex spacing.
- Color by rule in `color(x, y, z, up)`: blend to rock as `up` falls from 0.95 to 0.8 (slopes of 18° to 37°), forest tint by height, dry patches from fbm at 50-70 m. Multiply, do not replace: vertex colors tint the grass map.
- `uvTile` 6-9 m per texture repeat. Hide the repeat with `fadeTextureWithDistance(material, surface.average, near, far)`: near 40-90 m, far 220-450 m.
- Give the terrain material `polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2` and lay ribbons 2-3 cm above it, so roads never z-fight with the ground.

## Ribbons

`ribbonGeometry(frames, { from, to, y0, y1 })` makes every strip along a path. Ridgeline builds its road, lines, curbs and rails this way:

| Feature | `from` to `to` (m from center) | `y0`, `y1` | Options |
|---|---|---|---|
| Road surface | 4 strips across -W/2 to W/2 | 0.02 | `colorOf` darkens the racing line |
| Edge lines | 0.28-0.5 m inside each edge | 0.022 | Material with negative polygon offset |
| Center dashes | -0.1 to 0.1 | 0.022 | `skip: (i) => Math.floor(i / 4) % 2 === 1` |
| Curbs | W/2 to W/2 + 1.1 | 0.025 to 0.09 | `colorOf` per 2.2 m, `flatColor: true` |
| Guardrail | One offset for both | 0.48 to 0.82 | Posts as an `InstancedMesh` every 3 points |
| Trail | -1.2 to 1.2 | 0.01 | `vTile` 2.4 for a dirt texture |

## Scatter as instances

- One `InstancedMesh` per species and part (crown, trunk). `setMatrixAt` with `Matrix4.compose(position, yawQuaternion, scale)`, `setColorAt` with `hsv` for per-instance color, then set `count` to the number placed.
- An `InstancedMesh` culls as one bounding sphere over all its instances. A forest spread over a kilometer is never culled. Split scatter into 128-256 m cells, one instanced mesh per cell and species, to get frustum culling and per-cell LOD.
- `THREE.LOD` with `addLevel(object, distance, hysteresis)` suits single landmarks; use a hysteresis of 0.05-0.1 so the level does not flicker at the boundary. For instanced vegetation, keep a near mesh and a far mesh (cross quads or a merged low-poly crown) per cell and swap by cell distance.
- Shadows: trees and props cast; grass tufts do not.

## Chunks

- A chunk at origin `(ox, oz)`: pass `height: (x, z) => h(x + ox, z + oz)` and move the mesh to `(ox, 0, oz)`. Make the chunk size a multiple of `uvTile`, or the texture jumps at the seam.
- `heightfieldGeometry` computes normals from its own triangles, so neighbors disagree at the shared edge. Recompute edge normals from the height function by central differences over 1 m.
- Neighboring chunks at different LOD crack. Hang a skirt of 2-5 m below each edge, or snap the fine edge's odd vertices to the coarse edge's line.
- Build at most one chunk per frame. Free a chunk with `disposeObject3D(group, { keep: sharedMaterials })` from `@gamedna/kit/dispose`.

## Horizon

Keep the far ranges inside the stage's `far` (3000 m by default) and the sky radius. Distant land fades into `FogExp2` in the sky's horizon color.
