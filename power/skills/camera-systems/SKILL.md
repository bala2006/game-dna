---
name: camera-systems
description: Chase, cockpit, first-person, third-person, top-down and side cameras with framing, smoothing, FOV and near plane per view, wall collision and view switching. Use when adding a view or when the camera jitters, clips, lags or hides what is ahead. Not for look input (input-and-controls) or impact shake (game-feel).
license: MIT
metadata:
  owner: interaction
  topics: camera framing, follow cameras, first-person cameras, third-person cameras, vehicle cameras, top-down and side cameras, camera collision, camera smoothing
  engines: portable, three@0.170, phaser@3.90
  kit: kit/camera, kit/random, kit/loop
---

# Camera systems

## Scope

Owns where the camera sits, what it frames, how it follows, avoids walls and switches views. When sensitivity or invert-Y is wrong, use `input-and-controls`. When the question is shake on impact, use `game-feel`. When an eye or hood mount is misplaced, use `vehicle-design` or `character-animation`.

## Decisions

- **Presentation only.** Update per rendered frame from `alpha`-interpolated state and never write rules state; the view yaw goes into the next tick for camera-relative movement, never into render-time facing.
- **Smooth with a time constant**, `k = 1 - exp(-dt / tau)`. A per-frame lerp of 0.1 is tau 158 ms at 60 Hz but 66 ms at 144 Hz. Starting taus: precision platforming 60 to 120 ms, on foot 120 to 250 ms, vehicle heading lag 100 to 200 ms, FOV 300 ms. Never smooth mouse look.
- **Vertical FOV** (three.js `fov` is vertical): 60 to 66 outside at rest, chase widening to 72 to 76 at top speed, first person 70 to 75 with a 60 to 100 slider. "90" from a player means horizontal, about 59 vertical at 16:9. On portrait phones widen vertical FOV until horizontal stays above about 50.
- **Near plane**: 0.25 m outside, 0.05 m in cockpit and first person, set on every switch; one tiny near plane makes distant terrain z-fight. Precision depends mostly on near, so raise it before lowering far.
- **Framing**: subject inside the central 60%. Look-ahead of 0.2 to 0.4 s of velocity, capped at 15 to 25% of the view, smoothed slower than the follow. Side views: dead zone 10 to 20% of the width, vertical follow on landing only.
- **Collision**: cast from the pivot toward the camera. On a hit, cut in to the hit minus 0.2 m at once, ease out over about 0.3 s, and fade the character inside about 0.5 m. Stay 0.35 m above terrain. Test simplified walls only, never props or foliage.
- **Recenter** vehicle views after 0.8 to 1.2 s without look input, orbit views after about 2 s of movement. **Switching**: cut into and out of mount views (a blend passes through the body); blend outside views over 0.3 to 0.4 s in the target's frame. Remember the last view.
- **Comfort**: no roll in first person, under 3 degrees elsewhere; head bob off by default; reduced motion drops FOV kicks and halves look-ahead.

## Mistakes

- Raw tick positions: the target steps at 60 Hz on a 144 Hz screen and vibrates.
- World-position lerp on a car: it pulls away at speed and cuts corners into walls. Smooth heading and offset in the target's frame.
- Casting from camera to target: once the camera is inside a wall the ray never hits it.
- `lookAt` past straight up flips the view; clamp pitch inside about 1.45 rad.

## Reuse

`@gamedna/kit/camera`: `createCameraRig(perspectiveCamera, { views, ground, occlude, near, onChange })` takes views from `VIEW_PRESETS` (chase, chaseFar, hood, cockpit, shoulder, firstPerson, topDown). Per frame, `rig.update(dt, { object, mountObject, mounts, velocity, speed, topSpeed }, input.takeLook(dt))` returns `{ view, heading, pitch }`. `rig.next()` and `rig.setView(nameOrIndex)` apply the cut and blend rules and near plane; in `onChange` call `setCockpitView` (vehicle module) or `setFirstPersonView` (character module). Custom cameras use `ease` and `wrapAngle` from `@gamedna/kit/random`. The game keeps the view list, occluders and ground function.

## Engines

- three.js 0.170: read `references/three.md` when wiring the rig, occluders or FOV into a scene.
- Phaser 3.90: read `references/phaser.md` when building a follow, side-scroll or top-down camera.
- Placement, FOV and lag per view, and 2D zoom per space: `references/views.md`.

## Verify

- Screenshot every view at rest and at top speed; the target projected with `Vector3.project(camera)` keeps |x| and |y| under 0.6.
- Tap the camera button for less than one tick: the view changes and `camera.near` matches it.
- Push look input, wait past `recenter`, and assert the view returns behind the target.
- With a wall between pivot and camera, the camera sits in front of it that frame and recovers within about 1 s once clear.
