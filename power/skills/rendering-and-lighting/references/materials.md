# Material values and light presets

## Dielectrics

Base colors are sRGB values in 0-1, as passed through hex or `hsv`. Metalness 0 for all of these.

| Surface | Base color | Roughness | Notes |
|---|---|---|---|
| Fresh asphalt | Value 0.26-0.34, near grey | 0.8-0.95 | Lower where tar bleeds and along the racing line |
| Road paint | Value 0.68-0.75 | 0.55-0.65 | Normal map from the asphalt at a third of its strength |
| Concrete | Value 0.5-0.65, slightly warm | 0.85-0.95 | |
| Plaster | Hue 30-40, saturation 0.1-0.15, value 0.65-0.75 | 0.9 | |
| Grass | Green 0.33-0.4, red 0.26-0.35, blue 0.14-0.18 | 0.9-1 | |
| Foliage | Hue 70-135, saturation 0.45-0.65, value 0.2-0.4 | 0.8-0.85 | `alphaTest` 0.4-0.5 on cards |
| Bark | Hue 20-30, value 0.15-0.25 | 0.95 | |
| Rock | Value 0.35-0.55, low saturation | 0.75-0.9 | |
| Rubber | Value 0.07-0.1 | 0.9 | |
| Fresh snow | Value 0.9-0.94 | 0.6-0.8 | The upper limit for any dielectric |
| Charcoal | Value 0.16-0.22 | 0.9 | The lower limit |

## Metals

Metalness 1. The base color is the metal's reflectance, so it is bright.

| Metal | Base color (linear) | Roughness |
|---|---|---|
| Aluminum | 0.91, 0.92, 0.92 | 0.2-0.5 |
| Iron, steel | 0.56, 0.57, 0.58 | 0.3-0.6 |
| Chrome | 0.55, 0.56, 0.55 | 0.05-0.16 |
| Gold | 1.0, 0.71, 0.29 | 0.2-0.4 |
| Copper | 0.95, 0.64, 0.54 | 0.25-0.5 |

Galvanized or painted metal reads best at metalness 0.6-0.7 with roughness 0.45-0.55 (Ridgeline's guardrails). Pass linear triplets with `new THREE.Color().setRGB(r, g, b)`, which takes linear values.

## Light presets for `createStage`

| Option | Midday | Low sun | Overcast | Dusk |
|---|---|---|---|---|
| Sun elevation | 45-70° | 10-25° | High, hidden | 2-8° |
| `sunColor` | Near white, warm | Orange-yellow | n/a | Deep orange |
| `sunIntensity` | 3-3.5 | 2.5-3.2 | Under 1 | 1-1.8 |
| `environmentIntensity` | 0.6-0.8 | 0.7-0.9 | 1-1.2 | 0.4-0.6 |
| `cloudCover` | 0.3-0.7 | 0.5-1 | 1 | 0.6-1 |
| `fog` | 0.0006-0.0009 | 0.0008-0.0012 | 0.0012-0.002 | 0.001-0.0015 |
| `exposure` | 0.9-1.0 | 0.95-1.05 | 1.0-1.15 | 1.1-1.3 |

Zenith deep blue and horizon pale at midday; horizon warm haze at low sun; light grey with a small range when overcast. The sun's elevation is `asin(sunDirection.y)`.

## Sources

- McDermott, *The PBR Guide* (Allegorithmic, 2018).
- Physically Based material database (physicallybased.info): measured reflectance.
- Akenine-Möller et al., *Real-Time Rendering* (4th edition, 2018): image-based lighting, tone mapping.
