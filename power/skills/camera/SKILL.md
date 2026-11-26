---
name: camera
description: Camera views in 2D and 3D. Chase, hood, cockpit, over-shoulder, first person, top-down and side, with smoothing, look-ahead, collision and switching. Use when adding or fixing a view, or when the player cannot see ahead.
---

# Camera

The camera shows what the player needs next, which is mostly ahead. It is presentation: it may use render delta and never feeds the simulation.

## Step 1: Pick the views

| View | Fits | Placement | Vertical FOV | Behavior |
|---|---|---|---|---|
| Chase | Driving, racing | 5.5-7 m behind, 1.8-2.4 m up, aim 3-5 m ahead | 60, widening to 72-76 at top speed | Lags the heading by 0.1-0.2 s; distance stays constant |
| Far chase | Overview while driving | 8-11 m behind, 2.8-3.5 m up | 55-68 | As chase, a little more lag |
| Hood | Speed sense | On the hood, 0.1-0.2 m above it | 64-76 | Rigid; no lag |
| Cockpit | Immersion in a vehicle | Driver's eye: belt line plus 0.22-0.3 m, 0.2 x width off center | 60-70 | Interior modeled; glass faint |
| Over-shoulder | Third-person action | Pivot 1.5-1.6 m up, 3-4 m back, 0.4-0.5 m to the right | 60-66 | Mouse or stick orbits; pulls in on collision |
| First person | Exploration, shooters | Eye at 0.936 x stature (1.6-1.7 m) | 72 by default, slider 60-100 | No roll; head mesh hidden; head bob off by default |
| Top-down | Arena, tactics | 15-25 m away at 50-65 degrees down | 40-50 | Fixed north; leads toward aim |
| Side | Platformers | Orthographic follow | n/a | Dead zone, look-ahead, snap vertically on landing |

Offer two or more views when the genre has them, such as chase and cockpit. One button cycles them (C, gamepad Y, a CAM touch button). Remember the player's last view.

## Step 2: Follow without jitter

- Smooth with a time constant: `k = 1 - Math.exp(-dt / tau)`, then `value += (goal - value) * k`. A fixed lerp per frame changes the feel with frame rate.
- For fast movers, smooth the heading angle and the offset, not the world position. Smoothing world position makes the distance grow with speed.
- Lead in the direction of travel or aim: `lead = clamp(velocity * 0.2-0.4 s, max 15-25% of the view)`. Smooth the lead more slowly than the follow.
- Interpolate the target between simulation ticks with the loop's `alpha` before the camera reads it.

| Use | Follow time constant |
|---|---|
| Precision platforming | 60-120 ms |
| Exploration on foot | 120-250 ms |
| Vehicles, by heading lag | 100-200 ms |

## Step 3: Look input

- Look offsets come from the mouse, the right stick or a touch drag (controls-and-input skill).
- Vehicle views recenter after 0.8-1.2 s without look input. Clamp cockpit look to about 110 degrees each side.
- Over-shoulder orbit recenters behind the character after about 2 s of movement without look input.
- First-person yaw is absolute: the character turns to face the camera.

## Step 4: Collision and clipping

- Cast from the pivot toward the camera. On a hit, move in to the hit minus 0.2 m at once, then ease back out over about 0.3 s.
- Keep the camera at least 0.35 m above the ground.
- Near plane: 0.25 m for outside views and 0.05 m only for cockpit and first person, set on view change. A small near plane everywhere wastes depth precision and makes distant ground flicker.

## Step 5: Switching

- Cut between first person and any outside view. A blend passes through the body.
- Blend between two outside views over 0.3-0.4 s, in the target's frame, so the blend does not lag behind a moving target.
- On entering an interior view, hide the head mesh and fade the glass. Restore both on leaving.
- 2D: blend presets (offset, zoom, time constant) over 300-800 ms when the control mode changes. Cut only on scene changes, behind a fade.

## Step 6: Framing per space (2D)

| Space | Zoom | Bounds |
|---|---|---|
| Open, fast | 0.8-0.9x, or zoom out with speed | World bounds |
| Tight interior | 1.1-1.3x | The room |
| Precise action | Push in 1.3-1.6x over 200-400 ms | Unchanged |
| One threat | Fit player and threat, with a zoom floor | World bounds |

Store zoom zones in level data. On a first reveal of a reward or threat, pan to it once and let input cancel the pan.

## Comfort

- A reduced-motion setting turns off shake, roll and zoom pulses and halves look-ahead.
- No camera roll in first person. Elsewhere keep roll under 3 degrees and optional.
- Keep the subject inside the center 60% of the view. Shake is for events, never for states (game-feel skill).

## Engines

- three.js: `@gamedna/kit/camera` has `VIEW_PRESETS` for every view above and `createCameraRig(camera, { views, ground, occlude, onChange })`. Call `rig.update(dt, target, look)` each frame with `target = { object, mountObject, mounts, velocity, speed, topSpeed }`. Mounts such as `eye` and `hood` come from `buildCar` and `buildHumanoid` (vehicle-design and character-design skills). The rig sets the near plane per view, and `update` returns the look yaw; pass that yaw into the next tick for camera-relative movement.
- Phaser: `startFollow` applies its lerp once per frame, so smooth `scrollX` and `scrollY` yourself in `update(time, delta)`. Use `setDeadzone`, `setBounds`, `zoomTo`, `pan`, `fadeOut` and `fadeIn`.

## Verify

- Screenshot every view at rest and at speed. Check the subject sits inside the center 60%, and nothing clips the near plane.
- Cycle views with a tap shorter than one tick; the view still changes.
- Push the look input, wait past the recenter time, and assert the camera returns behind the target.
- Phaser: start a session with `gd_start_session`, run a mode-change scenario with `screenshots: true` and `checkpoints` before, during and after.
- Offer smoothing and distance variants through the refinement skill.

## Sources

- Haigh-Hutchinson, *Real-Time Cameras* (2009): presets, transitions, collision.
- Keren, "Scroll Back: The Theory and Practice of Cameras in Side-Scrollers" (Gamasutra, 2015).
- Phaser 3 and three.js camera documentation.
