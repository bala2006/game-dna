# Seeded palettes

Use this route when no style pack fits, or for 3D games, where the palette feeds materials and lights instead of pack-validated sprites.

## Derivation

```ts
// check: compile
import { createRng, deriveSeed } from '@gamedna/kit/random';

/** sRGB hex from hue in degrees and saturation and value in 0-1. */
const hex = (h: number, s: number, v: number): string => {
  const f = (n: number) => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** Neutrals at the base hue, one focal accent opposite it, and place accents spread within 90 degrees of it. */
export function derivePalette(seed: number, places: number) {
  const rng = createRng(deriveSeed(seed, 'palette'));
  const base = rng.range(0, 360);
  return {
    base,
    neutrals: [0.1, 0.22, 0.36, 0.52, 0.7, 0.88].map((v) => hex(base, rng.range(0.04, 0.12), v)),
    focal: hex(base + rng.range(150, 210), 0.8, 0.95),
    places: Array.from({ length: places }, (_, i) => hex(base - 90 + ((i + 0.5) * 180) / places, 0.5, 0.75)),
  };
}
```

## Rules the derivation encodes

- Neutrals share the base hue at saturation 0.04-0.12 and carry most of the screen.
- The focal accent sits 150-210° from the base hue. Spend it on the player or the next goal only.
- Place accents spread within ±90° of the base. Up to four places stay 45° apart and at least 80° from the focal accent. Beyond four, vary value instead of hue.
- Choose state colors by hand, at least 30° from every place accent.
- Give each place one large field of its accent (a floor, a wall run, door frames) and repeat it in small doses on signs and screens.

## Choosing

Record the seed in the look sheet. Render one scene with each of two or three seeds and let the user pick. A palette is a decision, so the choice is theirs.

## In engines

In three.js, pass palette hex strings to `new THREE.Color('#rrggbb')` or build colors with `hsv`, both of which convert sRGB to the linear working space. In Phaser, convert with `Phaser.Display.Color.HexStringToColor(hex).color` for tints.
