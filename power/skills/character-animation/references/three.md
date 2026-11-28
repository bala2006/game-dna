# Character animation in three.js 0.170

## Kit rig or skinned model

| Need | Choose |
|---|---|
| Stylized or blocky people, crowds of seeded NPCs, no art pipeline | Kit `buildHumanoid`: rigid segments on joint groups, posed in code |
| Authored meshes, faces, cloth, motion-captured clips | `SkinnedMesh` from `GLTFLoader` with an `AnimationMixer` |

Each Kit humanoid is about twenty meshes. Past a few dozen on screen, merge segments per material or move to instancing.

## Clips with AnimationMixer

- `mixer.update(dt)` once per rendered frame, in render, never in the simulation tick.
- Start the next state with `next.reset().setEffectiveWeight(1).play()` and `current.crossFadeTo(next, duration, true)`. `warp: true` matches the two clips' speeds during the fade, which keeps walk and run in step.
- Locomotion as a blend: play idle, walk and run together and set weights from speed. Set `setEffectiveTimeScale(speed / clipSpeed)` on each, where `clipSpeed` is the clip's stride divided by its cycle length, measured once. Then the feet match the simulation's speed.
- Keep phase aligned with `syncWith(otherAction)` when one cycle starts while another plays.
- three.js has no root-motion extraction. Use in-place clips and let the simulation move the root; strip root translation from clips that have it.

## IK on a skeleton

- `CCDIKSolver` from `three/addons/animation/CCDIKSolver.js`: `new CCDIKSolver(skinnedMesh, iks)` where each entry names `target`, `effector` and `links` as bone indices, with `iteration` and per-link `rotationMin` and `rotationMax`. Call `solver.update()` after `mixer.update(dt)`.
- For legs and arms the analytic two-bone solution is exact and cheaper: compute the angles, then set the bones' local rotations after the mixer has run.
- Order per frame: simulation state, mixer, IK and foot placement, `updateMatrixWorld`, camera, render.

## Kit rig details

- `animateHumanoid(rig, phase, speed, dt, time)` returns the next phase. Store it per character and pass `time` offsets so idles do not breathe in unison.
- Custom poses: start from `gaitPose(layout, 0, 0)` and override joints, then `applyPose(rig, pose)`. Ridgeline seats its driver with hips at -1.45, knees at 1.25 and shoulders at -0.95 rad.
- Secondary parts (a cape, a bag, a ponytail): add a group under the right joint and rotate it each frame with a damped spring driven by that joint's world acceleration.
- First person: `setFirstPersonView(rig, true)` hides the head so it never fills the near plane.
- Shadows: every Kit segment casts and receives. For distant crowds, turn off `castShadow` on hands and feet.
