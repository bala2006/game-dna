# Ridgeline Racer contract

Typed facts (units, timestep, update order, actions, budgets, events) are in `src/contracts.ts`. This file holds what types cannot.

## Gameplay
- Core loop: three timed laps of a seeded ridge circuit; beat your own time.
- Rules: checkpoints must be passed in order; leaving the road is slowed by the barrier, never a reset; input is ignored during the countdown and while paused.
- Events: `notice` (HUD text), `hit` (barrier contact with power 0..1), `finish`.

## Visual
- Art direction: late-afternoon alpine road, warm sun from the west, cool shadow side.
- Shape language: smooth splines for road and terrain; boxy, readable car silhouettes at real proportions.
- Palette: asphalt greys, ochre grass, pine greens, one saturated paint color for the player car.
- Materials: matte terrain and road, clear-coat paint, emissive brake lights only.
- Effects intensity: smoke and skid marks scale with slip; no full-screen flashes.

## Integration
| Module | Owner | Reads | Writes |
|---|---|---|---|
| `src/sim.ts` | simulation | contracts, track | car and race state |
| `src/track.ts` | world | contracts, Kit world | track geometry data |
| `src/scenery.ts` | visual | track, Kit stage | scene graph only |
| `src/main.ts` | integration | everything | presentation only |
