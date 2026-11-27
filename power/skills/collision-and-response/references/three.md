# Collision in three.js 0.170 games

three.js has no physics. Keep collision in the fixed-step simulation and let meshes follow it.

## Shapes from layout data, not from meshes

Build collision shapes from the same layout data that places the meshes: a box record `{ x, z, hx, hz, yaw }` creates both the house mesh and the `OrientedBox` that `pushCircleOutOfBox` uses. Deriving shapes from `Box3.setFromObject` after the fact picks up roofs, chimneys and other overhangs that should not block a walker.

## Height

The Kit's 3D movers are circles on XZ plus a height function. Ground contact is `y <= height(x, z)`, resolved by snapping. Use oriented boxes for walls and solid props; leave fences that should be climbable out of the solid list.

## Scene raycasts

Reserve `THREE.Raycaster` for presentation questions such as camera obstruction or mouse picking. Give it a small array of simplified occluder meshes, set `raycaster.far`, and never raycast against the whole scene every frame. Rules must not depend on raycasts against render meshes, because level-of-detail and culling change them.

## Debug view

Draw collision shapes with `THREE.LineSegments` from `EdgesGeometry` behind a `?dev` flag, and dispose them with `createResourceTracker` from `@gamedna/kit/dispose`.
