---
name: procedural-assets
description: Generates and records art from code and seeds. Asset specs, 2D sprites, tiles, icons and backgrounds from style packs, procedural textures and geometry for three.js, validation and provenance. Use when a game needs art files or generated surfaces. Not for the look itself (art-direction) or lighting them (rendering-and-lighting).
license: MIT
metadata:
  owner: visual
  topics: procedural textures, procedural geometry, generated sprites and tiles, asset specifications, asset provenance
  engines: portable, three@0.170, phaser@3.90
  kit: assets, assets/node, kit/stage, kit/random
---

# Procedural assets

## Scope

Owns turning a spec and a seed into an asset: sprites, tiles, icons, backgrounds, particle definitions, procedural textures and meshes, the checks each must pass, and the provenance record that rebuilds it. When palette or shapes are undecided, use `art-direction`. When a surface needs lights or shaders, use `rendering-and-lighting`. When the asset is a body or a car, use `character-animation` or `vehicle-design`. When it is a sound effect, use `audio-design`.

## Decisions

- **The request is the spec.** `AssetRequest` holds type, style pack, seed, width, height and params. Decide size from the pack (`scale.tilePx` 16 or 32, `scale.spritePx` 12, 24 or 28), frames (1-8, sheet width = frame width x frames), pivot (feet for characters), and whether it needs transparency, before generating.
- **Sprite size matches the hitbox.** Scale the image to fit, never the hitbox. Record the draw scale next to the asset (Gravity Shift: `PLAYER_SCALE = 1.45` for a 24 x 30 sprite on a 20 x 26 body).
- **Seeds are the source.** The same request gives identical bytes. Explore by changing the seed, then commit the seed in a script (`apps/gravity-shift/scripts/generate-assets.ts`), never only the output file.
- **Provenance for every file.** `materializeAsset` writes `public/assets/generated/<id>.<ext>` and upserts `.gamedna/assets-manifest.json`: generator, version, seed, sha256, license, `createdWith`. Hand-authored SVG gets an entry too. No imported packs, no traced art.
- **Procedural textures**: `proceduralSurface` at 256-512 px, `normalStrength` 1.5-2.5. Sample tileable noise with `period` equal to the frequency multiplier, as in `fbm(u * 64, v * 64, ch, 3, 64)`, so edges meet. `sample` returns sRGB colors, since they land in an 8-bit canvas. A 512 px color, roughness and normal set takes about 4 MB of GPU memory: make it once per material and share it.
- **Procedural geometry** is built from layout data in meters. Merge static parts per material, bake height-based shading into vertex colors (Ridgeline's tree crowns go from 0.42-0.6 at the base to 1.08 at the top), weld with `mergeVertices` before displacing so seams stay closed, and recompute normals and bounds after.

## Mistakes

- A committed file whose seed was never recorded: nobody can regenerate or fix it.
- Non-tileable noise in a repeating texture: a seam every repeat.
- A roughness or normal map drawn with `canvasTexture` defaults: it is tagged sRGB. Pass `{ srgb: false }`.
- A pixel sprite scaled by a fraction, or sprites from two packs in one game.
- A generated file edited by hand without updating its manifest entry: the hash no longer matches.
- Textures generated per instance or per frame instead of once per material.

## Reuse

`@gamedna/assets`: `generateAsset` (`sprite` with `kind` player, enemy or pickup and `frames`; `tile` solid, hazard or platform; `background` with `layers` 1-6; `icon` key, heart, star or exit; `particles`; `sfx`), `validateAsset`, `STYLE_PACKS`, `getStylePack`, `ASSET_TYPES`, `fileExtension`, `GENERATOR_VERSION`. `@gamedna/assets/node`: `materializeAsset`, `readManifest`, `assetBytes`, `assetHash`, `encodePng`, `MANIFEST_FILE`. `@gamedna/kit/stage`: `proceduralSurface`, `canvasTexture`, `hsv`. `@gamedna/kit/random`: `createNoise`, `createRng`, `deriveSeed`.

```ts
// check: compile
import { generateAsset, validateAsset, type AssetRequest } from '@gamedna/assets';

const request: AssetRequest = { type: 'sprite', styleId: 'pixel-adventure', seed: 31, width: 48, height: 12, params: { kind: 'player', frames: 4 } };
const failed = validateAsset(generateAsset(request), { width: 48, height: 12, frames: 4 }).filter((d) => d.status === 'failed');
if (failed.length) throw new Error(failed.map((d) => `${d.check}: ${d.fix ?? d.message}`).join('\n'));
```

## Engines

- three.js 0.170: read `references/three.md` when building textures with `proceduralSurface` or meshes from code.
- Phaser 3.90: read `references/phaser.md` when loading generated files or making textures at runtime.

## Verify

- Generating the same request twice gives the same `assetHash`; each manifest `sha256` equals the hash of the file on disk.
- The generate script exits non-zero on any `failed` diagnostic.
- Tileability: `fbm(x, y, c, o, p)` matches `fbm(x + p, y, c, o, p)` to 1e-12; a 2 x 2 repeat screenshot shows no seam.
- Textured surfaces captured at 2, 20 and 200 m show no visible repeat.
