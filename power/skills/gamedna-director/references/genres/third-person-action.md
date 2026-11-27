# Third-person action

## Player experience

A body the player enjoys steering through space, seen from just behind the shoulder. The player chooses an approach, reads an enemy's windup and commits to strike, dodge or slip past. The camera must never hide the threat or end up inside a wall.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Fixed tick with camera yaw as input | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/loop` |
| Camera-relative run, jump, dodge, ground snap | gamedna-simulation | Core | `character-movement` | `@gamedna/kit/controller` |
| Capsule against props, buildings and terrain | gamedna-simulation | Core | `collision-and-response` | `@gamedna/kit/collision` |
| Melee or ranged combat, health, stamina | gamedna-gameplay | Action builds; a stealth or walking build keeps health at most | `game-mechanics` | `@gamedna/kit/events` |
| Enemy telegraphs, attack turns, circling | gamedna-gameplay | Any fight | `enemy-ai` | `@gamedna/kit/behavior`, `@gamedna/kit/steering`, `@gamedna/kit/nav` |
| Checkpoints, respawn, saves | gamedna-gameplay | Core | `game-architecture` | `@gamedna/kit/save`, `@gamedna/kit/fsm` |
| Terrain, paths, scatter | gamedna-world | Outdoor spaces | `world-generation` | `@gamedna/kit/world` |
| Route, arenas, landmarks, checkpoint spots | gamedna-world | Core | `level-design` | `@gamedna/kit/nav` |
| Hero body, gait, planted feet, attack poses | gamedna-motion | Core | `character-animation` | `@gamedna/kit/character` |
| Look, light by area, threat silhouettes | gamedna-visual | Core | `art-direction`, `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Move, look, action buttons on every device | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input` |
| Orbit view with collision pull-in; lock-on | gamedna-interaction | Core; lock-on only with melee | `camera-systems` | `@gamedna/kit/camera` |
| Hit-stop, knockback, landing weight | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Health bar, prompts anchored at objects | gamedna-experience | Core | `hud-and-menus` | `@gamedna/kit/input` |
| Footsteps by surface, combat sound | gamedna-experience | Core | `audio-design` | `@gamedna/kit/random` |
| Guidance by light and landmark, area rhythm | gamedna-experience | Levels longer than a few minutes | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Shadow distance, scatter instancing | gamedna-performance | Outdoor spaces or phones | `performance-budgets` | `@gamedna/kit/budget`, `@gamedna/kit/dispose` |
| Camera, foot and combat checks | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Meters, +y up, +z forward. Hero 1.75-1.8 m with a 0.3 m capsule radius; the body layout fixes eye and shoulder heights for the camera.
- Paths 2-4 m wide, doors 2.1 m, narrow passages at least 1.5 m so the orbit view fits.
- 60 Hz. The last frame's camera yaw is part of the tick's input; the movement step alone writes hero position.
- Actions: `moveX`, `moveY`, `look`, `jump`, `sprint`, `interact`, `attack`, `dodge`, `lockOn`, `pause`.
- Events: `jump`, `land`, `attack`, `hit`, `dodge`, `hurt`, `checkpoint`.
- Combat timing in ticks for windup, active and recovery, stored with the tuning values.

## Dependency order

1. Contracts, including the body layout that sets capsule and eye sizes.
2. Movement with collision (simulation) alongside world layout (world) and the hero rig (motion).
3. Input and camera together, once movement accepts camera yaw.
4. Combat rules on the finished controller; enemies once rules and the nav grid exist.
5. Look, light and sound in parallel; feel and HUD after combat events fire; performance and verification last.

## Genre numbers

Starting values for an action adventure.

- Walk 1.4 m/s, jog about 3 m/s, run 5-5.5 m/s (Trail Walk jogs 3.0 and sprints 5.5).
- Facing turns toward the move direction over 0.1-0.2 s.
- Orbit distance 3-4 m (Kit shoulder view 3.4 m), pivot 1.5-1.6 m, shoulder offset about 0.45 m; recenter after about 2 s of movement without look input.
- Dodge 0.3-0.5 s with 0.15-0.25 s of invulnerability and a 0.5-1 s cooldown.
- Light attack 0.3-0.5 s from press to recovery, heavy 0.8-1.2 s.
- Falls hurt only above 4-6 m; a checkpoint every 2-5 minutes of play.
- A landmark every 15-30 s of walking.

## Acceptance

- A scripted walk along a wall keeps the camera on the open side for the whole run.
- Moving with no look input brings the camera behind the hero within 3 s.
- During stance a planted foot moves less than 5 cm in world space.
- A property test shows one swing damages each target at most once.
- From every walkable cell a path reaches a checkpoint.
- Keyboard and mouse, gamepad and touch each move, look, jump, attack and interact.

## Example

`apps/trail-walk` covers the orbit camera, camera-relative movement and planted-foot walking; combat has no example in this repository.
