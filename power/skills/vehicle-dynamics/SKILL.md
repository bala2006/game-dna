---
name: vehicle-dynamics
description: Car handling with throttle, braking, speed-dependent steering, tire grip, drift, surface limits, wall hits and suspension. Use when a car pivots on the spot, feels on rails or on ice, spins out or sticks to walls. Not for car models (vehicle-design), chase cameras (camera-systems) or the timestep (fixed-step-simulation).
license: MIT
metadata:
  owner: simulation
  topics: vehicle handling, tire grip, drift, suspension, braking, steering response
  engines: portable, three@0.170, phaser@3.90
  kit: kit/handling, kit/random, kit/contracts
---

# Vehicle dynamics

## Scope

Owns how a vehicle's speed, heading and slide change each tick, how it meets walls and surfaces, and the outputs effects read. When building the body, wheels and mounts, use `vehicle-design`; for chase and cockpit views, use `camera-systems`; for smoke, skid marks and impact shake, use `game-feel`; for obstacle shapes beyond the track edge, use `collision-and-response`.

## Decisions

- **Arcade model by default.** Split velocity into forward speed and lateral slide; grip removes slide each tick. A tire model with slip angles and load transfer only pays off when the game is about driving technique; the math is in `references/tires-and-suspension.md`.
- **Real units, arcade rates.** Meters and m/s, km/h = m/s × 3.6 on the HUD. A family car does 0 to 100 km/h in 8 to 10 s and brakes at 8 to 10 m/s²; arcade games run two to four times faster. Ridgeline Racer: top 52 m/s, 14 m/s² fading 35 percent toward top (0 to 100 in 2.2 s), brake 38 m/s², coast 4 m/s².
- **Yaw follows speed.** Zero at standstill, full above `yawSpeed` (about 8 m/s), fading 30 to 60 percent toward top speed, and reversed while rolling backward. Grip physics caps a real car at `μ·g / v` (0.33 rad/s at 30 m/s); Ridgeline's 2.1 rad/s at full lock is deliberately arcade.
- **Steering response.** Smoothed steering follows keys at 5 to 10 per second (Ridgeline 7) and sticks at 10 to 20; unsmoothed, a tap is full lock.
- **Grip as the lateral share kept per 1/60 s.** Grip 0.2 to 0.4 (Ridgeline 0.32, plus 0.25 at top speed), drift 0.88 to 0.95 (0.93 halves the slide in 0.16 s), with drift yaw 1.3 to 1.6 times normal. Ridgeline's full-lock corner at 45 m/s slides 1 m/s; a drift slides 14 m/s.
- **Slip is the readout.** Lateral speed above about 3 m/s starts smoke, skid marks and tire sound. Take it from the step output; never recompute it in `render`.
- **Surfaces as speed limits.** Off road, lower the limit (Ridgeline 20 m/s) and bleed toward it at 2 to 3 per second, so leaving the road slows the car instead of stopping it.
- **Walls.** Push out along the wall normal, reflect only the normal component with restitution 0.2 to 0.4, keep 0.9 to 0.97 of the rest. Raise an impact event above about 2 m/s, full strength near 18 m/s. At 52 m/s a car moves 0.87 m per tick, so test barriers by distance from the track centerline or swept segments.
- **Suspension is presentation** until wheels leave the ground in play: roll 2 to 4 degrees per g of lateral acceleration, pitch 1 to 2 degrees under braking, settling in 0.3 to 0.6 s.

## Mistakes

- The car pivots on the spot or steers backward in reverse: yaw not scaled by signed speed.
- `vx = sin(h) * speed` every tick: no slide, no drift, and walls cannot push the car sideways.
- `lateral *= 0.9` per frame: grip changes with frame rate. Use `Math.pow(keep, dt * 60)`.
- The car sticks to or climbs walls: the whole velocity zeroed, or pushed out along the velocity.
- Drift turns into a spin: drift keep near 1 together with boosted yaw.

## Reuse

`@gamedna/kit/handling`: `stepVehicle(state, input, tuning, dt, out, limit)` with `createVehicleState` and `createVehicleStep`; the step returns `slip`, `accel`, `yawRate` and `latAccel` for effects. `bounceOffWall(body, nx, nz, depth, restitution, keep)` resolves a barrier and returns the impact speed. Ridgeline Racer's `TUNE` in `apps/ridgeline-racer/src/sim.ts` is a tested starting set. The game keeps barriers, surfaces, race rules and AI drivers.

## Engines

- three.js 0.170: read `references/three.md` when a Kit car model or a scene must follow the simulated car.
- Phaser 3.90: read `references/phaser.md` when driving a top-down sprite with `stepVehicle`.

## Verify

- Full throttle from rest reaches 100 km/h within 10 percent of the target time.
- Full lock at standstill leaves the heading unchanged; in reverse the same steer turns the other way.
- A gentle corner keeps `slip` under 3 m/s; a drift passes 3 m/s within 0.5 s.
- The same input script at 60 and 120 Hz ends within 0.5 m after 6 s.
- A 30 degree wall hit at 30 m/s leaves the car outside the wall with at least `keep` of its tangential speed.
