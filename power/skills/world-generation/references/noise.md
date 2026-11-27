# Noise recipes for terrain and masks

The Kit's `createNoise(seed)` is value noise: random values on an integer lattice, blended with a smoothstep. `fbm(x, y, channel, octaves, period)` sums octaves with frequency doubling and amplitude halving, then normalizes to [0, 1).

## What fbm values look like

Measured over 200,000 samples of `fbm` from `@gamedna/kit/random`:

| Octaves | Mean | Std. dev. | 5th to 95th percentile |
|---|---|---|---|
| 1 | 0.50 | 0.215 | 0.14 to 0.85 |
| 3 | 0.50 | 0.141 | 0.27 to 0.73 |
| 5 | 0.50 | 0.128 | 0.29 to 0.71 |

More octaves narrow the spread. `createHeightField` maps 5-octave fbm to `(f - 0.45) * 2 * amplitude`, so heights sit mostly between -0.3 and +0.5 of `amplitude`, with the mean 0.1 x amplitude above zero. Set amplitude from the relief you want between valley and crest, about 0.8 x amplitude.

Mask coverage for a threshold `fbm > t`, 3 or 4 octaves: 0.40 covers 75%, 0.47 covers 58%, 0.50 covers 50%, 0.55 covers 37%, 0.60 covers 25%, 0.70 covers 7%.

## Steepness

With gain 0.5 and lacunarity 2, every octave adds the same maximum slope: amplitude halves while frequency doubles. Extra octaves add roughness at the feet, not only fine detail. Measured slopes of `createHeightField` heights:

| amplitude / scale | Example | Median | 95th percentile | 99th percentile |
|---|---|---|---|---|
| 0.10 | 7 m over 70 m | 6° | 13° | 15° |
| 0.14 | 30 m over 220 m | 8° | 17° | 21° |
| 0.18 | 38 m over 210 m | 11° | 22° | 27° |

## Recipes

- **Rolling land**: wavelength 150-300 m, amplitude 20-40 m, 5 octaves.
- **Walkable meadow**: wavelength 60-80 m, amplitude 5-8 m. For a smoother camera, call `noise.fbm` directly with 3 octaves.
- **Horizon ranges**: the `ranges` ring of `createHeightField`, inner 500-1000 m, outer about twice that, height 200-400 m, wavelength 300 m. Keep the outer edge inside the camera's far plane.
- **Ridged mountains**: per octave `r = 1 - |2v - 1|`, squared, and weighted by the previous octave's `r`. Crests become sharp lines and valleys stay rounded.
- **Domain warp**: offset the input by a second fbm at a quarter of the frequency, scaled by 30-80 m. Shapes lose the grid-aligned look of plain value noise.
- **Axis artifacts**: value noise shows rows and columns at low octave counts. Rotate each octave's input by an irrational angle (about 37°) when they show.
- **Terraces**: with `k = y / step`, use `step * (Math.floor(k) + smoothstep(0.4, 0.6, k - Math.floor(k)))` for rice fields and mesas.
- **Plateaus and basins**: shape the [0, 1) value with `Math.pow(f, k)` before scaling; k above 1 widens valleys, below 1 widens plateaus.

## Channels and seeds

Give every use its own `channel` (Ridgeline uses 21 for hills, 33 for ranges, 71 to 75 for ground color, 91 for the tree mask). Two uses on one channel correlate: forests appear only on hilltops.

## Three scales of variation

| Scale | Wavelength | Used for |
|---|---|---|
| Macro | 300-800 m | Biomes, forest versus open ground |
| Meso | 20-120 m | Groves, dry patches, rock outcrops |
| Micro | Under 20 m | Vertex color jitter, tufts, texture detail |

## Precision

Float32 positions lose millimeters at about 10 km from the origin, and vertex jitter shows past 20 km. Worlds that large need a floating origin: shift everything so the player stays near 0.
