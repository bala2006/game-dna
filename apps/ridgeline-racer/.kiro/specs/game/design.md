# Design: Ridgeline Racer

- Rules live in `src/sim.ts` (`RaceSim`): car handling, barriers, checkpoints, laps, countdown and pause at a fixed 60 Hz. It imports no three.js scene code and reads no clock.
- `src/track.ts` builds the circuit from the seed: 14 jittered control points on an ellipse, a centripetal Catmull-Rom spline resampled to 900 points, with tangents, distances and curvature from `@gamedna/kit/world`.
- `src/scenery.ts` draws the road, curbs, rails, terrain, trees, grass, gantry and marshals from the track. `src/effects.ts` draws smoke and skid marks from the car's slip. `src/audio.ts` is the engine sound.
- `src/main.ts` wires `createStage`, `createInput` (`BINDINGS.driving` plus N and M), `createCameraRig` (four views), `buildCar` and `runFixedStep`. The `?dev` hook exposes state, input, `carSize` and `touchLayout`.
- Tuning numbers are the `TUNE` table in `src/sim.ts`.