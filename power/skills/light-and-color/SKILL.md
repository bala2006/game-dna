---
name: light-and-color
description: Light and color that carry meaning. One focal point, lighting by room purpose, reserved state colors, place accents, threat tints and time of day. Use when players miss the important thing or areas blur together.
---

# Light and color

Emphasis is contrast. Eyes go first to motion, then to the strongest value contrast, then to saturated color. Spend those on what matters. The art-direction skill sets the brightness, contrast and saturation budgets for the whole game. The technical-art skill covers asset palettes and silhouettes. This skill covers how a scene is lit and colored.

## Rules

1. **One focal point per view.** The interaction point or the next goal gets the highest value contrast. Backgrounds stay low contrast.
2. **Light says what a space is for.** Pick an ambient level and hue per area type (table below) and keep it the same across the game.
3. **State colors are reserved.** Choose a few hues for danger, safe, reward and inactive. Do not use them as decoration anywhere else.
4. **Each place has an accent hue.** Players remember places by color. Neighboring areas use different accents.
5. **Threats read by value.** Put threats against a brighter background, or light them from behind, so the silhouette reads at distance.
6. **Transitions take time.** Moving between light levels eases brightness over 300-800 ms, like eyes adjusting.
7. **Depth fades.** Far layers have less contrast and shift toward the sky color.
8. **Long sessions drift.** Shift the light slowly with progress or session time to mark progress and vary the mood.

## Recipe: light by area type

| Area type | Ambient | Hue | Meaning |
|---|---|---|---|
| Public or safe | Bright, even | Neutral or warm | You may be here |
| Private or restricted | Dim, patchy pools | Neutral, cooler | You should not be here |
| Danger | Dim with strong accents | Shifted away from the game's base hue | Different rules apply |
| Rest or reward | Medium, warm pools | Warm | Breathe, collect, trade |

These are defaults. Keep whichever mapping the game picks consistent.

## Phaser implementation

- Dynamic light (WebGL): `this.lights.enable().setAmbientColor(0x303040)`, `sprite.setPipeline('Light2D')`, then `this.lights.addLight(x, y, radius, color, intensity)` for pools.
- Area tint without lights: a full-screen rectangle with `setBlendMode(Phaser.BlendModes.MULTIPLY)` whose alpha and color tween on area change.
- Focus: `cam.postFX.addVignette()` to darken edges around the focal point.
- Brightness transitions: tween the alpha of a black or white overlay when the player crosses an area boundary.
- Time of day: interpolate the background tint from the simulation tick, so replays match.

## Verify

- Value check: convert a checkpoint screenshot to grayscale with `ffmpeg -i shot.png -vf hue=s=0 gray.png`. The focal point must still stand out.
- Area brightness: `ffmpeg -i shot.png -vf signalstats,metadata=print:key=lavfi.signalstats.YAVG -f null -` prints mean luma. Compare area types; the order should match the table.
- Color is never the only cue. Check every state color against its paired shape, icon or text.
- Ask the user to compare 2-3 lighting variants through the refinement skill when the lighting values are tuning parameters.

## Sources

- Block, *The Visual Story* (2nd edition, 2008): contrast and affinity in value, color and space.
- Gurney, *Color and Light* (2010): value structure, atmospheric perspective, light temperature.
- Totten, *An Architectural Approach to Level Design* (2nd edition, 2019): light as wayfinding.
