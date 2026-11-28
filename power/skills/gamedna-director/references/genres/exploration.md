# Exploration

## Player experience

Curiosity paid off at a walking pace. The player decides where to go next from what the land shows: a roof above the trees, a path bending out of sight, a light at dusk. Failure carries little or no penalty; getting lost briefly is part of it, staying lost is a defect.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Fixed tick, seeded world | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/loop`, `@gamedna/kit/random` |
| On-foot movement, sprint, small hop | gamedna-simulation | Core | `character-movement` | `@gamedna/kit/controller` |
| Walker against houses, trees, parked cars | gamedna-simulation | Core | `collision-and-response` | `@gamedna/kit/collision` |
| Height field, paths, vegetation scatter | gamedna-world | Core | `world-generation` | `@gamedna/kit/world` |
| Points of interest, loops, reveal moments | gamedna-world | Core | `level-design` | `@gamedna/kit/world`, `@gamedna/kit/nav` |
| Chunk streaming and terrain detail levels | gamedna-world | Maps beyond about 1 km across | `world-generation`, `performance-budgets` | `@gamedna/kit/world` |
| Collectibles, journal, objectives | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events`, `@gamedna/kit/inventory` |
| NPC conversations | gamedna-gameplay | Characters who speak | `game-mechanics` | `@gamedna/kit/events` |
| Saved discoveries | gamedna-gameplay | Sessions over about 15 minutes | `game-architecture` | `@gamedna/kit/save` |
| Walker body and ambient people | gamedna-motion | A visible body or a lived-in place | `character-animation` | `@gamedna/kit/character` |
| Parked or drivable vehicles | gamedna-motion | Set dressing; driving adds `vehicle-dynamics` | `vehicle-design` | `@gamedna/kit/vehicle` |
| Time of day, sky, fog, ground materials | gamedna-visual | Core | `art-direction`, `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Generated bark, rock and ground surfaces | gamedna-visual | No authored textures | `procedural-assets` | `@gamedna/kit/stage` |
| Move, look, interact on every device | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input` |
| Shoulder and eye views with a switch | gamedna-interaction | Core | `camera-systems` | `@gamedna/kit/camera` |
| Guidance ladder, environmental storytelling | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Ambient beds and music layers by area | gamedna-experience | Core | `audio-design` | `@gamedna/kit/random` |
| Minimal HUD: count, prompt, compass if needed | gamedna-experience | Core | `hud-and-menus` | `@gamedna/kit/input` |
| Instanced scatter, culling by chunk | gamedna-performance | Core | `performance-budgets` | `@gamedna/kit/budget`, `@gamedna/kit/dispose` |
| Reachability, route and determinism checks | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Meters, +y up, XZ ground. Walker 1.75 m, radius 0.3 m, interact reach about 1.2 m; doors 2.0-2.1 m, storeys 3-3.5 m.
- One layout module holds height function, blockers and collectible points; simulation and scenery both take their data from it.
- A seed tree with one stream each for terrain, scatter, collectibles and ambient characters.
- World bounds, and chunk size (64-256 m) when streaming is in scope.
- Actions: `moveX`, `moveY`, `look`, `jump`, `sprint`, `interact`, `camera`, `pause`. Events: `collect`, `finish`, `jump`, `land`, `discover`.
- Budgets: 500 draw calls on a laptop GPU, with instance counts for each scatter kind.

## Dependency order

1. Contracts and the scale table.
2. The layout module (world): height field, paths, blockers, collectible spots. Almost everything else depends on it.
3. Movement and collision (simulation) against the layout, with look development (visual) alongside.
4. Collectibles and objectives (gameplay); scenery dressing, people, cameras and input in parallel.
5. Guidance, ambience and HUD; performance with full scatter in view; verification.

## Genre numbers

Starting values for a 15-30 minute session.

- Walk 1.4 m/s, jog 3 m/s, sprint 5.5 m/s; a small hop of about 0.7 m.
- Explorable area 300-600 m across; a new point of interest every 20-40 s of walking.
- Walked ground keeps a gentle slope, with hill amplitude near a tenth of its wavelength.
- Fog thin enough that the main landmark stays readable from 300-700 m.
- 6-12 collectibles per area (Trail Walk has 8), each visible or signposted from the one before.
- Keep 10-15 m clear of scatter around spawn and every landmark.

## Acceptance

- From spawn, a nav-grid path reaches every collectible on foot.
- A scripted route collects everything and fires `finish` from a fixed seed.
- The same seed produces the same layout hash on every run.
- Over random input, the walker never ends a tick inside a building, tree or vehicle.
- Screenshots from spawn and from each landmark show the next goal, and p95 frame time holds while looking across the full scatter.

## Example

`apps/trail-walk`: a seeded valley walk with eight markers, built on the Kit in three.js 0.170.
