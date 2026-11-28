# Inverse kinematics and foot placement

## Two-bone IK

A hip, knee and ankle (or shoulder, elbow, wrist) with segment lengths a and b, and a target at distance d from the root:

- Clamp d to `[|a - b| x 1.001, (a + b) x 0.999]`. At full extension the knee angle has no well-defined derivative, and the limb snaps straight and back.
- Joint bend from the law of cosines: `knee = π - acos((a² + b² - d²) / 2ab)`, 0 when straight.
- The root leads the target line by `acos((a² + d² - b²) / 2ad)`, toward the side the joint points: forward for knees, backward for elbows.

```ts
// check: compile
/**
 * Hip and knee angles in the leg's swing plane for an ankle target `dz` forward of and `dy` below the hip.
 * Lengths in meters. `hip` is the thigh's forward angle from straight down; `knee` is 0 when straight.
 * With the Kit rig: `joints.hipL.rotation.x = -hip`, `joints.kneeL.rotation.x = knee`.
 */
export function twoBoneIk(thigh: number, shin: number, dz: number, dy: number): { hip: number; knee: number; reached: boolean } {
  const raw = Math.hypot(dz, dy);
  const d = Math.min((thigh + shin) * 0.999, Math.max(Math.abs(thigh - shin) * 1.001, raw));
  const clampCos = (c: number) => Math.min(1, Math.max(-1, c));
  const knee = Math.PI - Math.acos(clampCos((thigh * thigh + shin * shin - d * d) / (2 * thigh * shin)));
  const lead = Math.acos(clampCos((thigh * thigh + d * d - shin * shin) / (2 * thigh * d)));
  return { hip: Math.atan2(dz, dy) + lead, knee, reached: raw <= (thigh + shin) * 0.999 };
}
```

`gaitPose` in `@gamedna/kit/character` solves its legs this way every frame.

## Pole direction in 3D

The solution above lives in one plane. In 3D, choose the plane from the root, the target and a pole: a point the knee should face, about 0.5 m in front of the knee along the character's facing. For arms, place the pole behind and below the elbow. Without a pole, knees flip sideways when the target crosses the root's vertical.

## Joint limits

| Joint | Range |
|---|---|
| Knee | 0 to 150° flexion, no hyperextension |
| Elbow | 0 to 145° flexion |
| Ankle | 20° up to 45° down; tilt to ground up to 30° |
| Hip | 120° forward, 20-30° back |
| Neck and head | Yaw 70°, pitch 30-40° |

Spread a look-at across spine, neck and head at about 20%, 30% and 50%, so the head never turns alone.

## Feet on uneven ground

1. Sample ground height under each foot's planned position from the same height function the simulation uses.
2. Offset each foot target by its ground height relative to the root.
3. Lower the pelvis by the larger of the two drops, never raise it, and only up to 40% of leg length.
4. Solve each leg, then rotate the ankle so the foot lies on the ground normal, clamped to 30°.
5. Smooth the pelvis offset and foot targets with `ease(dt, 0.05-0.1)` so steps onto curbs do not jolt.
6. Stance feet stay locked to the world position where they landed until the gait lifts them.

The Kit's `gaitPose` assumes flat ground at the root's height, so steps 4-6 are the game's job on slopes.

## Longer chains

Tails, tentacles, necks and three-segment insect legs use CCD or FABRIK: 5-10 iterations, stop within 1 mm. Clamp each joint to its range on every iteration, or the chain folds through itself.

## Procedural stepping for many legs

Each foot has a rest point in body space. When the body moves the planted foot more than 0.3-0.5 of the leg's reach from its rest point, the foot lifts and arcs to a new point projected ahead along the velocity by half the threshold. Allow only alternate legs (tripod groups on six legs) to step at once, so the body is always supported.
