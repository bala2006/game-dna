# Enemy AI in three.js 0.170 games

## Agents on the ground plane

Kit steering and navigation work on `{ x, y }`. In a 3D game keep each agent's simulation state as `{ x, y, vx, vy }` with `y` holding world z, so no copying happens per tick. Convert only when drawing: `mesh.position.set(a.x, height(a.x, a.y), a.y)` and `mesh.rotation.y = Math.atan2(a.vx, a.vy)`, eased with `ease(dt, 0.1)` through `wrapAngle` so turns do not snap.

## A nav grid from layout data

- Cell size near the agent's diameter: 0.5 to 0.75 m for humanoids with a 0.3 m radius, 1 to 2 m for vehicles.
- Rasterize the same box and circle records that create meshes and collision shapes, inflated by the agent radius, into blocked cells with `setCost(grid, x, y, 0)`. Never sample meshes.
- Terrain from a height function: raise the cell cost with slope (`1 + 4 · slope` is a fair start) and block cells steeper than the walkable limit.
- Convert with one origin: `cx = Math.floor((x - minX) / cellSize)`, and back to the cell center `minX + (cx + 0.5) * cellSize`.

## Perception

Line of sight for rules uses `losClear` on the grid or segment tests against collision shapes. `THREE.Raycaster` against scene meshes is for presentation such as aiming a head or a flashlight; level of detail and culling change its answers.

## Debug view

Behind a `?dev` flag, draw paths with `THREE.Line` over `new THREE.BufferGeometry().setFromPoints(points)` and view cones as a `THREE.Mesh` of a `CircleGeometry` sector. Register them with `createResourceTracker` from `@gamedna/kit/dispose` and dispose them with the level.
