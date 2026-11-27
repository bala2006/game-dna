# Procedural textures and meshes in three.js 0.170

## Surfaces from one sample function

`proceduralSurface({ size, sample, normalStrength })` calls `sample(x, y, u, v)` once per pixel and builds a color map (sRGB), a roughness map and a normal map (both linear) plus `average`, the mean color for distance fades.

```ts
// check: compile
import * as THREE from 'three';
import { createNoise } from '@gamedna/kit/random';
import { proceduralSurface } from '@gamedna/kit/stage';

export function concreteMaterial(seed: number, metersPerRepeat = 4): THREE.MeshStandardMaterial {
  const noise = createNoise(seed);
  const s = proceduralSurface({ size: 512, normalStrength: 1.8, sample: (x, y, u, v) => {
    const grain = noise.hash(x, y, 3), stain = noise.fbm(u * 6, v * 6, 5, 4, 6), pits = noise.fbm(u * 48, v * 48, 9, 3, 48);
    const g = 0.55 + 0.08 * (stain - 0.5) + 0.03 * (grain - 0.5);
    return { h: 0.6 * pits + 0.4 * grain, r: g * 1.02, g, b: g * 0.97, rough: 0.86 + 0.08 * grain - 0.1 * stain };
  } });
  const material = new THREE.MeshStandardMaterial({ map: s.map, roughnessMap: s.roughnessMap, normalMap: s.normalMap });
  material.userData.metersPerRepeat = metersPerRepeat;
  return material;
}
```

- Layer frequencies the way real surfaces vary: a blotch term at 4-8 repeats per tile, a mid term at 16-24, and per-pixel grain from `noise.hash`. Ridgeline's asphalt adds sparse bright stones where the hash exceeds 0.94.
- Every `fbm` term passes `period` equal to its frequency multiplier, or the texture shows a seam at each repeat.
- Raise roughness in pits and grain and lower it on worn or wet spots; the roughness map does more for realism than the color map.
- `h` only shapes the normal map, at any scale. Too high a `normalStrength` crinkles the surface under low sun; check at a grazing angle.
- three.js expects normal maps with green pointing up (OpenGL convention). A map that looks lit from below has its green channel inverted: set `normalScale.y` negative.
- Set texture repeats from meters: on a mesh whose UVs span `L` meters, `repeat.set(L / metersPerRepeat, L / metersPerRepeat)` on all three maps. `heightfieldGeometry` and `ribbonGeometry` already write UVs in meters per `uvTile` or `vTile`.

## Canvas textures

`canvasTexture(width, height, draw, { srgb, anisotropy, repeat })` for decals, banners, signs, grass blades and soft particle sprites. It tags the result sRGB unless `srgb: false`. After drawing into the canvas again, set `texture.needsUpdate = true`.

## Geometry from code

- `LatheGeometry` for anything round in profile: tires, vases, trunks, lamp posts. `ExtrudeGeometry` from a `Shape` with a 1-3 cm bevel for signs and trim, so edges catch light. `TubeGeometry` along a curve for cables and pipes.
- `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` needs the same attributes on every input. Delete `uv` or `normal` from the odd ones first, as Ridgeline does before merging displaced icospheres.
- Organic shapes: weld with `mergeVertices`, then displace each vertex along its direction by 0.8-1.2 x fbm, then `computeVertexNormals()`.
- After editing positions by hand: `attributes.position.needsUpdate = true`, then `computeVertexNormals()` and `computeBoundingSphere()`, or the mesh is culled at its old bounds.
- One draw call per material: merge static props that share a material, and use `InstancedMesh` for repeats.

## Memory

| Map | Size | GPU memory with mipmaps |
|---|---|---|
| RGBA | 256 px | about 0.35 MB |
| RGBA | 512 px | about 1.4 MB |
| RGBA | 1024 px | about 5.6 MB |

Track generated textures and geometries with `createResourceTracker` from `@gamedna/kit/dispose` and dispose them with the level.
