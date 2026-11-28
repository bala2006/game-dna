---
name: character-movement
description: Platformer and on-foot 3D controllers. Acceleration and stopping, jump height and arc, coyote time, jump buffering, slopes, steps and surface friction. Use when movement feels floaty, slippery, stiff or unfair. Not for walls and tunneling (collision-and-response), cars (vehicle-dynamics) or juice (game-feel).
license: MIT
metadata:
  owner: simulation
  topics: character controllers, platformer movement, ground movement, jump tuning, coyote time, jump buffering, slopes and steps, momentum and friction
  engines: portable, three@0.170, phaser@3.90
  kit: kit/controller, kit/collision, starter, core
---

# Character movement

## Scope

Owns how a controlled body speeds up, stops, turns, jumps, lands and follows the ground. When it passes through or snags on geometry, use `collision-and-response`; for deadzones and device mapping, use `input-and-controls`; for landing squash, dust and shake, use `game-feel`; when the arc changes with the tick rate, use `fixed-step-simulation`.

## Decisions

- **Tune times, derive rates.** `acceleration = top / timeToTop`, `deceleration = top / timeToStop`. Up and down times: precise 0.05 to 0.1 s and 0.04 to 0.08 s; most characters 0.15 to 0.3 s and 0.1 to 0.25 s; heavy 0.4 to 0.8 s and 0.3 to 0.6 s. Gravity Shift runs 240 px/s with 0.13 s and 0.11 s; Trail Walk jogs 3.0 and sprints 5.5 m/s with 0.2 s and 0.15 s. Stop time stays at or below start time; reversing uses the larger rate.
- **Jump from height and time.** For apex `H` and time to apex `T`: `gravity = 2H / T²`, `jumpVelocity = 2H / T`. Platformers start at 2 to 4 tiles in 0.3 to 0.45 s. Game gravity runs 1.5 to 3 times real: Trail Walk's 14.7 m/s² and 4.6 m/s give a 0.72 m hop. Jump cut 0.4 to 0.5 on early release. Cap fall speed near 1.4 times jump velocity and under half a tile per tick (720 px/s is 12 px at 60 Hz).
- **Air control** 0.6 to 0.9 of ground for platformers, 0.2 to 0.4 for 3D walkers.
- **Forgiveness in ticks.** Coyote 60 to 120 ms (4 to 8 ticks at 60 Hz), buffer 80 to 150 ms (5 to 9 ticks); Gravity Shift uses 5 and 6. Coyote starts only when the body walks off a ledge. Any deliberate take-off (jump, flip, dash, knockback) sets `launched` so none follows.
- **Grounded comes from contacts** (the resolver's bottom flag), never `vy === 0`, which is also true at the apex.
- **Slopes and steps in 3D.** Walkable up to 40 to 50 degrees, step-up 0.3 to 0.4 m for a 1.75 m human, snap down at most the step height, else become airborne. `stepGround` snaps to `height(x, z)` with none of these limits; `references/three.md` adds them.
- **Momentum and friction.** Surface multipliers on deceleration (ice 0.1 to 0.2) and top speed (mud 0.5 to 0.7). On a moving platform add its velocity while grounded and keep it on take-off. Clamp input length to 1 so diagonals are not 41 percent faster.

## Mistakes

- A second air jump from coyote time after a jump or flip. Gravity Shift's `fault.coyoteAfterJump` seeds exactly this.
- "I pressed jump and nothing happened": the press was checked only on its own tick, or the buffer counts frames.
- Releasing jump while falling slows the fall: cut only while rising.
- Walkers teleporting down cliffs or stuck on 2 cm bumps: no snap limit, or no step height.
- Position set from input times speed: cursor motion with no momentum.

## Reuse

`@gamedna/kit/controller`: `stepPlatformer(body, input, params, dt, isSolid, tileSize, out)` runs control, gravity, tile collision and settle; call `platformerControl`, `platformerGravity` and `platformerSettle` separately to insert an action, as Gravity Shift does for its flip. Set up with `createPlatformerBody` and `createPlatformerStep`. `stepGround(body, input, tuning, dt, height, collide, out)` moves a camera-relative walker with sprint, jump, snap and turn smoothing. Convert milliseconds with `msToTicks` from `@gamedna/starter`. The game keeps tuning, extra abilities and surfaces.

## Engines

- three.js 0.170: read `references/three.md` when wiring `stepGround` to a camera, a height field or step and slope limits.
- Phaser 3.90: read `references/phaser.md` when drawing a platformer body or reading solids from a tilemap.

## Verify

- `computeMetrics` from `@gamedna/core` on a jump scenario: `jump.apexHeight` within 6 px of `v²/2g`, `jump.timeToApex` near `T`.
- Mashing jump in the air: `eventCount` of `jump` with `extraAirJump: true` is 0, and the scenario fails with the seeded fault on.
- A jump `coyoteTicks - 1` ticks after leaving a ledge works and `coyoteTicks + 1` does not; a press `bufferTicks - 1` ticks before landing jumps on the landing tick.
- `run.stopDistance` stays near `top² / (2 · deceleration)`.
- 3D: a 0.3 m step climbs, a 0.5 m ledge blocks, a 1 m drop leaves `grounded` false for over one tick.
