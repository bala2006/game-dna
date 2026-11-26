---
name: level-design
description: Short levels that teach, test and twist one mechanic at a time, with safe spawns, fair hazards and checkable reachability. Use when building or reviewing levels, rooms, arenas or waves.
---

# Level design

## Teach, test, twist

1. **Teach**: introduce one mechanic where failure is cheap (low pit, no enemies).
2. **Test**: require the mechanic with mild pressure.
3. **Twist**: combine it with an earlier mechanic or change the context (gravity reversed, two keys).

One new idea per level in a short game. Put a one-line hint on screen for the teach level only.

## Fairness checklist

- Spawn is safe: no hazard or enemy within one second of travel.
- Every gap is clearable with margin. With jump velocity v, gravity g and top speed s, a flat-ground jump covers about `2 · v / g · s` px horizontally and `v² / 2g` px vertically. Design gaps at 60-80% of that.
- Every step up is below the measured `jump.apexHeight` minus the player height margin.
- Hazards read as hazards by shape, not only color.
- Arena spawns keep a minimum distance from the player (Neon Survivor uses 200 px).

## Verify instead of eyeballing

- Lab rooms: build tiny rooms that isolate one mechanic (`lab-flat`, `lab-spikes`) and point scenarios at them through `setup.level`.
- Scenario playthroughs: record a key sequence that completes the level and assert `levelComplete`. Rerun it after tuning changes; movement changes can make an old level impossible.
- Reachability: for grid levels you may reason with graph search over standable tiles. That shows a path exists under the model; it is not proof for arbitrary physics. Say which one you checked.

## Encounter pacing (arenas)

- Waves grow by count first, then add one new enemy type.
- Leave a short pause (1-2 s) between waves with a visible banner.
- Keep the number of simultaneous threats readable at the target resolution.
