---
name: collision-and-response
description: Collision shapes, contact detection and resolution, and broad phase. Use when bodies tunnel through walls, snag on seams, jitter in contact or overlap checks get slow. Not for movement feel (character-movement), driving (vehicle-dynamics) or the timestep (fixed-step-simulation).
license: MIT
metadata:
  owner: simulation
  topics: collision detection, collision response, collision shapes, broad phase, raycasts
  engines: portable, three@0.170, phaser@3.90
  kit: kit/collision, kit/contracts
---

# Collision and response

## Scope

Owns which shape stands for each object, how contacts are found, how overlaps are resolved and how many-body checks stay cheap. Movement curves and jump rules belong to `character-movement`; grip and slip belong to `vehicle-dynamics`; the camera's own obstruction test belongs to `camera-systems` when it needs more than one ray.

## Decisions

- **Shape per role, not per mesh.** Characters: a circle (top-down, 3D on XZ) or an AABB (2D side view). Buildings and crates: oriented boxes. Hazards: shapes 10 to 20 percent smaller than their art, so near misses feel fair. Pickups: shapes 20 to 40 percent larger than their art.
- **Resolve on the axis of least penetration**, then remove only the velocity component into the surface. Keep the tangential part so bodies slide along walls instead of stopping dead.
- **Separate axes on tile grids.** Move x, resolve, then move y, resolve. This is what keeps corners from catching a body that slides along a floor.
- **Prevent tunneling by bounding the step.** A body must not move more than half its smallest dimension, or half a tile, per sub-step. At 60 Hz a 16 px body tunnels above about 480 px/s without sub-steps.
- **Use a skin.** Resolve to a gap of about 0.001 units so a body resting on a floor does not register as overlapping it next tick.
- **Broad phase above roughly 50 movers.** Rebuild a spatial hash each tick with cell size near twice the typical body size, then run exact tests only on the candidates.
- **Contacts are simulation state.** Grounded, wall and ceiling flags come out of the resolver and drive rules; presentation reads them for dust and sound.

## Mistakes

- Resolving both axes at once on tiles: bodies catch on the seam between two flat floor tiles.
- Zeroing the whole velocity on contact: sliding along walls becomes impossible and diagonal input sticks.
- Pushing out along the vector to the box center: a body hitting a long wall near its end gets shoved sideways.
- Checking only the final position of a fast projectile: it skips thin walls. Cast the segment instead.
- Collision shapes taken from render bounds: decorative parts such as antennas and capes snag on doorways.
- `n * n` pair checks hidden in an innocent loop over enemies and bullets.

## Reuse

`@gamedna/kit/collision` covers the common cases: `aabbOverlap`, `circleOverlap`, `circleAabbOverlap`, `circleVsAabb` and `circleVsCircle` push-outs, `pushCircleOutOfBox` for oriented boxes on XZ, `rayVsAabb` and `segmentVsCircle` casts, `moveAndCollideTiles` (axis-separated, sub-stepped, returns hit flags) and `SpatialHash`. Gravity Shift's tile physics and Trail Walk's building collision both run on it. Record shape sizes in the spatial contract's `scales` so art, rules and camera agree. The game keeps what a contact means: damage, pickup, death.

## Engines

- three.js 0.170: read `references/three.md` when collision must line up with meshes or the camera needs scene raycasts.
- Phaser 3.90: read `references/phaser.md` when deciding between the Kit resolver and Arcade Physics.

## Verify

- Property test: from random start positions and velocities up to the game's maximum, a body never ends a tick inside a solid tile or box.
- Edge test: a body sliding along a flat floor of many tiles keeps its horizontal speed.
- Speed test: a projectile at maximum speed hits a wall one unit thick.
- Broad phase test: hash query results equal brute-force results on random layouts.
