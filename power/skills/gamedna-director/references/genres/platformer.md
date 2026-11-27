# Platformer

## Player experience

Exact, forgiving control over a body in the air. The player judges when to leave a ledge, how far to carry momentum and whether a pickup is worth the hazard beside it. Every death must look like the player's own misjudgment, and the retry must come back almost instantly.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Tick-based simulation, timers in ticks | gamedna-simulation | Core | `fixed-step-simulation`, `phaser-starter` | `@gamedna/starter`, `@gamedna/kit/loop` |
| Run, jump, coyote, buffer, jump cut | gamedna-simulation | Core | `character-movement` | `@gamedna/kit/controller` |
| Tile collision, one-way and moving platforms | gamedna-simulation | Core; moving platforms only if the levels use them | `collision-and-response` | `@gamedna/kit/collision` |
| Keys, exit, hazards, death and restart rules | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events` |
| Title, play, dead, cleared states; level progress | gamedna-gameplay | Core; saves past about five levels | `game-architecture` | `@gamedna/kit/fsm`, `@gamedna/kit/save` |
| Patrolling or chasing enemies | gamedna-gameplay | Levels with walkers; hazard-only designs drop it | `enemy-ai` | `@gamedna/kit/behavior` |
| Hand-built levels checked against measured reach | gamedna-world | Core | `level-design` | `@gamedna/kit/controller` |
| Generated level chunks | gamedna-world | Endless or procedural modes only | `world-generation` | `@gamedna/kit/random` |
| Style pack, tiles, sprites, background | gamedna-visual | Core | `art-direction`, `procedural-assets` | `@gamedna/assets` |
| Run cycle, squash, facing | gamedna-motion | Animated sprites; a single stylized sprite relies on squash alone | `character-animation` | None |
| Keys, pad and touch buttons | gamedna-interaction | Core | `input-and-controls` | `@gamedna/starter`, `@gamedna/kit/input` |
| Side camera: dead zone, look-ahead, landing snap | gamedna-interaction | Levels wider than one screen | `camera-systems` | None in 2D; Phaser camera |
| Landing squash, dust, death flash | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback`, `@gamedna/starter/phaser` |
| Keys and lives readout, pause, level select | gamedna-experience | Core | `hud-and-menus` | `@gamedna/starter/phaser` |
| Jump, land, pickup and death sounds | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Teach-test-twist order, retry speed | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Particle caps, level memory | gamedna-performance | Large particle counts or many loaded levels | `performance-budgets` | `@gamedna/kit/pool` |
| Rule scenarios, property tests, reach checks | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Tile size in pixels (Gravity Shift 32 px), and one tile treated as about 1 m so sizes from real life carry over. Player 1.5-2 tiles tall.
- 60 Hz with every timer stored as ticks: coyote, buffer, respawn delay, invulnerability.
- Gravity sign as state, when the design flips gravity.
- Level format: grid size (Gravity Shift 30 by 16) and the tile codes for solid, spike, key, exit and spawn.
- Actions: horizontal move axis, `jump`, `act`, `restart`, `pause`. Events: `jump`, `land`, `pickup`, `death`, `win`.
- Protected rules with ids: no midair jump without a granted ability; no input moves a dead player; restart restores the level; the exit opens only with every key held.

## Dependency order

1. Contracts and the level format.
2. Controller and tile collision with a tuning file, so apex height and jump distance can be measured.
3. Levels authored against those measured numbers (world); art and sprites (visual) in parallel, since they write only assets.
4. Rules and flow (gameplay); input and camera (interaction) at the same time in separate files.
5. Feel, HUD and sound once events fire; onboarding order after three or more levels exist; verification.

## Genre numbers

Starting values, tuned by playing.

- Jump height 2-4 tiles with 0.3-0.45 s to the apex; jump cut of 0.4-0.5 on early release.
- Run 6-9 tiles per second (Gravity Shift 240 px/s, 7.5 tiles/s), reaching it in 0.1-0.15 s.
- Coyote time 80-120 ms, jump buffer 100-150 ms (Gravity Shift 80 and 100 ms). Air control 0.6-0.9 of ground.
- Fall speed capped below half a tile per tick, so no tile is skipped.
- Back in control 0.5-1 s after a death (Gravity Shift 600 ms).
- A level takes 30-90 s on a first clear; a checkpoint every 20-40 s in longer levels.

## Acceptance

- One scenario per protected rule passes, and turning on its seeded fault makes exactly that scenario fail.
- A scripted input path reaches the exit of every level with the shipped tuning; a ledge above the measured apex fails the check.
- Measured jump height from the simulation lands within 2 percent of the tuning target.
- A jump tap shorter than one tick registers on keyboard, gamepad and touch.
- Screenshots at the target viewport show each hazard before the player reaches it.

## Example

`apps/gravity-shift`: Phaser 3.90 on the starter, with the Kit tile mover and platformer body.
