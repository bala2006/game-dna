---
name: art-direction
description: Sets a game's look before assets exist. Look sheet, brightness and saturation budgets, seeded palette and hue jobs, shape language, visual scale and consistency, look development. Use when a game looks generic, flat, fake or inconsistent. Not for lights and materials (rendering-and-lighting) or making files (procedural-assets).
license: MIT
metadata:
  owner: visual
  topics: art direction, shape language, color palette, visual scale, visual consistency, look development
  engines: portable, three@0.170, phaser@3.90
  kit: assets, kit/stage, kit/random, kit/character
---

# Art direction

## Scope

Owns the look as written decisions: value and saturation budgets, palette and what each hue means, shape language, scale and proportion system, material set, and the look-development loop that checks screenshots against them. When the question is light rigs, PBR values, shadows or post, use `rendering-and-lighting`. When the sheet must become sprites, tiles or textures, use `procedural-assets`. When building a specific body or car, use `character-animation` or `vehicle-design`. When the question is HUD layout and type, use `hud-and-menus`.

## Decisions

- **Look sheet first**, in the design doc, every row filled before assets: key, contrast, saturation, base temperature, hue jobs, shape per role, 4-6 materials, prop density per area type, one proportion style.
- **Budgets** (mean brightness, middle-80% spread, average and peak saturation): low grounded 25-40%, 35-50%, under 10%, 40-70%; low neon 10-25%, 20-40%, near 0, 80-100%; high soft 55-75%, 20-35%, 10-25%, 40-60%. Realistic daylight measured 34-39% mean and 7-9% average saturation. Neutrals cover most of the screen; the peak goes to the player, the next goal, place accents and states. Pure black and white stay small.
- **Palette** from a style pack (`getStylePack(id).roles`: background, surface, foreground, accent, accentAlt, hazard, pickup, ui, shadow) or from a seed (`references/palette.md`). State colors (danger, safe, reward, inactive) are reserved, never decoration, and each pairs with a shape or icon.
- **Value before hue.** The avatar and the next goal differ in value from their local background, so they hold up in grayscale. One focal point per view.
- **Shape language.** One primary shape per role: round reads friendly, angular dangerous, square stable. Silhouettes read at their smallest size: about 30 px tall in 2D, or at 50 m in 3D.
- **Visual scale.** 1 unit = 1 m. In 2D, pixels per meter = player sprite height / 1.75 (48 px gives 27 px/m), and tiles, doors and jumps follow. Stylized games may enlarge architecture by one factor everywhere (1.2-1.5x for third-person cameras), never below collision size. One head count per game from `PROPORTION_STYLES`.
- **Consistency.** One style pack, one pixel size at integer scale, texel density within 2x across neighboring surfaces, one outline rule, one light recipe per area type.
- **Originality.** Never sample colors, shapes or layouts from reference screenshots. Differ from each named reference in at least three of: key, base temperature, base hue, shape language, material set, type, HUD layout.

## Mistakes

- Bright, saturated green grass and foliage: the most common sign of a fake 3D scene.
- Saturation everywhere, so the peak is not several times the average and nothing leads the eye.
- Black shade, or large areas of pure white.
- Two proportion styles side by side, or pixel sprites at two pixel sizes.
- A state color reused as decoration, or state shown by hue alone.
- Judging the look in one scene, or under a different tone mapping than the game ships with.

## Reuse

`@gamedna/assets`: `STYLE_PACKS`, `getStylePack`, `STYLE_PACK_IDS`, `paletteSet`, `hexToRgb`. A pack also fixes `rendering.mode`, `scale`, `camera`, `motion.animationFps`, `feedback` and `typography`, and `validateAsset` fails off-palette colors. `@gamedna/kit/stage`: `hsv(h, s, v)` returns an sRGB-correct `THREE.Color`. `@gamedna/kit/random`: `createRng`, `deriveSeed`. `@gamedna/kit/character`: `PROPORTION_STYLES`. The game keeps its sheet.

## Engines

- three.js 0.170: read `references/three.md` when building a look-development scene, and `references/realistic-3d.md` when the target look is photographic.
- Phaser 3.90: read `references/phaser.md` when a style pack's rendering, scale and layering become game config.

## Verify

- Measure each area: `ffmpeg -i shot.png -vf signalstats,metadata=print -f null -`. Mean = (YAVG - 16) / 219, spread = (YHIGH - YLOW) / 219, saturation = SATAVG / 117 and SATMAX / 117. Each falls inside the sheet's band.
- Grayscale (`-vf hue=s=0`) and blur (`-vf gblur=sigma=8`): the avatar and next goal still stand out.
- `validateAsset` reports no palette failures.
- A scale shot: a 1.75 m person, a 2.1 m door and a car side by side.
