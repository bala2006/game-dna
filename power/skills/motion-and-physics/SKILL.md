---
name: motion-and-physics
description: Weight in a fixed-step simulation. Start and stop curves, grip and drift, lean, contact reactions and timed actions. Use when movement feels weightless or like a cursor, or when tuning vehicle handling.
---

# Motion and physics

Players read weight from how speed changes, not from top speed. Tune the change. For jump arcs and hit feedback, use the game-feel skill.

## Where the code goes

- Rules go in the fixed-step simulation: velocity, grip, collisions, action timers. Use the seeded `rng` for any variation.
- Presentation goes in the scene (Phaser or three.js): lean, squash, dust, smoke, tire marks. It reads simulation state and never writes it.
- Integrate with the fixed `dt`: update velocity first, then position. Never scale rules by render delta.

## Recipe: start and stop curves

| Feel | Time to top speed | Time to stop | Fits |
|---|---|---|---|
| Light | 0.05-0.1 s | 0.05-0.1 s | Precision platforming, cursors |
| Grounded | 0.15-0.3 s | 0.1-0.25 s | Most characters |
| Heavy | 0.4-0.8 s | 0.3-0.6 s | Vehicles, armored or loaded characters |

These are starting points, not targets. Convert with `acceleration = topSpeed / timeToTop` and `deceleration = topSpeed / timeToStop`.

- Keep stop time at or below start time unless sliding is the point. Late stops cause overshoot deaths.
- When input opposes velocity, apply 1.5-2x deceleration so reversals stay responsive.
- Carried load can lower top speed and raise both times. Show the load on the body so the change has a visible cause.

## Recipe: turning and grip

For top-down movers and vehicles:

1. Each tick, split velocity into forward and lateral parts along the facing direction.
2. Keep the forward part. Multiply the lateral part by `lateralKeep`: 0-0.3 grips, 0.85-0.95 drifts.
3. Raise `lateralKeep` above a speed threshold or while a brake input is held.
4. Scale steering rate down as speed rises so high speed stays stable.
5. Emit a `slip` event when lateral speed passes a threshold. Drive smoke, tire marks and a screech from that event.

The `slip` event shows the player where the grip limit is. Without it, a slide looks like a bug.

## Recipe: lean and secondary motion

- Lean angle = `clamp(k * lateralAcceleration, -maxLean, maxLean)`. Start `maxLean` at 6-12 degrees. Ease toward the target; never snap.
- Vehicle body roll follows lateral acceleration. Pitch follows braking and launch.
- Attachments (bag, hair, cape, antenna) follow the body through a damped spring. Each one settles in under 0.5 s.
- Squash 5-15% on landing and stretch on launch, recovering in 80-150 ms.

## Recipe: contact reactions

- On overlap, give a prop an impulse from the mover's velocity times a mass ratio, plus some spin, then friction to rest.
- Keep props presentation-only unless a rule depends on them. Seed any randomness from the prop ID so screenshots repeat.
- Props never block the critical path. Cap the number moving at once.

## Recipe: commitment actions

Actions that change state (enter a vehicle, open, revive, craft, place an item) take time and have phases: `windup`, `active`, `recover`.

| Weight of the action | Duration |
|---|---|
| Quick interaction | 0.3-0.6 s |
| Meaningful commitment | 1-2 s |
| Major commitment | 2-4 s with a progress cue at the object |

- Put every duration in the tuning file.
- Split dangerous actions into place and trigger. One press never does both.
- Write down what interrupts each phase (damage, movement input) as a protected rule.

## Verify

- Stop time: release input at a fixed tick and assert speed with `stateAtEnd` at the target tick.
- Grip: a slow-turn scenario asserts `eventCount` of `slip` eq 0. A fast-turn scenario asserts gte 1.
- Commit timer: a scenario that ends before the duration asserts `eventCount` of the completion event eq 0. One that ends after asserts eq 1.
- Place and trigger: a scenario that presses only place asserts `eventCount` of `trigger` eq 0.
- Feel choices go to the user as 2-3 variants through the refinement skill.

## Anti-patterns

- Lerping position straight to the input target. It hides mass and breaks replay when tied to render delta.
- Presentation (lean, shake, roll) feeding back into rules.
- Physics props that can trap the player or block progress.

## Sources

- Swink, *Game Feel* (2008): response curves as the material of feel.
- Fiedler, "Fix Your Timestep!" (2004): fixed-step integration.
- Thomas and Johnston, *The Illusion of Life* (1981): follow-through, overlapping action, squash and stretch.
