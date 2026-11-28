---
name: vehicle-design
description: Builds what the player sees of a vehicle. Real dimensions and proportions, part hierarchy, materials, cockpit, wheel spin and steer, body roll and pitch, lights and damage presentation. Use when a vehicle looks like a box, the wrong size or rigid. Not for grip and handling (vehicle-dynamics) or camera views (camera-systems).
license: MIT
metadata:
  owner: motion
  topics: vehicle construction, vehicle proportions, wheel and body animation, vehicle damage presentation
  engines: portable, three@0.170, phaser@3.90
  kit: kit/vehicle
---

# Vehicle design

## Scope

Owns a vehicle's visible body: spec, proportions, hierarchy, materials, cockpit, wheel, body and light animation from driving state, and how damage shows. When the question is grip, drift, speed or wall bounces, use `vehicle-dynamics`. When choosing chase, hood or cockpit views, use `camera-systems`. When skid marks and smoke need drawing, use `rendering-and-lighting`. When a driver sits inside, use `character-animation` for the pose.

## Decisions

- **Spec, layout, view, animation.** The spec is real dimensions in meters; the layout is a pure function of it (axles, body profile, roof, belt line, wheels, eye), testable without a renderer. The view never writes the simulation.
- **Real numbers** (`CAR_PRESETS`, length x width x height, wheelbase, wheel diameter): hatch 4.06 x 1.78 x 1.47, 2.56, 0.63; sedan 4.78 x 1.84 x 1.45, 2.85, 0.67; coupe 4.5 x 1.9 x 1.28, 2.6, 0.68; SUV 4.72 x 1.93 x 1.72, 2.84, 0.76. Karts, bikes, pickups and buses are in `references/dimensions.md`.
- **Proportions that stop the box look.** Wheelbase 0.56-0.62 of length. Arch radius = wheel radius x 1.12 + 3 cm. Track = width - tire width - 4 cm, so wheels sit flush. Glass band 0.28-0.35 of height (0.25 on sports cars). Roof 0.78-0.86 of body width. Ends narrow 8-14% over their last 15-20%. Stylized vehicles may grow wheels up to 15% and height up to 10%; keep the rest real.
- **Hierarchy.** Root (ground, yaw) > body (pivot at 0.42 of height; rolls and pitches) > shell (paint, glass, lights) > interior. Wheels hang from the root: pivot > steer > spin, so roll never tilts them. Camera mounts live in shell space.
- **Animation from state.** Spin = distance / wheel radius. Front wheels up to 0.4-0.6 rad at low speed. Steering wheel at 6x the wheel angle; the real 12-16x is invisible on screen. Roll 0.006 rad per m/s² up to 0.06; pitch 0.004 rad per m/s² up to 0.035; both smoothed over 0.12 s. Brake lights at 5x their running brightness.
- **Roll away from the turn.** With `animateCar`, positive `lateralAccel` (toward the car's left, +x) lifts the left side. A flipped sign leans the car into corners like a motorbike. Braking dips the nose; acceleration squats the tail.
- **Spokes alias.** A 5-spoke wheel appears to slow, stop or turn backward once it turns more than half a spoke gap (36°) per frame: about 13 m/s for a 0.68 m wheel at 60 fps. Above that, swap spokes for a blurred disc.
- **Damage shows state, never sets it.** The simulation holds damage per zone and emits impacts with point and power; the view picks one of 3-4 tiers (scuffed, dented, parts loose, wrecked). Dents push hull vertices within 0.3-0.6 m of the impact inward by 5-15 cm at most, clear of arches and cabin. Bumpers and mirrors detach at a threshold; heavy damage adds engine smoke. Collision shapes never follow the mesh.

## Mistakes

- Short wheelbase, inset wheels and flat sides: a toy or a box.
- Wheels parented to the body: they tilt with every corner.
- Wheel spin from time or a guessed factor: tires slide visibly.
- A car twice real size beside a 1.75 m person, or dimensions measured with mirrors included.
- Paint visible from inside the cockpit; the dash clipped by the near plane.
- Dents that push vertices outward into the wheel arches.

## Reuse

`@gamedna/kit/vehicle`: `CAR_PRESETS`, `carLayout(spec)`, `buildCar({ preset, paint, caliper, ...spec })` (returns `root`, `body`, `shell`, `interior`, `hull`, `cabin`, `steeringWheel`, `wheels`, `materials`, `layout`, `mounts`), `animateCar(view, { steerAngle, speed, lateralAccel, longitudinalAccel, braking }, dt)`, `setCockpitView(view, inside)`, `measureCar(view)`, `carMaterials`. Ridgeline Racer picks paint with a seeded `hsv` and seats a Kit humanoid in `interior`. The game keeps the damage model and other vehicle types.

## Engines

- three.js 0.170: read `references/three.md` when extending `buildCar`, deforming the hull, seating a driver or adding lamps.
- Phaser 3.90: read `references/phaser.md` when drawing vehicles as sprites.

## Verify

- `measureCar` within 2% of the spec for every preset, wherever the car stands (`packages/kit/tests/kit.test.ts`).
- Layout: axle spacing equals the wheelbase, wheels rest at y = radius, the eye sits under the roof.
- After driving distance d, wheel rotation equals d / radius.
- Roll test: a left turn lifts the left side; braking pitches the nose down.
- Screenshots from the side, front, rear three-quarter and cockpit at speed, one with a 1.75 m person beside the car.
