# Look sheet for a photographic 3D game

A 3D scene reads as photographed when four things hold together: every size matches the real world, every surface stays inside physical reflectance, one sun and one sky light everything, and nothing repeats exactly. Material and light values live with the renderer settings; this sheet sets the look they must produce.

## Targets

| Row | Value |
|---|---|
| Key | Low grounded: mean brightness 30-40%, middle-80% spread 35-50% |
| Saturation | Average 6-10%, peak 40-70% on paint, signs and the player |
| Temperature | Warm sun, cool shade; the shade takes the sky's color |
| Distance | Far ranges lighter and bluer than near hills; nearest ground holds the darkest values |
| Detail | Variation at macro, meso and micro scale on every large surface |

## Natural colors as hue, saturation and value

Foliage and ground are darker and greyer than memory suggests. These are base colors before lighting, as `hsv(h, s, v)` arguments:

| Surface | Hue | Saturation | Value |
|---|---|---|---|
| Conifer needles | 100-135 | 0.45-0.6 | 0.2-0.3 |
| Broadleaf canopy | 70-105 | 0.5-0.65 | 0.28-0.4 |
| Bark | 20-30 | 0.3-0.45 | 0.15-0.25 |
| Meadow grass | 75-85 | 0.5-0.6 | 0.33-0.4 |
| Dry grass patches | 65-75 | 0.5-0.6 | 0.38-0.45 |
| Dirt trail | 30-35 | 0.35-0.4 | 0.4-0.47 |

Vary each instance's hue by ±15° and value by ±20%. Ridgeline Racer and Trail Walk use these ranges for their trees.

## Variation at three scales

| Scale | Size | Carried by |
|---|---|---|
| Macro | 40-120 m | Vertex color from low-frequency noise: dry patches, groves, worn lanes |
| Meso | 2-25 m | Mid-frequency noise: stains, clumps, rubber on a racing line |
| Micro | Under 2 m | Texture detail, normal and roughness maps |

- Every repeated object gets its own scale (0.75-1.5x), yaw and color shift.
- Wear goes where use goes: a darker racing line, tire marks at corners, scuffs at handles and doorways, paths worn into grass.
- Contact grounds objects: a darker ring at the base of posts and trees, tufts where ground meets a wall, a sunk trunk on a slope.

## Why it looks fake

| Symptom | Look fix |
|---|---|
| Plastic surfaces | Sky reflections and varied roughness on every surface |
| Black shadows | Shade lit by the sky, cool when the sun is warm |
| Visible tiling | Macro vertex color, a distance fade, two texture scales |
| Floating objects | Contact shadows and base darkening |
| Toy scale | Measure against a 1.75 m person, a 2.1 m door and a car |
| Flat horizon | Far ranges, fog in the horizon color, clouds |
| Candy colors | Pull foliage and ground into the table above |
| Perfect edges | Bevels that catch light; varied heights and spacing |

## Sources

- McDermott, *The PBR Guide* (Allegorithmic, 2018): reflectance limits.
- Gurney, *Color and Light* (2010): atmospheric perspective, colored shade.
- Physically Based material database (physicallybased.info).
