---
name: enemy-ai
description: How enemies sense, decide and move. State machines, behavior trees, utility scoring, perception, pathfinding, flow fields, steering, waves and encounters. Use when enemies stack, jitter, cheat, get stuck or spawn unfairly. Not for damage rules (game-mechanics), contacts (collision-and-response) or room layout (level-design).
license: MIT
metadata:
  owner: gameplay
  topics: enemy behavior, behavior trees, utility ai, perception, pathfinding, steering behaviors, procedural encounters, wave spawning
  engines: portable, three@0.170, phaser@3.90
  kit: kit/behavior, kit/steering, kit/nav, kit/fsm, kit/random, kit/rooms, kit/collision
---

# Enemy AI

## Scope

Owns what enemies notice, how they choose, how they get there, and where they appear. For damage and health rules, use `game-mechanics`; for push-out against walls, use `collision-and-response`; for the rooms themselves, use `level-design`; for intensity across a session, use `pacing-and-onboarding`.

## Decisions

- **Pick the decision layer by size.** Up to four modes (idle, chase, attack, recover): a state machine. Five to fifteen prioritized behaviors: a behavior tree. Many options weighed on continuous inputs (health, distance, allies): utility scoring, which may pick the goal for a tree to carry out. Patterns and curve design are in `references/decision-making.md`.
- **Think slower than you move.** Decide every 6 to 15 ticks (100 to 250 ms), staggered by id (`(tick + id) % 10 === 0`); steer every tick. React after 150 to 400 ms; players need 200 to 300 ms.
- **Perception is earned.** View cone 90 to 120 degrees, line of sight through `losClear` on the nav grid, hearing radii from events (a shot 20 to 30 m, footsteps 3 to 5 m). Suspicion builds over 0.5 to 2 s before full alert; the last known position is searched for 3 to 10 s. No rule reads the player through walls.
- **Telegraph and take turns.** Melee windup 300 to 500 ms with a readable pose, a punish window of 300 to 800 ms after. Only 1 to 3 enemies hold an attack token; the rest circle at 3 to 6 m.
- **Hysteresis everywhere.** Enter attack at 1.5 m and leave at 2.0 m; give the current utility choice an inertia of 0.1 to 0.2.
- **Paths.** `findPath` per agent with no corner cutting and `maxExpansions` near 2000; repath when the target moves 1 to 2 cells or every 0.5 to 1 s, a few searches per tick at most; `smoothPath` removes stair-steps. Past about 20 agents on one target, one `flowField` per target change replaces their searches. Cells near the agent's diameter.
- **Steering.** `seek` between waypoints, `arrive` at the last (slow radius 1 to 3 body lengths), `separation` within 1.5 to 2 radii, `avoidObstacles` 0.5 to 1 s ahead, `combine` under a force cap, one `integrate` per tick. Cap `pursue` prediction at 0.5 to 1 s.
- **Spawns are fair and seeded.** At least 200 px or 8 to 12 m from the player, off screen or behind a 0.5 to 1 s marker, from a `deriveSeed(seed, 'spawns')` stream. Waves and budgets are in `references/encounters.md`.

## Mistakes

- A 20 ms spike every 30 ticks: every agent repaths on the same tick.
- Enemies stack into one sprite: no separation.
- Orbiting or jitter at the goal: `seek` without `arrive`.
- Chase and attack toggle every tick at the range boundary: no hysteresis.
- Utility always picks the first option: inputs not normalized with `range`, so every score clamps to 1.
- Enemies hug wall corners and snag: corner cutting enabled for agents with a radius.
- A tree rebuilt per agent per tick: running nodes lose their place. Build once, one `BtRun` per agent.

## Reuse

- `@gamedna/kit/behavior`: `selector`, `sequence`, `parallel`, `cooldown` and other decorators, `condition`, `action`, `createBtRun`, `tickTree`; `chooseByUtility(options, ctx, { inertia, current })` with `curves`.
- `@gamedna/kit/steering`: `seek`, `flee`, `arrive`, `pursue`, `evade`, seeded `wander`, `separation`, `avoidObstacles`, `combine`, `integrate`.
- `@gamedna/kit/nav`: `createGrid`, `setCost`, `findPath`, `smoothPath`, `losClear`, `flowField`.
- `@gamedna/kit/fsm`: `createStateMachine` for modes. `@gamedna/kit/collision`: `SpatialHash` for neighbor queries past about 50 agents.
- `@gamedna/kit/rooms`: `generateDungeon` rooms, `start`, `end` and `distance` place encounters.

The game keeps its enemy kinds, stats and spawn tables.

## Engines

- three.js 0.170: read `references/three.md` when agents move on the XZ plane or the nav grid comes from 3D layout data.
- Phaser 3.90: read `references/phaser.md` when the nav grid comes from a tilemap or paths need a debug overlay.

## Verify

- Same seed and inputs give the same spawns and paths (`assessReproducibility`).
- Over 100 seeds, no spawn lands closer than the minimum distance or inside a wall.
- `stateAlways` on the count of enemies holding attack tokens with `lte` the cap.
- An agent parked on the attack boundary changes mode at most once per second.
- Every path cell is walkable; `findPath` returns null exactly where the flow field distance is `Infinity`.
