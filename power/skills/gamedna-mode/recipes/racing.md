# Recipe: racing

Load each skill at its step. The numbers are starting points for an arcade-leaning circuit racer; record the values you choose in the tuning file. `apps/ridgeline-racer` is a working example of every step, built on the GameDNA Kit.

| # | Step | Skill | Racing specifics |
|---|---|---|---|
| 1 | Loop and rules | game-direction | Laps against the clock or rivals. Protect: a lap counts only after every checkpoint in order; reset never moves the car forward along the track |
| 2 | Look | art-direction | Realistic route: read its `references/realistic-3d.md` |
| 3 | Track and land | world-building | Centerline spline, 12-15 m wide road, 1-1.5 m curbs, barriers 5-8 m past the edge, terrain flat 5-10 m past the barriers, then blended over 3-6x the hill height, landmarks every 10-20 s of driving |
| 4 | Car | vehicle-design | Start from a preset. Expose `eye` and `hood` mounts for the camera |
| 5 | Controls | controls-and-input | Use its driving bindings and touch layout: floating steer stick on the left, gas and brake pedals on the right |
| 6 | Camera | camera | Views: chase, far chase, hood, cockpit. One button cycles them. Mouse or right-stick look recenters after about 1 s |
| 7 | Handling | motion-and-physics | Top speed 45-60 m/s, 0-100 km/h in 3-5 s, grip with a drift button, slower off the road, barriers push back and cost speed |
| 8 | HUD and sound | feedback-and-ui | Lap and time top left, best lap top right, speed and gear bottom center. Countdown, lap and finish notices. Engine pitch follows rpm |
| 9 | Finish | polish-and-detail | Skid marks and smoke from a `slip` event, rubbered racing line, brake lights, marshals or spectators for scale |
| 10 | Engine | three-js, or technical-art for 2D | |
| 11 | Options | refinement | Offer grip and camera variants |

## Acceptance checks

- An automatic driver, enabled by a URL flag or scenario, completes a lap. The lap counter advances only after all checkpoints.
- Each camera view has a reviewed screenshot at speed. No view clips through the car or the ground.
- Keyboard, gamepad and touch each accelerate, brake and steer. A tap shorter than one tick still changes the camera view.
- The car's measured length, width and height match its preset within 2%.
- Area screenshots fall inside the art-direction brightness and saturation band.
