---
name: character-animation
description: Builds and animates bodies. Measured proportions, joint rigs, locomotion cycles, blends, IK and planted feet, anticipation, follow-through, secondary motion and creatures. Use when a character looks the wrong size, slides, pops or moves stiffly. Not for speed and jumps (character-movement) or cars (vehicle-design).
license: MIT
metadata:
  owner: motion
  topics: character construction, body proportions, skeletal rigs, procedural animation, locomotion animation, animation blending, inverse kinematics, foot placement, anticipation and follow-through, secondary motion, creature motion
  engines: portable, three@0.170, phaser@3.90
  kit: kit/character, kit/random
---

# Character animation

## Scope

Owns a body from measurements to motion: layout, rig, pose functions, blends between states, IK, foot contact, and the overlapping motion that makes it feel alive, for humans and other body plans. When the question is how fast the body moves, accelerates or jumps, use `character-movement`. When its capsule hits things, use `collision-and-response`. When a view sits at the eye mount, use `camera-systems`. When an impact needs hit-stop or squash timing, use `game-feel`.

## Decisions

- **Layout, rig, pose, simulation.** Layout is pure data from stature and style; the rig is joint groups at the joints; a pose is a pure function of phase, speed and time. The simulation owns position and state, and the rig only reads them.
- **Proportions.** Head counts: realistic 7.5, heroic 8, stylized 6, compact 4, chibi 2.5; one style per game. Realistic landmarks as a share of stature: eye 0.936, shoulder 0.818, elbow 0.63, hip 0.53, knee 0.285, shoulder width 0.259, foot 0.152. At 1.75 m: eye 1.64 m, hip 0.93 m, knee 0.50 m. Seed NPC statures over 1.62-1.88 m.
- **Rig conventions.** L is the character's own left, +x when facing +z. Positive x rotation swings a limb back; knees bend positive, elbows negative. Held items hang from the wrist joint.
- **Gait by distance.** Phase advances by distance over stride, never by time. Walk 1.2-1.5 m/s with a 1.5 m stride; run 4.5-6 m/s with a 3-3.8 m stride and a flight phase. Walk turns into run near a Froude number of 0.5, v = √(0.5 x g x hip height): 2.1 m/s at 1.75 m, which is where the Kit's blend begins (2.0-3.5 m/s). Duty factor falls from 0.6 walking to 0.26 running.
- **Blend times.** Idle and locomotion 0.2-0.3 s; into a jump 0.05-0.1 s; landing 0.1 s; hit reactions 0.05 s in. Blend cycles at the same normalized phase so feet do not double-step. Turn toward the move direction over 0.1-0.2 s and lean into turns, capped at 10-15°.
- **IK and feet.** Two-bone analytic IK for legs and arms, reach clamped to 0.999 of chain length, knee 0-150°, elbow 0-145°. On uneven ground, lower the pelvis by the larger foot drop (never raise it) and tilt each ankle to the ground by at most 30°. Heads look at targets within 70° of forward. The math is in `references/ik.md`.
- **Anticipation.** 50-100 ms on big NPC and enemy actions so players can read them. Player actions start on the input tick; their wind-up lives inside the action's own startup frames.
- **Follow-through and secondary motion.** Hair, capes, tails and antennas settle 100-300 ms after the root stops, on damped springs at 2-4 Hz with damping ratio 0.3-0.6. Idle breathes at about 0.25 Hz; it is never frozen.
- **Creatures.** Write the landmark table first. Quadruped gaits by foot phase offsets: walk 0, 0.25, 0.5, 0.75 (hind left, fore left, hind right, fore right); trot diagonal pairs at 0 and 0.5. Speeds scale with √(leg length). Many-legged walkers step a leg when its foot strays 0.3-0.5 of its reach from rest, alternating groups.

## Mistakes

- Phase from time, or thighs swung by a sine wave without IK: feet slide or skate.
- Instant state switches pop; blends over 0.3 s feel floaty and late.
- Walk and run blended at different phases: stutter steps.
- Pelvis raised to reach the far foot: knees lock and the body floats.
- Springs stepped with raw frame time explode on a hitch. Use `ease(dt, tau)` or fixed substeps.
- Animation picked from input instead of simulation state: the run cycle plays against a wall.

## Reuse

`@gamedna/kit/character`: `humanoidLayout({ height, style, heads, build })`, `PROPORTION_STYLES`, `BODY_RATIOS`, `buildHumanoid(layout, colors)` (`root`, `joints`, `layout`, `materials`, `mounts.eye`), `animateHumanoid(rig, phase, speed, dt, time)` returning the next phase, `gaitPose` (pure; two-bone IK, heel strike, toe-off), `gaitStride`, `advanceGait`, `applyPose` for custom poses, `setFirstPersonView`. `@gamedna/kit/random`: `ease`, `smoothstep`, `lerp`. The game keeps its state machine and custom actions.

## Engines

- three.js 0.170: read `references/three.md` when choosing between the Kit rig and a skinned model, cross-fading clips or adding IK to a skeleton.
- Phaser 3.90: read `references/phaser.md` when animating sprite sheets or cutout rigs.

## Verify

- Layout landmarks within 1% of their shares for the realistic style.
- Walk at 1.0, 1.4, 2.0 and 5.0 m/s: heel and toe contact points move less than 2 cm (`packages/kit/tests/kit.test.ts`).
- Stride at 1.4 m/s is 1.35-1.65 m; at 5 m/s, 3-3.8 m.
- Through a walk-to-run ramp, no joint angle jumps more than 0.1 rad between frames.
- A screenshot beside a 2.1 m door and a car.
