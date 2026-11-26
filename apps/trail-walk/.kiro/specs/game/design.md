# Design: Trail Walk

- `src/layout.ts` builds the world as data from the seed: the trail loop, the height field flattened along it, trees, the wall with its doorway, the parked car and eight markers placed away from props.
- Rules live in `src/sim.ts` (`WalkSim`): camera-relative movement with start and stop curves, jump and gravity, collision with trees, wall pieces and the car (circle against turned boxes), markers, the timer, pause and reset, at a fixed 60 Hz. The camera yaw from the last rendered frame enters each tick as input.
- `src/scenery.ts` draws the layout. `src/main.ts` wires `createStage`, `createInput` (`BINDINGS.onFoot` plus R), `createCameraRig` (over-shoulder and first person, with collision against the wall and car), `buildHumanoid` and `runFixedStep`. The `?dev` hook exposes state, input, `touchLayout` and `standAtMarker`.
- Tuning numbers are the `TUNE` table in `src/sim.ts`.