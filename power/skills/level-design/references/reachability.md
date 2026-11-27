# Reachability: jumps, graphs and key order

## Jump envelope from the formulas

With take-off speed v, gravity g and top speed s on flat ground:

- Apex height: v² / 2g.
- Air time: 2v / g.
- Jump length: s x 2v / g.

Gravity Shift: v = 520 px/s, g = 1500 px/s², s = 240 px/s gives an apex of 90 px, 0.69 s in the air and 166 px of reach. A fixed 60 Hz step loses about v x dt / 2 of apex, so the controller reaches about 86 px. Coyote time adds `coyoteTicks` x s to reach off a ledge edge; a jump cut lowers the apex for short presses.

## Jump envelope from the controller

Formulas drift from the game as soon as the step order, air control or caps change. Run the real step on an open floor:

```ts
// check: compile
import { createPlatformerBody, createPlatformerStep, stepPlatformer, type PlatformerParams } from '@gamedna/kit/controller';

/** Apex height and flat-ground jump length at full speed, from the real controller. Units follow `p`; y grows downward. */
export function jumpEnvelope(p: PlatformerParams, size: { w: number; h: number }, tile: number, hz = 60): { apex: number; reach: number } {
  const floor = 1000, solid = (_tx: number, ty: number) => ty >= floor;
  const body = createPlatformerBody(0, floor * tile - size.h, size.w, size.h), out = createPlatformerStep();
  body.vx = p.maxSpeed;
  const startY = body.y;
  let apex = 0;
  for (let tick = 0; tick < hz * 10; tick++) {
    stepPlatformer(body, { move: 1, jumpPressed: tick === 0, jumpReleased: false }, p, 1 / hz, solid, tile, out);
    apex = Math.max(apex, startY - body.y);
    if (out.landed) break;
  }
  return { apex, reach: body.x };
}
```

Use the result for design margins only. The proof that a level works is a replayed input sequence through the game's own simulation.

## Graph search over standable tiles

For tile levels, a graph gives a fast first check:

1. Nodes: empty tiles with a solid tile under them (above them when gravity is reversed).
2. Edges: walk to a neighboring node; fall to any node below within the fall arc; jump to any node within the measured envelope whose arc is not blocked.
3. Search from spawn. Every key, the exit and every required trigger must be reached.

This shows a route exists under the model. It misses head bumps on low ceilings, momentum needed from a run-up, and moving hazards. Follow it with a playthrough scenario.

## Key and lock order

1. Copy the tiles and set every closed lock to wall.
2. Flood from spawn with `floodDistances`.
3. Collect the keys reached; open the locks they fit; repeat until nothing new opens.
4. The level is completable when the goal is reached. Any key never reached is behind its own lock.

## 3D reach

On foot with `stepGround`, apex is `jump² / (2 x gravity)` in meters and length depends on `sprint`. Walkable steps of 0.3-0.35 m and slopes up to 45° need no jump. Doors 2.0-2.1 m high and corridors 1.0-1.5 m wide fit a 1.75 m character; over-shoulder cameras need 2.5-3 m corridors. Test that a capsule fits every opening with `findPath` on a grid whose blocked cells are dilated by the capsule radius.
