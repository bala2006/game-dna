# Top-down survival

## Player experience

Pressure that builds until the screen fills, with the player always able to see every threat. Choices are positional and quick: where to stand, when to dash out, which upgrade to take between waves. A lost run should point at the decision that lost it.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Tick-based simulation, separate seed streams for spawns and loot | gamedna-simulation | Core | `fixed-step-simulation`, `phaser-starter` | `@gamedna/starter`, `@gamedna/kit/random` |
| Start and stop curves, dash | gamedna-simulation | Core | `character-movement` | `@gamedna/kit/controller` |
| Circle contacts, broad phase for crowds | gamedna-simulation | Core; the broad phase above about 50 bodies | `collision-and-response` | `@gamedna/kit/collision` |
| Health, invulnerable window, attack cooldown, score | gamedna-gameplay | Core | `game-mechanics` | `@gamedna/kit/events` |
| Waves, fair spawns, chasers and ranged kinds | gamedna-gameplay | Core | `enemy-ai` | `@gamedna/kit/steering`, `@gamedna/kit/nav`, `@gamedna/kit/behavior` |
| Level-up choices and pickups | gamedna-gameplay | Runs longer than about 5 minutes | `game-mechanics` | `@gamedna/kit/random`, `@gamedna/kit/inventory` |
| Run states: title, playing, game over, victory | gamedna-gameplay | Core | `game-architecture` | `@gamedna/kit/fsm` |
| Arena walls and obstacles | gamedna-world | Core | `level-design` | `@gamedna/kit/nav` |
| Scrolling map beyond one screen | gamedna-world | Large maps only; a single arena drops it | `world-generation` | `@gamedna/kit/world`, `@gamedna/kit/nav` |
| Shape-coded player, enemies and pickups | gamedna-visual | Core | `art-direction`, `procedural-assets` | `@gamedna/assets` |
| Hit sparks and death bursts | gamedna-visual | Core; capped on phones | `rendering-and-lighting` | `@gamedna/kit/pool` |
| Move stick plus aim stick or mouse aim | gamedna-interaction | Core | `input-and-controls` | `@gamedna/starter`, `@gamedna/kit/input` |
| Overhead view with aim look-ahead | gamedna-interaction | Arenas larger than the screen or 3D | `camera-systems` | `@gamedna/kit/camera` |
| Hit-stop, flash, knockback, event shake | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback`, `@gamedna/starter/phaser` |
| Health and wave corners, upgrade picker | gamedna-experience | Core | `hud-and-menus` | `@gamedna/starter/phaser` |
| Sound tiers by event size | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Peaks and calm between waves | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events` |
| Enemy cap, pooled bodies and particles | gamedna-performance | Core | `performance-budgets` | `@gamedna/kit/pool`, `@gamedna/kit/budget` |
| Rule scenarios, spawn properties, bot runs | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Units chosen once: pixels in a 960 by 540 arena for 2D, or meters under a fixed overhead camera for 3D.
- 60 Hz; invulnerability, cooldowns, spawn gaps and wave calm counted in ticks.
- Actions: `moveX`, `moveY`, `aimX`, `aimY`, `attack`, `dash`, `pause`, `restart`.
- Events: `attack`, `hit`, `kill`, `hurt`, `pickup`, `waveStart`, `waveClear`, `gameOver`, `victory`.
- Caps: enemies alive at once, projectile pool size and particle count, all written as budgets.
- Protected rules with ids: one damage per invulnerable window, one attack per cooldown, a kill scores once, health never below zero, restart clears the run.

## Dependency order

1. Contracts and arena size.
2. Movement and contacts (simulation), arena layout (world) and sprite generation (visual) in parallel.
3. Combat rules, then waves and enemy behavior; both sit with the gameplay owner, so they run in sequence.
4. Input and camera while step 3 runs.
5. Feel, HUD and sound once events fire; pooling once real enemy counts are known; bot runs and scenarios close it out.

## Genre numbers

Starting points; Neon Survivor values in parentheses.

- Player speed 220-280 px/s in a 960 by 540 arena (260), reaching it in about 0.1 s.
- Attack cooldown 250-400 ms (320); invulnerability after a hit 0.5-1 s (700 ms); 3-5 hits of player health (5).
- Hit-stop 30-80 ms (40), flash about 80 ms, shake 2-6 px on large events only.
- Dash 0.15-0.25 s over 2-4 body lengths with a 1-2 s cooldown.
- Short arcade run: 5 waves of `3 + 2n` enemies. Survivor-style run: 10-20 minutes with a level-up roughly every 30-60 s, each offering 3 choices.
- No spawn closer than 200 px; 1.5-3 s of calm between waves; 40-80 enemies alive at most on phones.

## Acceptance

- Scenarios prove the invulnerable window, the cooldown under button mashing, single scoring per kill and the health floor.
- A property test over 200 seeds finds no spawn within 200 px of the player.
- A scripted kiting bot survives wave 3 with the shipped tuning on most seeds, while an idle player loses before the last wave.
- Aim works with the mouse, the right stick and the touch aim stick.
- A full wave holds p95 frame time on a phone profile, and its screenshot shows the player as the strongest contrast.

## Example

`apps/neon-survivor`: Phaser 3.90 on the starter, with Kit state machine and steering.
