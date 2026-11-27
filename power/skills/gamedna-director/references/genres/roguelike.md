# Roguelike

## Player experience

Every run is new, and death is final but teaches something. The player weighs risk against reward room by room: which door, which item, whether to fight now or slip past. A build should emerge from those choices rather than from a fixed path.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Root seed with one stream per consumer; replayable runs | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/random`, `@gamedna/kit/loop` |
| Real-time movement and contacts | gamedna-simulation | Real-time builds; turn-based grids step per action | `character-movement`, `collision-and-response` | `@gamedna/kit/controller`, `@gamedna/kit/collision` |
| Floor generation: rooms, corridors, loops | gamedna-world | Core | `world-generation` | `@gamedna/kit/rooms` |
| Start and end placement, key and lock order, secret rooms | gamedna-world | Core; locks only when floors gate progress | `level-design` | `@gamedna/kit/rooms`, `@gamedna/kit/nav` |
| Combat, items, inventory, loot tables | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/inventory`, `@gamedna/kit/random` |
| Enemy kinds, room budgets, bosses | gamedna-gameplay | Core | `enemy-ai` | `@gamedna/kit/behavior`, `@gamedna/kit/nav`, `@gamedna/kit/rooms` |
| Hub, run, death, results; unlocks kept between runs | gamedna-gameplay | Core; meta progression only with persistence | `game-architecture` | `@gamedna/kit/fsm`, `@gamedna/kit/save` |
| Generated tiles, sprites and item icons | gamedna-visual | Core | `art-direction`, `procedural-assets` | `@gamedna/assets` |
| Limited vision, torchlight, fog of war | gamedna-visual | Designs where sight is a resource | `rendering-and-lighting` | `@gamedna/kit/stage` |
| Walk cycles and creature motion | gamedna-motion | 3D or animated sprites | `character-animation` | `@gamedna/kit/character` |
| Move, attack, use item on every device | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input`, `@gamedna/starter` |
| Room-snapped or trailing view | gamedna-interaction | Core | `camera-systems` | `@gamedna/kit/camera` |
| Hits, pickups, rare-drop flourish | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Health, item slots, minimap, results screen | gamedna-experience | Core | `hud-and-menus` | `@gamedna/starter/phaser` |
| Depth difficulty curve, first-run teaching | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Sound per floor theme and event | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Agent counts and floor memory | gamedna-performance | Large floors or many agents | `performance-budgets` | `@gamedna/kit/pool` |
| Seed sweeps, replays, bot runs | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Seed tree: one root seed per run, with derived streams named `map`, `spawns`, `loot`, `combat` and `ai`. Seed plus input log reproduces the run.
- Turn model decided once: real-time at 60 Hz, or one player action per turn with enemies acting after it.
- Tile size 32 px in 2D, 2.5-3 m in 3D; floor size in tiles.
- Content as data tables: item ids, enemy ids, stats, drop weights. Derived stats are rebuilt from those tables, never patched.
- Events: `roomEnter`, `roomClear`, `pickup`, `equip`, `hurt`, `death`, `floorClear`, `runEnd`.
- Two save records with versions: meta progression always; a suspended run only if the design allows quitting mid-run.

## Dependency order

1. Contracts and the seed tree.
2. Floor generation (world) and core combat rules (gameplay) in parallel.
3. Encounters after both exist, since room budgets depend on distance from the start.
4. Items, loot and the run economy once combat stats are fixed; art, input and camera in parallel.
5. Meta progression and saves last, then feel, HUD and sound; seed sweeps and bot runs close it out.

## Genre numbers

Starting values for a browser roguelike.

- A full run takes 15-40 minutes; a first-time player dies within 5-10 minutes.
- 3-5 floors of 8-15 rooms each, a boss at the end of each floor or every third floor.
- Dungeon loops at 0.1-0.25 so routes branch without dead-end mazes.
- The start room holds no enemies; budgets climb with walking distance toward the end room.
- A choice of 2-3 items after each boss or treasure room, from a pool of 30-60; rarity weights near 60, 30 and 10 percent.
- A pity counter guarantees a good drop after about 10 dry chests.
- A meta unlock every 1-3 runs.

## Acceptance

- Over 200 seeds, every floor tile is reachable from the start, the end room is reachable, and no key sits behind its own lock.
- Three to five runs from one seed and input log end in the same state hash.
- A scripted greedy bot clears floor 1 on 50-80 percent of 100 seeds with starting gear.
- No encounter spawns within 3 tiles of the door the player enters by.
- Death clears run state but keeps unlocks; an older save version migrates and a newer one is refused.
- Drop rates across 10,000 seeded rolls land within one percentage point of the table.

## Example

None in this repository; `@gamedna/kit/rooms` provides seeded floors with reachability already tested.
