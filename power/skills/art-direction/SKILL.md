---
name: art-direction
description: Set an original look with an art direction sheet, brightness and saturation budgets, seeded palette, shape language, materials and a realistic 3D route. Use when a game looks flat, fake, generic or too close to a reference.
---

# Art direction

A look holds together when every visual choice has one job and the jobs do not compete. Set the budgets first, then make assets. The technical-art skill generates and validates assets. The light-and-color skill sets what light and color mean in each space. This skill sets the overall look and keeps it original.

For a realistic 3D look, also read `references/realistic-3d.md` after Step 2. It gives material values, light settings and variation rules.

## Step 1: Write the art direction sheet

Add an "Art direction" section to `.kiro/specs/game/design.md`. Fill every row before you generate assets.

| Field | Decide | Example |
|---|---|---|
| Key | Low, mid or high, with a mean brightness band | Low, 25-40% |
| Contrast | Spread of the middle 80% of pixels, and where pure black and white may appear | 35-50%; light sources and UI text only |
| Saturation | Base level, accent peak, share of the screen allowed to be saturated | Muted base, accents on under a tenth of the screen |
| Temperature | Base temperature, and the opposite for shade, distance or threat | Cool base, warm light pools |
| Hue jobs | One hue each for the player, interactables, each place and each state | See Step 3 |
| Shape language | One primary shape per role | Player round, threats angular, safe props square |
| Materials | 4-6 surface reads the whole game uses | Gloss, matte, fabric, metal, glass |
| Density | Props per screen by area type | Open areas 4-8, worked rooms 12-20 |
| Type | One family, case rules, sizes | Caps for verbs, sentence case for sentences |
| HUD | One job per screen corner, and what may enter the center | Center: the active prompt only |

The examples are invented. Choose fresh values per game. Render 2-3 variants of the sheet and let the user choose through the refinement skill. Tools never pick.

## Step 2: Set the budgets

Pick one key and keep every scene inside it. These bands are starting points; measure your screenshots (Verify) and record the band you choose.

| Key | Mean brightness | Middle 80% spread | Saturation, average and peak |
|---|---|---|---|
| Low, grounded | 25-40% | 35-50% | Under 10%; peak 40-70% |
| Low, neon | 10-25% | 20-40% | Near 0; peak 80-100% |
| High, soft | 55-75% | 20-35% | 10-25%; peak 40-60% |

Brightness is a share of the full range. Saturation is a share of a pure primary.

- Most of the screen sits in a middle band of values. Pure black and pure white stay rare and small: light sources, glints, UI text. Rare extremes keep their pull.
- Most pixels are muted. Saturation goes to a few things: the player, the next interactable, a place accent and the state colors. The peak is several times the average.
- Temperature carries mood. Keep one base temperature and push shade, distance or threat toward the opposite.

## Step 3: Derive the palette; never sample one

Never pick colors, textures, shapes or layouts from screenshots or footage of any game, including your own references. Sampling a reference copies its look. Work from the sheet.

Style packs fix the colors of generated assets, and validation fails colors outside the pack. Choose a route:

- **Pack route.** Give each pack color one job in the sheet. Vary the look through key, layer tints, light colors and layer order.
- **Authored route.** Derive a new palette from a seed, author SVG by hand, and record each file in the manifest with `createdWith` (technical-art skill).

For the authored route, draw the palette from a seed so it is fresh and repeatable:

```ts
import { createRng, deriveSeed } from '@gamedna/core';

const hex = (h: number, s: number, v: number): string => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('');
};

export function derivePalette(seed: number, places: number) {
  const rng = createRng(deriveSeed(seed, 'palette'));
  const base = rng.range(0, 360);
  const at = (offset: number) => (base + offset + 360) % 360;
  return {
    neutrals: [0.1, 0.22, 0.36, 0.52, 0.7, 0.88].map((v) => hex(base, rng.range(0.04, 0.12), v)),
    focal: hex(at(rng.range(150, 210)), 0.8, 0.95),
    places: Array.from({ length: places }, (_, i) => hex(at(-90 + ((i + 0.5) * 180) / places), 0.5, 0.75)),
  };
}
```

- Neutrals share the base hue at low saturation and carry most of the screen.
- The focal accent sits opposite the base hue. Spend it on the player or the next goal.
- Place accents spread within 90° of the base hue. Up to four places stay 45° apart and at least 80° from the focal accent. Past four, vary value instead of hue.
- Choose state colors by hand, at least 30° from every place accent, and reserve them (light-and-color skill).
- Record the seed in the sheet. Generate 2-3 seeds, render one scene with each, and let the user choose.

## Step 4: Shape and silhouette

- One primary shape per role across characters, props and icons. Round reads friendly, angular reads dangerous, square reads stable.
- Pick one proportion system, such as realistic, heroic or compact, and keep every character in it.
- The avatar reads by value before color. Keep its value apart from the local background. When an area changes key, add a rim or outline instead of recoloring the avatar.
- Layer gear and load onto the silhouette (polish-and-detail skill).

## Step 5: Materials and wear

In 2D, a material is a pattern of value and highlight.

| Material | 2D read |
|---|---|
| Gloss | Sharp highlight, plus a faint flipped copy of nearby lights below it |
| Matte | Flat value, soft shading at the edges |
| Metal | Narrow bright highlight, dark core, high local contrast |
| Fabric | Low contrast, soft noise, no highlight |
| Glass | Thin bright edges; the scene behind shows at lower contrast |

- Use most of the material set in every area, so surfaces do not read as one plastic.
- Wear goes where use goes: scuffs at handles and along walked paths, stains near work surfaces, debris at edges. Even wear everywhere reads as noise.

## Step 6: Visible light sources

- Every lit area shows its source: a lamp, a window, a screen or a sign. Light without a source looks fake.
- Give each major room one hero fixture that draws the eye and names the room.
- Interiors get many soft pools. Exteriors get one hard key light with crisp shadows, and shade pushed toward the opposite temperature.
- Phaser: put `this.lights.addLight` at each lamp sprite, add a glow sprite with `setBlendMode(Phaser.BlendModes.ADD)`, and use `postFX.addBloom()` on the source sprite only.

## Step 7: Dressing and composition

- Dress by function. A room's props answer "what is done here". Add one detail that tells who uses it (polish-and-detail skill).
- Dress every band the camera sees, including the top band: ceiling, canopy or sky masses. An empty top band looks unfinished.
- Give each place one large field of its accent hue, such as a floor, a wall run or door frames, and repeat it in small doses on signs and screens. Keep the rest neutral.
- Leading lines converge on the goal: floor patterns, edges, rows of lights, lanes.
- Frame the subject with doorways, pillars, arches or a band of shade.
- Place the avatar in the lower middle of the view. Put the horizon near the upper third in outward views.
- Use at least three depth layers: foreground framing, the play layer and the background. Far layers lose contrast and shift toward the sky color. In Phaser, give each layer its own `setScrollFactor` and tint.

## Step 8: UI look

- One type family and at most two weights. Use system fonts (technical-art skill).
- Caps for short labels and verbs. Sentence case for sentences and directions.
- World prompts are text with a soft dark shadow and no panel, so the world stays visible. Cards, such as guidance, place names and dialogue choices, get a solid dark panel.
- Color by function across the whole HUD: one hue for navigation, one for danger, one per meter, white for values. A function keeps its hue on every screen.
- One job per corner. Keep the center clear except for a small reticle or the active prompt.

## Verify

- Capture screenshots with `gd_observe` and `screenshot: true` in a browser session, or with `gd_run_scenario`, a `sessionId` and `screenshots: true` at scenario `checkpoints`. Files go to `.gamedna/evidence/screenshots/`.
- Measure a screenshot with ffmpeg, if it is installed: `ffmpeg -i shot.png -vf signalstats,metadata=print -f null -`.
  - Mean brightness = (`YAVG` - 16) / 219.
  - Middle 80% spread = (`YHIGH` - `YLOW`) / 219.
  - Saturation average and peak = `SATAVG` / 117 and `SATMAX` / 117. A pure red PNG measures 117.
- Put every area in one table. Each must fall inside the sheet's band.
- Squint test: `ffmpeg -i shot.png -vf gblur=sigma=8 blur.png`. The avatar and the next goal still stand out.
- Value test: the grayscale check in the light-and-color skill.

## Originality check

- [ ] No color, texture, shape or layout was sampled, traced or photographed from another game or its footage.
- [ ] The palette came from a recorded seed or was authored by hand.
- [ ] The look differs from each named reference in at least three of: key, base temperature, base hue, shape language, material set, type system, HUD layout.
- [ ] Every sign and line of text is original (polish-and-detail skill).
- [ ] Every asset is listed in `.gamedna/assets-manifest.json`.

## Sources

- Gurney, *Color and Light* (2010): gamut masks, value structure, color temperature.
- Block, *The Visual Story* (2nd edition, 2008): contrast and affinity, line, framing.
- Solarski, *Drawing Basics and Video Game Art* (2012): shape language in characters and worlds.
- Smith and Worch, "What Happened Here? Environmental Storytelling" (GDC, 2010).
- Butterick, *Practical Typography* (online): type hierarchy and case.
