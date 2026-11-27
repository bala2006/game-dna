# RPG

## Player experience

Growth the player authored. They choose a build, which quest to chase, what to say and whom to help, and the world remembers those choices. Numbers should rise in ways the player can predict and plan around.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Stats, derived stats, experience and levels | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events` |
| Combat, real-time or turn-based | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/random`, `@gamedna/kit/events` |
| Inventory and equipment slots | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/inventory` |
| Quests, dialogue graph, world flags | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events` |
| Shops, currency, crafting | gamedna-gameplay | Shops or crafting in scope | `game-mechanics` | `@gamedna/kit/inventory` |
| Content as data, saves with migrations | gamedna-gameplay | Core | `game-architecture` | `@gamedna/kit/save`, `@gamedna/kit/contracts` |
| Enemies; companions | gamedna-gameplay | Enemies core; companions only with a party | `enemy-ai` | `@gamedna/kit/behavior`, `@gamedna/kit/nav` |
| Tick, movement, collision | gamedna-simulation | Core for real-time; a turn-based map can move tile by tile | `fixed-step-simulation`, `character-movement`, `collision-and-response` | `@gamedna/kit/loop`, `@gamedna/kit/controller`, `@gamedna/kit/collision` |
| Overworld, towns, dungeons | gamedna-world | Core | `world-generation`, `level-design` | `@gamedna/kit/world`, `@gamedna/kit/rooms`, `@gamedna/kit/nav` |
| Hero and NPC bodies, idle and talk poses | gamedna-motion | Core in 3D; portraits can stand in for 2D | `character-animation` | `@gamedna/kit/character` |
| Look, palette per region | gamedna-visual | Core | `art-direction` | `@gamedna/assets` |
| Light and materials per region | gamedna-visual | 3D builds | `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Generated icons, tiles, portraits | gamedna-visual | No authored art | `procedural-assets` | `@gamedna/assets` |
| Menu navigation on every device | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input` |
| Exploration view and dialogue framing | gamedna-interaction | Core | `camera-systems` | `@gamedna/kit/camera` |
| Inventory, quest log, dialogue box, stat sheet | gamedna-experience | Core; the heaviest UI of any genre | `hud-and-menus` | `@gamedna/starter/phaser` |
| Quest guidance, first-hour teaching | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events`, `@gamedna/kit/save` |
| Combat hits, level-up moment | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Town and battle music, interface sounds | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Region streaming, memory | gamedna-performance | Large worlds or phones | `performance-budgets` | `@gamedna/kit/dispose`, `@gamedna/kit/budget` |
| Save, quest and balance checks | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Content ids as namespaced strings (`item.ironSword`, `quest.mill`, `flag.metSmith`), each defined once in a data file.
- Stat ids and the derived-stat order, fixed before any item is authored.
- Save schema version 1 listing what is saved (base stats, inventory, flags, quest steps, position) and what is rebuilt on load (derived stats).
- Events that quests listen to: `enemyKilled`, `itemGained`, `talkedTo`, `areaEntered`, `flagSet`, `questStep`, `levelUp`.
- Actions: move, `look`, `interact`, `attack`, `menu`, `inventory`, `confirm`, `cancel`, `pause`.
- Integer currency and integer experience.

## Dependency order

1. Contracts: ids, stats, save schema, events.
2. Stats, combat and inventory (gameplay) alongside movement and collision (simulation).
3. Quests and dialogue once events fire; towns and dungeons (world) in parallel.
4. Characters (motion), look (visual) and menus (experience) in parallel, each in its own files.
5. Saves once every saved field exists, with a migration test; then a balance pass and verification.

## Genre numbers

Starting values for a 1-3 hour web RPG.

- 10-15 levels; the first level-up within 5-10 minutes; experience per level growing 1.2-1.5 times.
- A main quest of 5-10 steps; one main objective always shown, up to three optional ones.
- 20-40 inventory slots or a weight limit, not both at first.
- Dialogue lines under about 120 characters, with 2-4 choices per node.
- Enemies in an area within two levels of the player's expected level.
- Autosave on every area change and every 5 minutes.

## Acceptance

- Save, reload and compare: the state hash matches; a version 0 save migrates, and a future version is refused.
- From a fresh save, a scripted run through quest events completes the main quest, and no reachable flag combination blocks it.
- After random equip and unequip sequences, derived stats equal a fresh recompute (property test).
- A 60-minute scripted economy run keeps gold inside the planned band.
- Every dialogue node is reachable and every `next` resolves; menus pass `auditTouchLayout` at phone size.

## Example

None in this repository.
