# Strategy and tower defense

## Player experience

Planning under a clock. The player decides where to build, what to upgrade and when to spend or save, then watches the plan hold or break. Every outcome should trace back to a placement or purchase the player can see on the map.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Tick at 30-60 Hz, game speed as ticks per frame | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/loop`, `@gamedna/kit/random` |
| Range queries, projectiles, splash | gamedna-simulation | Core | `collision-and-response` | `@gamedna/kit/collision` |
| Build grid, placement and path-blocking rules | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/nav` |
| Income, costs, upgrades, refunds | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events` |
| Wave schedule, creep movement on a flow field | gamedna-gameplay | Core | `enemy-ai` | `@gamedna/kit/nav`, `@gamedna/kit/steering` |
| Tower targeting modes | gamedna-gameplay | Core | `enemy-ai` | `@gamedna/kit/behavior` |
| Opponent commander | gamedna-gameplay | Real-time strategy against AI only | `enemy-ai` | `@gamedna/kit/behavior`, `@gamedna/kit/fsm` |
| Map paths, build pads, choke points | gamedna-world | Core | `level-design` | `@gamedna/kit/nav` |
| Generated maps | gamedna-world | Random-map modes only | `world-generation` | `@gamedna/kit/world`, `@gamedna/kit/nav` |
| Tower tiers legible at a glance | gamedna-visual | Core | `art-direction`, `procedural-assets` | `@gamedna/assets` |
| Fog of war, range rings | gamedna-visual | Fog only in real-time strategy | `rendering-and-lighting` | `@gamedna/kit/stage` |
| Unit walk and attack cycles | gamedna-motion | 3D units | `character-animation` | `@gamedna/kit/character` |
| Pointer placement, drag select, pinch, pad cursor | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input`, `@gamedna/starter` |
| Pan, zoom, edge scroll | gamedna-interaction | Maps larger than one screen | `camera-systems` | `@gamedna/kit/camera` |
| Build menu, money, lives, wave timer | gamedna-experience | Core | `hud-and-menus` | `@gamedna/starter/phaser` |
| Hits, kills, leak warning | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Build-then-wave rhythm, tutorial waves | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Wave stingers, tower sounds by tier | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Hundreds of agents, pooled projectiles | gamedna-performance | Core | `performance-budgets` | `@gamedna/kit/pool`, `@gamedna/kit/budget` |
| Scripted players, path and money properties | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Grid: cell size (48-64 px in 2D, 2-4 m in 3D), map size in cells, and the cell kinds for path, build pad and blocked.
- Rate: 30 Hz when hundreds of agents move, otherwise 60 Hz. Speeds in cells per second; fast-forward runs more ticks per frame and never scales the step.
- Money as integers; costs, upgrade costs and refund share in the tuning file.
- Actions: `select`, `place`, `cancel`, `upgrade`, `sell`, `startWave`, `speed`, `pause`, plus pan and zoom.
- Events: `built`, `upgraded`, `sold`, `waveStart`, `waveClear`, `leak`, `kill`, `gameOver`, `victory`.
- Budgets: enemies alive, projectile pool size and simulation milliseconds per frame.

## Dependency order

1. Contracts: grid, money units, events.
2. Placement and path-validity rules (gameplay) while the map layout (world) is built.
3. Creep movement and waves (gameplay, after step 2 with the same owner); range queries and projectiles (simulation) alongside.
4. Towers, targeting and economy, then the first balance pass.
5. Art, camera, input and HUD in parallel; pooling once wave sizes are known; scripted-player runs last.

## Genre numbers

Starting points for a tower defense map; tune with scripted players.

- 20-30 s to build before wave 1, then 5-15 s between waves, with an early-start bonus.
- 20-40 waves per map, a boss every 5-10; enemy health growing 10-20 percent per wave.
- Starting money buys 2-3 basic towers; each wave pays roughly one more.
- Tower range 2.5-4 cells, fire interval 0.5-1.5 s, upgrades at 1.5-2 times the base cost, selling refunds 50-75 percent.
- 10-20 lives; a leak costs one, a boss more. Creeps walk 1-2 cells per second.
- Fast-forward at 2x and 3x. For real-time strategy, 20-60 units per side on a phone.

## Acceptance

- Any placement that would cut every route from spawn to goal is refused; a property test over random placements keeps a route open.
- A scripted player with a fixed build order clears wave 10 on 20 seeds, and a player who builds nothing loses by wave 3.
- One seed and command log give the same result at 1x and 3x speed.
- Money never goes negative, and refunds are exact integers.
- The largest wave holds p95 frame time on a phone profile; touch placement, upgrade and sell work with 48 px targets.

## Example

None in this repository.
