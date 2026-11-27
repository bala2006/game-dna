# Vehicle dynamics in three.js 0.170 games

## Following the simulated car

`stepVehicle` uses meters, +Y up, +Z forward and heading `atan2(x, z)`, the same frame as a Kit car from `buildCar`. In `render`:

- Interpolate position and heading between the previous and current tick, then set `car.root.position.set(x, groundY, z)` and `car.root.rotation.y = heading`. Ridgeline Racer's `render` in `apps/ridgeline-racer/src/main.ts` is the reference wiring.
- Call `animateCar(view, { steerAngle, speed, lateralAccel, longitudinalAccel, braking }, dt)` with `steerAngle = state.steer * maxWheel` (Ridgeline uses 0.42 rad, about 24 degrees), `lateralAccel` and `longitudinalAccel` from the `VehicleStep`, and `braking` from the brake input above about 0.2 while moving forward.
- Give the camera rig the interpolated root plus `velocity`, `speed` and `topSpeed`, so its look-ahead follows the slide instead of the nose.

## Hills

The handling model is flat. On terrain, keep the simulation on XZ and tilt only the drawn car:

- Sample the height function at the four wheel spots from `view.layout.wheels` (or at `frontAxle`, `rearAxle` and `track`) in world space.
- Pitch is `atan2(hFront - hRear, frontAxle - rearAxle)` and roll is `atan2(hLeft - hRight, track)`. Ease both with `ease(dt, 0.08)` so bumps do not snap the body.
- Apply them on a child group, or set `root.rotation.order = 'YXZ'` so yaw applies before pitch and roll. With the default `'XYZ'` order, a car on a slope swings sideways as it turns.
- If gravity along the slope should slow climbs, add `-g · sin(pitch)` to forward acceleration in the simulation, not in the view.

## Wheel contact

When a rule depends on whether a wheel is on the ground (jumps, airtime scoring), test it in the simulation against the height function. `THREE.Raycaster` against render meshes is for presentation only, because level of detail and culling change those meshes.
