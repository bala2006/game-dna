# Style packs as Phaser 3.90 config

Each `StylePack` field maps to a Phaser setting. Read them from `getStylePack(id)` instead of retyping numbers.

## Rendering mode

| `rendering.mode` | Game config | Notes |
|---|---|---|
| `raster-pixel` | `pixelArt: true`, which also turns antialias off and `roundPixels` on | Draw at native size and scale by the integer `scale.pixelScale` (3 for `pixel-adventure`) through `zoom`, with `scale.mode: Phaser.Scale.NONE`. `FIT` scales by fractions and smears pixels |
| `vector-glow` | `antialias: true` | Glow comes from the generated SVG blur; add `preFX.addGlow` only to the player or a pickup. Sparks use `setBlendMode(Phaser.BlendModes.ADD)` |
| `vector-soft` | `antialias: true` | Soft shadows are part of the SVG; no extra FX |

## Depth layers

- Build 3-4 background layers that lighten and lose contrast toward the horizon. Give each `setScrollFactor` between 0.1 (farthest) and 0.6 (nearest background), and tint it toward the pack's `roles.background`.
- The play layer scrolls at 1. A foreground framing layer may scroll at 1.1-1.3, kept sparse so it never covers the avatar.
- `generateAsset({ type: 'background', params: { layers } })` already draws ridges that darken toward the viewer for `layered-minimal`.

## Value hierarchy in 2D

Background lightest (or darkest on `neon-arcade`), play surface in the middle, actors at the strongest contrast. If actors blend in, lower the background's alpha first, as Gravity Shift does with `setAlpha(0.7)`, before recoloring actors.

## Scale

- Tile and sprite sizes come from `scale.tilePx` and `scale.spritePx`. Keep sprites near their hitbox size and scale the image, never the hitbox, to fix visual size.
- Pixel sprites never rotate by arbitrary angles: rotation resamples pixels. Flip, or draw rotated frames.

## Motion and feedback

`motion.animationFps` sets sprite animation rates (8 for pixel, 30 to 60 for vector). `camera.shakeMaxPx` caps shake; `feedback.flash` picks tint, additive or none. Typography fields feed text styles: `fontFamily` from `typography.family` and `fontSize` from `typography.hudSizePx` plus `'px'`.
