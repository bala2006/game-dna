# First-person action

## Player experience

Presence behind the eyes and aim that goes where the hand points. The player picks where to stand, what to shoot or use, and when to reload, retreat or push. Space must read at true human scale, because every wrong size shows at eye height.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Fixed tick, seeded spread and damage rolls | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/loop`, `@gamedna/kit/random` |
| Walk, sprint, crouch, jump; slopes and steps | gamedna-simulation | Core | `character-movement` | `@gamedna/kit/controller` |
| Capsule against walls, hitscan rays, projectiles | gamedna-simulation | Core | `collision-and-response` | `@gamedna/kit/collision` |
| Weapons or tools: fire, reload, ammo, health | gamedna-gameplay | Combat builds; a non-violent build swaps it for interaction verbs | `game-mechanics` | `@gamedna/kit/events`, `@gamedna/kit/inventory` |
| Enemy senses, cover use, attack turns | gamedna-gameplay | When enemies exist | `enemy-ai` | `@gamedna/kit/behavior`, `@gamedna/kit/nav`, `@gamedna/kit/steering` |
| Flow, checkpoints, saves | gamedna-gameplay | Core; saves with more than one level | `game-architecture` | `@gamedna/kit/fsm`, `@gamedna/kit/save` |
| Blockout at human scale, cover, sightlines | gamedna-world | Core | `level-design` | `@gamedna/kit/nav` |
| Terrain and building placement | gamedna-world | Outdoor maps | `world-generation` | `@gamedna/kit/world` |
| Hands or held item; enemy bodies | gamedna-motion | Hands are core; bodies only with enemies | `character-animation` | `@gamedna/kit/character` |
| Close-up materials, wear, light | gamedna-visual | Core | `art-direction`, `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Generated surfaces | gamedna-visual | No authored textures | `procedural-assets` | `@gamedna/kit/stage` |
| Pointer-lock look, gamepad, touch look | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input` |
| Eye camera, FOV slider, near plane | gamedna-interaction | Core | `camera-systems` | `@gamedna/kit/camera` |
| Recoil, hit markers, hit-stop | gamedna-experience | Combat builds | `game-feel` | `@gamedna/kit/feedback` |
| Reticle, ammo, health, prompts | gamedna-experience | Core | `hud-and-menus` | `@gamedna/kit/input` |
| Shots and footsteps placed in space | gamedna-experience | Core; positional sound matters once enemies exist | `audio-design` | `@gamedna/kit/loop` |
| Projectile and decal pools, draw calls | gamedna-performance | Core | `performance-budgets` | `@gamedna/kit/pool`, `@gamedna/kit/budget`, `@gamedna/kit/dispose` |
| Rule scenarios, device and clipping checks | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Spatial: meters, +y up. Eye height 1.6-1.7 m, capsule radius 0.3-0.35 m and height 1.8 m, crouched eye at 60 percent of standing.
- Scale table every level author uses: doors 2.1 by 0.9 m, ceilings 2.7-3 m, stair risers 0.17-0.18 m, cover 1.0-1.2 m high.
- 60 Hz. The view yaw and pitch from the last rendered frame enter the tick as input, so firing direction replays exactly.
- Hit model chosen once: hitscan or projectile per weapon, with damage, range and fire interval in the tuning file.
- Actions: `moveX`, `moveY`, `look`, `jump`, `sprint`, `crouch`, `interact`, `fire`, `aim`, `reload`, `pause`.
- Events: `shot`, `hit` with target and amount, `kill`, `reload`, `pickup`, `hurt`.
- Budgets: near plane 0.05 m in this view, 300 draw calls on a laptop GPU and 150 on a phone.

## Dependency order

1. Contracts and the scale table.
2. Movement with collision (simulation) and a grey-box level (world) in parallel; the blockout needs only the scale table.
3. Weapon and interaction rules once rays exist; enemies after the navigation grid built from the blockout.
4. Materials, lighting, hands, input and camera in parallel, each in its own files.
5. Feel, HUD and sound once events exist; then pooling and verification.

## Genre numbers

Starting points for a mid-paced shooter.

- Walk 1.4-2 m/s, run 4-6 m/s; crouch at 40-50 percent of walk.
- Vertical FOV 70-75 by default, with a slider. Mouse look near 0.0024 rad per pixel, no smoothing.
- Engagement distance 8-25 m indoors, 20-60 m outdoors; hitscan range capped at 80-120 m.
- Fire interval 80-150 ms for automatics, 400-800 ms for heavy single shots. Reload 1.5-2.5 s, magazines 8-30.
- Player health 100; regeneration, if any, starts 3-5 s after the last hit.
- Reticle 4-8 px; hit marker visible 100-150 ms.

## Acceptance

- Mouse look has no acceleration: equal pixel deltas give equal radians at 60 and 144 Hz frame pacing.
- A scripted walk into every wall and corner never lets geometry cross the near plane.
- Scenarios prove that no shot fires during reload and one ray damages a given target once.
- An enemy behind a wall never fires at the player; a line-of-sight scenario covers it.
- Keyboard and mouse, gamepad and touch each move, look, fire and interact in a browser test.
- Every landmark screenshot contains a door or a person for scale.

## Example

None in this repository; `apps/trail-walk` has a first-person view and pointer-lock look but no combat.
