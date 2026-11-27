# Character movement in three.js 0.170 games

## Axes and facing

`stepGround` works in meters with +Y up, +Z forward and heading `atan2(x, z)`. Set `object.rotation.y = body.facing`. A model authored facing +Z needs no offset; one facing -Z, as many glTF exports do, needs `+ Math.PI`.

## Camera-relative input

Pass the yaw the camera looked along last frame as `cameraYaw`. With the Kit rig, `rig.update(...)` returns it as `heading`, which Trail Walk stores for the next tick. Without the rig, `camera.getWorldDirection(v)` then `Math.atan2(v.x, v.z)`. Set `faceCamera: true` in first person so the body turns with the view.

## Ground height

Pass the same pure function that built the terrain mesh, such as the `HeightFn` from `createHeightField` in `@gamedna/kit/world`. Raycasting the terrain mesh with `THREE.Raycaster` every tick costs more, changes with level of detail and cannot run in headless tests. To stand on crates and stairs, return the highest box top under the point from the same layout data that places the meshes.

## Step, slope and snap limits

`stepGround` snaps a grounded body to `height(x, z)` whatever the change. This wrapper rejects rises above the step height axis by axis, so the walker slides along a ledge instead of stopping, and turns a drop beyond the snap distance into a fall:

```ts
// check: compile
import { stepGround, type GroundBody, type GroundCollide, type GroundHeight, type GroundInput, type GroundStep, type GroundTuning } from '@gamedna/kit/controller';
import type { PointXZ } from '@gamedna/kit/collision';

const STEP_UP = 0.35, SNAP_DOWN = 0.35;

export function stepWalker(b: GroundBody, input: GroundInput, t: GroundTuning, dt: number, height: GroundHeight, solids: GroundCollide | null, out: GroundStep): GroundStep {
  const x0 = b.x, z0 = b.z, y0 = b.y, wasGrounded = b.grounded;
  const climbable = (x: number, z: number) => height(x, z) - y0 <= STEP_UP;
  const limit = (p: PointXZ): void => {
    solids?.(p);
    if (climbable(p.x, p.z)) return;
    if (climbable(p.x, z0)) p.z = z0;
    else if (climbable(x0, p.z)) p.x = x0;
    else { p.x = x0; p.z = z0; }
  };
  stepGround(b, input, t, dt, height, limit, out);
  if (wasGrounded && b.grounded && !out.jumped && y0 - b.y > SNAP_DOWN) {
    b.y = y0;
    b.vy = 0;
    b.grounded = false;
  }
  return out;
}
```

For a slope limit, compare the terrain gradient at the proposed point (central differences over about 0.25 m) with `Math.tan(maxSlope)` and reject uphill moves only. Keep it separate from the step rule, so short stair risers still climb.

## Coyote time and buffering on foot

`stepGround` jumps only on a tick where `input.jump` is true and the body is grounded. Add both windows in the game: count ticks since `grounded` was last true and allow a jump (`b.vy = t.jump; b.grounded = false`) while that count is within the coyote window and no jump has happened since; keep a buffer counter set on press and pass `jump: buffer > 0` while grounded.

## Scale

Trail Walk's walker: radius 0.3 m, height 1.75 m, reach 1.2 m, recorded in the spatial contract's `scales` so camera, art and collision agree. Real walking is 1.3 to 1.5 m/s; game jogs of 3 m/s and sprints of 5 to 6 m/s read as brisk without crossing a level too fast for its detail.
