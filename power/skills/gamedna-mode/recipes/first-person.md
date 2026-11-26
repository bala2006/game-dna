# Recipe: first person

A 3D game seen through the character's eyes: exploration, puzzles or shooting. Build with three.js on the GameDNA Kit; `apps/trail-walk` has a working first-person view.

| # | Step | Skill | First-person specifics |
|---|---|---|---|
| 1 | Loop and rules | game-direction | Protect the rules the genre depends on, such as no shot fires during reload |
| 2 | Look | art-direction | Close surfaces fill the screen: materials and wear matter more than in other views |
| 3 | World | world-building | Scale table is strict here: eye 1.6-1.7 m, doors 2.1 m, ceilings 2.7-3 m, stair risers 0.17-0.18 m. Wrong sizes are obvious from the eye |
| 4 | Body | character-design | Use the layout for eye height and capsule. The rig's `mounts.eye` places the camera; `setFirstPersonView` hides the head. Show hands or a held item |
| 5 | Controls | controls-and-input | WASD, mouse look with pointer lock, Space to jump, Shift to sprint, C or Ctrl to crouch, E to interact, left and right mouse buttons for actions; gamepad sticks; touch: move stick left, drag right half to look, buttons right |
| 6 | Camera | camera | First-person view: vertical FOV 70-75 by default with a 60-100 slider, no roll, head bob off by default |
| 7 | Movement | motion-and-physics | Walk 1.4-2 m/s, run 4-6 m/s, crouch eye at 60% of standing eye |
| 8 | Feedback | feedback-and-ui, game-feel | Center stays clear except a small reticle; hit and pickup feedback at the reticle |
| 9 | Light | light-and-color | Interaction points get the highest value contrast |
| 10 | Engine and checks | three-js | Near plane 0.05 m in this view |

## Acceptance checks

- Mouse look has no acceleration and no smoothing; one sensitivity setting maps pixels to radians.
- No surface clips the near plane when the player walks into walls and corners.
- A screenshot at each landmark shows a door or a person for scale.
- Every input device moves, looks and interacts.
