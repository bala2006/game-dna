# Realistic 3D route

Read this when a 3D game must look realistic. It adds numbers for materials, light and variation to the art direction sheet. Engine calls are in the three-js skill; scale is in the world-building skill.

A scene reads as real when four things hold: sizes match the real world, every material reflects light within physical limits, one sun and one sky light everything, and nothing repeats exactly.

## Materials

Base color values stay inside physical limits. No natural material is darker than about 30-50 or brighter than about 240 on the 0-255 sRGB scale. Fresh snow and white paint sit at the top. Charcoal and fresh asphalt sit at the bottom.

| Surface | Base color (sRGB, 0-1) | Roughness | Metalness |
|---|---|---|---|
| Asphalt | Value 0.26-0.34, nearly gray | 0.8-0.95; lower where tar bleeds | 0 |
| Road paint | Value 0.68-0.75 | 0.55-0.65 | 0 |
| Concrete | Value 0.5-0.65, slightly warm | 0.85-0.95 | 0 |
| Grass | Green 0.33-0.4, red 0.26-0.35, blue 0.14-0.18 | 0.9-1 | 0 |
| Conifer foliage | Hue 100-135, saturation 0.45-0.6, value 0.2-0.3 | 0.8-0.85 | 0 |
| Broadleaf foliage | Hue 70-105, saturation 0.5-0.65, value 0.28-0.4 | 0.8-0.85 | 0 |
| Bark | Hue 20-30, saturation 0.3-0.45, value 0.15-0.25 | 0.95 | 0 |
| Rock | Value 0.35-0.55, low saturation | 0.75-0.9 | 0 |
| Galvanized steel | Value 0.55-0.6, cool gray | 0.45-0.55 | 0.6-0.7 |
| Car paint | From the palette | 0.3 with a clearcoat | 0.4-0.5 |

- Metals are either metal or not: metalness 0 or 0.6-1. Values in between look like plastic.
- Foliage greens are darker and less saturated than they feel. Saturated, bright green grass is the most common sign of a fake scene.
- Roughness carries most of the realism. Give every surface a roughness map, even a noisy one.

## Light

| Setting | Midday | Low sun | Overcast |
|---|---|---|---|
| Sun elevation | 45-70° | 10-25° | No visible sun |
| Sun color | Near white, slightly warm | Warm orange-yellow | n/a |
| Sun intensity (three.js) | 3-3.5 | 2.5-3.2 | Under 1, soft shadows |
| Sky zenith to horizon | Deep blue to pale blue | Blue to warm haze | Light gray, small range |
| Environment intensity | 0.6-0.8 | 0.7-0.9 | 1-1.2 |

- Light the scene from one sky. Use the same sky for the background and the environment map, so reflections and shade match it.
- Shade is never black. It takes the sky color, which is cool when the sun is warm.
- Low sun gives long shadows that show the ground's shape. Prefer it for vistas.
- Exposure stays fixed per area. Change it only between areas, over 0.5-1 s (light-and-color skill).

## Atmosphere

- Fog color equals the sky's horizon color. Distance lowers contrast and pulls color toward the horizon.
- Far ranges are lighter and bluer than near hills. Near ground has the darkest values in the view.

## Variation at three scales

Nothing real repeats exactly. Vary every surface at three scales at once:

| Scale | Size | Tool |
|---|---|---|
| Macro | 40-120 m | Low-frequency noise in vertex color: dry patches, groves, worn lanes |
| Meso | 2-25 m | Mid-frequency noise: patches, stains, clumps |
| Micro | Under 2 m | Texture detail and normal maps |

- Every instance of a repeated object gets its own scale, rotation and color shift.
- Wear goes where use goes: a darker racing line, tire marks at corners, scuffs at doors, paths worn into grass.
- Contact grounds objects: shadows, a darker ring at the base of posts and trees, grass tufts where ground meets a wall.

## Why it looks fake

| Symptom | Fix |
|---|---|
| Plastic look | Add the sky environment map and roughness maps |
| Black shadows | Add environment light; check the environment intensity |
| Visible tiling | Vertex-color noise, a distance fade, and two texture scales |
| Objects float | Contact shadows and base darkening |
| Toy scale | Measure against a 1.75 m person and the world-building scale table |
| Flat horizon | Add far ranges, fog and a sky with clouds |
| Too saturated | Pull foliage and ground toward the table above; keep the saturation budget |
| Sharp, perfect edges | Bevel or round edges that catch light; vary heights |

## Measure

Measure screenshots as in the art-direction skill's Verify section. A realistic daylight scene built with these values measured 34-39% mean brightness and 7-9% average saturation. Choose and record your own band.

## Sources

- McDermott, *The PBR Guide* (Allegorithmic, 2018): base color limits, metalness rules.
- Akenine-Möller et al., *Real-Time Rendering* (4th edition, 2018): image-based lighting and tone mapping.
- Gurney, *Color and Light* (2010): atmospheric perspective, colored shade.
- Physically Based material database (physicallybased.info): reference reflectance values.
