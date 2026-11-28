---
name: level-design
description: Level layout, critical path, connectivity, reachability under the real movement rules, landmarks and sightlines, optional paths and secrets. Use when building or reviewing a level, track, map or arena. Not for terrain and generators (world-generation), teaching order (pacing-and-onboarding) or jump tuning (character-movement).
license: MIT
metadata:
  owner: world
  topics: level layout, critical path, level connectivity, reachability, landmarks and sightlines, optional paths and secrets
  engines: portable
  kit: kit/rooms, kit/nav, kit/controller, kit/world
---

# Level design

## Scope

Owns where things sit relative to each other and to the player's abilities: spawn, critical path, branches and loops, keys and locks, what is visible from each decision point, and what is optional. When the ground comes from a seed, use `world-generation`. When the question is teaching order or how waves ramp, use `pacing-and-onboarding`. When a jump feels wrong rather than being out of reach, use `character-movement`. When a vista needs a framed camera, use `camera-systems`.

## Decisions

- **Critical path as data.** List the nodes from spawn to goal (gates, keys, set pieces) and its play time at normal speed. Branches add at most a third of that.
- **Reach from the controller, with margin.** Measure apex and jump length with the real controller (`references/reachability.md`). Gaps at 60-80% of reach, ledges at most 80% of apex, so a jump taken a tick late still clears. Gravity Shift's tuning (jump 520 px/s, gravity 1500 px/s², 240 px/s) measures an apex of 86 px and a reach of 164 px: ledges of 2 tiles and gaps of 3-4 tiles at 32 px.
- **Keys before locks.** Every key is reachable with every lock it opens still closed. A lock graph with no cycle of mutual dependence cannot softlock.
- **Loops over dead ends.** A branch longer than about 15 s either rejoins the critical path or ends in a reward. Generated dungeons get this from `loops` 0.1-0.25.
- **Safe spawn.** No hazard or enemy within 1 s of travel, facing the first goal or along the path. Arena enemies spawn at a minimum distance (Neon Survivor: 200 px).
- **Landmarks.** One tall, unique shape every 10-20 s of travel: every 15-30 m walking, every 300-600 m in a car. A shape reads when it spans about 1° of view, so a 20 m tower reads to about 1.1 km.
- **Fog limits sightlines.** `FogExp2` halves contrast at 0.83 / density meters: about 1 km at 0.0008, 700 m at 0.0012. Landmarks beyond that need height or light.
- **Reveal, then hide.** Show the goal once from a high point or doorway, then hide it behind bends, rises and doors until the player commits.
- **Secrets have tells.** A crack, an off-path light or a trail of pickups visible from the critical path. A secret found only by touching every wall reads as a bug. Optional content never gates completion.

## Mistakes

- A level beatable before a movement tweak and not after: nobody reran its playthrough.
- Gaps at 100% of reach: they fail whenever input lands a tick late.
- A key behind its own lock on the only route: softlock.
- Grid search over standable tiles reported as proof: it holds only under the model's jump envelope. Say which check ran.
- Spawn facing a wall or the level edge.
- A landmark that only reads in clear weather, or one placed where the camera never looks.

## Reuse

- `@gamedna/kit/rooms`: `floodDistances(width, height, tiles, x, y)` gives walking steps on any tile grid; set lock tiles to `TILE.wall` in a copy to test key order. `generateDungeon` returns `start` and `end` farthest apart by walking distance, `distance`, `links` (tree first, then loops) and `doors`.
- `@gamedna/kit/nav`: `createGrid`, `findPath`, `losClear(grid, a, b)` for sightline checks on grids.
- `@gamedna/kit/controller`: `createPlatformerBody`, `stepPlatformer` to run a jump exactly in a test.
- `@gamedna/kit/world`: `pathFrames(points).at(s, side)` places checkpoints and markers along a route (Trail Walk markers).
- `apps/gravity-shift/src/game/levels.ts`: string-row levels with a legend, and lab rooms (`lab-flat`, `lab-spikes`) that scenarios load through `setup.level`. The game keeps its level data and what each gate means.

## Engines

Level structure is engine-independent data. Read `references/reachability.md` when proving that a gap, ledge or key order works.

## Verify

- One scenario per level replays a recorded input sequence to `levelComplete`. Rerun every playthrough after any movement or tuning change.
- Key-order test: flood fill with locks closed reaches each key; with all keys, it reaches the goal.
- Jump test: `stepPlatformer` from each designed takeoff clears the gap at full input, and again starting two ticks late.
- Sightline: `losClear` from each fork to the next landmark cell, or a screenshot at each decision point.
