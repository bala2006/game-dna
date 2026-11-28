---
name: rendering-and-lighting
description: Renderer and color pipeline, PBR materials, light rigs, shadows, shaders, post-processing, fog, reflections and particles. Use when a scene looks plastic, washed out or too dark, shadows crawl, or everything glows. Not for palettes (art-direction), generated textures (procedural-assets) or frame cost (performance-budgets).
license: MIT
metadata:
  owner: visual
  topics: rendering setup, materials, physically based rendering, lighting, shadows, shaders, post-processing, atmosphere and fog, reflections, particles
  engines: portable, three@0.170, phaser@3.90
  kit: kit/stage, kit/world, kit/dispose, kit/pool
---

# Rendering and lighting

## Scope

Owns how a frame is produced: color pipeline, tone mapping, materials, the light rig, shadows, shaders, post-processing, fog, reflections and particle drawing. When the target brightness or palette is undecided, use `art-direction`. When a texture or mesh must be generated, use `procedural-assets`. When a pass, shadow map or particle count costs too much frame time, use `performance-budgets`. When the question is when a flash or shake fires, use `game-feel`.

## Decisions

- **Color pipeline.** Light in linear space, output sRGB. Only color maps (`map`, `emissiveMap`) are sRGB; normal, roughness, metalness, AO and height maps stay linear. With post-processing, tone mapping and sRGB conversion happen once, in the last pass.
- **One tone mapper per game**, chosen before colors are tuned: ACES Filmic for daylight (Kit default, exposure 0.95), AgX or Neutral when saturated colors must stay true. Exposure is fixed per area and eases over 0.5-1 s between areas.
- **One sun, one sky.** One shadow-casting directional light and an environment map made from the background sky. Sunlit to shaded luminance 3:1 to 6:1 in daylight; shade takes the sky's color. Sun elevation 45-70° flattens the land, 10-25° shows its shape. Presets per time of day are in `references/materials.md`.
- **Light says what a space is for.** Public areas bright and even, restricted areas dim with pools, danger dim with strong accents, rest areas warm. Every lit area shows its source.
- **Materials.** Metalness 0 or 0.6-1; values between read as plastic. Dielectric base colors within sRGB 30-240. Every large surface gets a roughness map, which carries more realism than color. Value tables are in `references/materials.md`.
- **Shadows.** Fit the box to the camera's near view: half size 30-60 m, texel = 2 x half size / map size (Kit: 55 m on 2048 px is 5.4 cm). Keep near texels at 5 cm or less, snap the box to whole texels, and add cascades only for shadows past 200 m.
- **Fog** in the sky's horizon color, `FogExp2` density 0.0006-0.0012 for views of 1-2 km.
- **Post.** Bloom only above an HDR threshold (Kit: 1.6, strength 0.22), so emissives and glints bloom and the sky does not. Vignette 0.2-0.35. MSAA from a 4-sample render target.
- **Particles** come from simulation events, pooled with a hard cap, `depthWrite: false`. Additive blending for sparks, fire and glows; normal blending for smoke and dust, which turn white when additive over a bright sky.
- **Reflections** from the environment map. A planar mirror renders the scene again, so allow one at most.

## Mistakes

- Normal or roughness maps tagged sRGB: bumps too strong, surfaces too glossy.
- Picker values as floats in `new THREE.Color(r, g, b)`: read as linear, so colors wash out.
- A pass after the output pass, or none: dark, banded or doubly tone-mapped frames.
- One shadow box over the whole map gives blurry blobs; an unsnapped box gives edges that crawl as the camera moves.
- Shadow acne: raise `normalBias` (0.02-0.05). Shadows detached from feet: lower `bias`.
- Bloom threshold under 1: the whole sky glows.
- Fog unlike the horizon color: terrain silhouettes against the sky.

## Reuse

`@gamedna/kit/stage`: `createStage` (ACES, soft shadows, sky shader, sky-lit environment, a sun that follows `render(dt, focus, ahead)`, fog, bloom, vignette, `quality: 'low'` without post, `dispose()`), `proceduralSurface`, `canvasTexture`, `hsv`. `@gamedna/kit/world`: `fadeTextureWithDistance`. `@gamedna/kit/pool`: `RingBuffer` for effect sprites. `@gamedna/kit/dispose`: `createResourceTracker`, `disposeObject3D`. `apps/ridgeline-racer/src/effects.ts` pools smoke, dust and skid marks. The game keeps its light presets and which events emit particles.

## Engines

- three.js 0.170: read `references/three.md` when setting color spaces, fitting shadows, writing shaders, ordering post passes or drawing particles.
- Phaser 3.90: read `references/phaser.md` when adding 2D lights, FX, blend modes or particle emitters.

## Verify

- A test walks every material: `map` and `emissiveMap` are `SRGBColorSpace`, no other map is.
- The shadow texel size computed from the stage settings is 5 cm or less.
- Lookdev screenshots land inside the art direction band.
- After a level unloads, `renderer.info.memory` returns to its baseline.
- A stress scenario keeps particle counts at or below the cap.
