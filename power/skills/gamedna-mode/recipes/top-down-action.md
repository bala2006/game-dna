# Recipe: top-down action

Arena, twin-stick, survivor or top-down adventure. 2D in Phaser by default; 3D with a fixed overhead camera also works.

| # | Step | Skill | Top-down specifics |
|---|---|---|---|
| 1 | Loop and rules | game-direction | Survive waves or clear rooms. Protect: invulnerable time after a hit; no spawn within a set radius of the player |
| 2 | Look | art-direction | Player, enemies and pickups differ in shape, not only color |
| 3 | Arenas and waves | level-design | One new enemy type per wave; a breather between waves |
| 4 | Controls | controls-and-input | WASD to move, mouse to aim, left button to fire, Space to dash; gamepad: left stick moves, right stick aims, RT fires; touch: left stick moves, right stick aims and fires |
| 5 | Camera | camera | Top-down view, look-ahead toward the aim direction (20-30% of the view), shake only on events |
| 6 | Movement | motion-and-physics | Grounded start and stop curves; dash as a commitment action with a cooldown |
| 7 | Hit feel | game-feel | Hit-stop 30-80 ms, knockback, flash |
| 8 | Systems | game-mechanics | Upgrades as choices between 2-3 options; a carry limit or risk shown before commitment |
| 9 | HUD and sound | feedback-and-ui | Health and wave in corners; one line per pickup; sound tiers by event size |
| 10 | Rhythm | pacing-and-guidance | Alternate peaks and valleys; raise one difficulty dimension per wave |
| 11 | Tests and options | playtesting or three-js, refinement | |

## Acceptance checks

- Scenarios prove the invulnerable window and the spawn radius.
- Aim works with mouse, right stick and the touch aim stick.
- A wave screenshot shows the player as the strongest contrast on screen.
