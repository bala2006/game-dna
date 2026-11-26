# Recipe: third-person action

A 3D character seen from behind, exploring, fighting or sneaking. Build with three.js on the GameDNA Kit; `apps/trail-walk` is a working example of steps 3 to 7 and 13.

| # | Step | Skill | Third-person specifics |
|---|---|---|---|
| 1 | Loop and rules | game-direction | Explore, overcome, collect, return. Protect: the player can always reach a checkpoint; falls deal damage only past a set height |
| 2 | Look | art-direction | Realistic or stylized route; the character reads by value against every area |
| 3 | World | world-building | Scale table first. Paths 2-4 m wide, doors 2.1 m, landmarks every 15-30 s of walking, natural boundaries |
| 4 | Character | character-design | Pick a proportion style; capsule radius 0.3 m, height 1.8 m; walk 1.4 m/s, run 5 m/s, gait phase from distance |
| 5 | Controls | controls-and-input | WASD to move relative to the camera, mouse look with pointer lock, Space to jump, Shift to sprint, E to interact; gamepad sticks; touch: floating move stick on the left, drag right half to look, action buttons on the right |
| 6 | Camera | camera | Over-shoulder orbit 3-4 m, pivot 1.5-1.6 m, collision pull-in, recenter behind the character after 2 s of movement without look input. Pass the camera yaw from the last frame into the tick with the other input, so movement is camera-relative and replays the same |
| 7 | Movement | motion-and-physics | Grounded curves, turn toward the move direction over 0.1-0.2 s, lean into turns |
| 8 | Jump and combat | game-feel | Jump arc, coyote time, hit-stop |
| 9 | Systems | game-mechanics | Pick one or two decision patterns per area |
| 10 | Light | light-and-color | Light codes area types; threats backlit |
| 11 | Guidance | pacing-and-guidance | Light, landmarks and signs before markers |
| 12 | HUD | feedback-and-ui | Prompts anchored at objects; states on persistent elements |
| 13 | Engine and checks | three-js | |

## Acceptance checks

- The camera never ends inside a wall: a scripted walk along a wall keeps the camera on the open side.
- Moving with no look input brings the camera behind the character within 3 s.
- Feet do not slide: during stance, a foot's world position moves less than 5 cm.
- Keyboard and mouse, gamepad and touch each move, look, jump and interact.
