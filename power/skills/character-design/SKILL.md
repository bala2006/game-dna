---
name: character-design
description: Humanoid and creature proportions, joint rig, silhouette, walk and run cycles, eye height and collision capsule. Use when making a character, or when one looks the wrong size or shape.
---

# Character design

A character reads as believable when its proportions are consistent, its joints bend where real joints bend, and its feet stay planted. Detail comes last.

## The data shape

1. **Layout**: stature, proportion style and build give every landmark height and width. It is pure data and testable.
2. **Rig**: a joint hierarchy built from the layout. Each joint is a group at the joint position; meshes hang from it.
3. **Pose**: joint angles from a pure function of gait phase, speed and time.
4. **Simulation**: position, velocity, facing and state live in the fixed-step simulation. The rig only displays them.

`@gamedna/kit/character` implements all four for three.js: `humanoidLayout`, `buildHumanoid`, `animateHumanoid` (gait phase by distance, legs solved by IK so stance feet stay planted), `gaitPose`, `gaitStride`, `applyPose` and `setFirstPersonView`. `buildHumanoid` returns `{ root, joints, layout, materials, mounts }`; `mounts.eye` is the first-person camera mount (camera skill).

## Step 1: Pick a proportion style

Measure in head heights: stature divided by head height.

| Style | Heads | Fits | What changes |
|---|---|---|---|
| Realistic | 7-7.5 | Grounded games, simulation | Measured landmarks below |
| Heroic | 8 | Action heroes | Longer legs, wider shoulders |
| Stylized | 5-6 | Most stylized 3D | Bigger head and hands, shorter legs |
| Compact | 4 | Readable at small sizes | Head and feet carry the read |
| Chibi | 2-3 | Cute, mobile, top-down | Head about a third of the height |

Use one style for every character in the game. Mixing styles makes one character look wrong next to another.

## Step 2: Landmarks

Realistic landmarks as a share of stature (Drillis and Contini):

| Landmark | Share | At 1.75 m |
|---|---|---|
| Eye | 0.936 | 1.64 m |
| Chin | 0.870 | 1.52 m |
| Shoulder | 0.818 | 1.43 m |
| Elbow | 0.630 | 1.10 m |
| Hip joint | 0.530 | 0.93 m |
| Wrist | 0.485 | 0.85 m |
| Fingertip | 0.377 | 0.66 m |
| Knee | 0.285 | 0.50 m |
| Ankle | 0.039 | 0.07 m |
| Shoulder width | 0.259 | 0.45 m |
| Hip width | 0.191 | 0.33 m |
| Foot length | 0.152 | 0.27 m |

- For other styles, keep these shares below the chin and scale them into the space under the bigger head. `humanoidLayout` does this.
- Adults range 1.55-1.95 m. Give NPCs a seeded spread, such as 1.62-1.88 m, so a crowd does not look cloned.
- The first-person camera sits at the eye landmark (camera skill).
- Collision: a capsule of radius 0.25-0.35 m and the stature as height. Step height 0.3-0.35 m, walkable slope up to 45 degrees.

## Step 3: Joint hierarchy

```text
root (ground point, yaw)
  pelvis (hip height)
    torso -> neck -> head
    torso -> shoulderL/R -> elbowL/R -> wristL/R
    hipL/R -> kneeL/R -> ankleL/R
```

- Put each joint's origin at the joint, so rotations bend in the right place.
- L is the character's own left: +x when the character faces +z.
- Positive x rotation swings a limb backward. Knees bend positive, elbows negative.
- Attach held items, hats and bags to the joint they move with.

## Step 4: Silhouette and read

- The player must read at the smallest size it appears: about 30 px tall in 2D, or at 50 m in 3D.
- Separate the character from its surroundings by value first (art-direction skill). Add one strong shape cue: a hat, a backpack, a color block.
- NPCs never share the player's silhouette and colors.
- Show gear and carried load on the body (polish-and-detail skill).

## Step 5: Motion

| Gait | Speed | Notes |
|---|---|---|
| Walk | 1.2-1.5 m/s | Stride about 1.5 m at 1.75 m tall |
| Jog | 2.5-3.5 m/s | Blend from walk to run |
| Run | 4.5-6 m/s | Flight phase; stride 3-3.8 m |
| Sprint | 7-8 m/s | Short bursts |

- Advance the gait phase by distance travelled divided by stride length. Stride comes from leg length and swing angle (`gaitStride`). Phase tied to time instead of distance makes the feet slide.
- Plant the stance foot: place the ankle on the ground and solve hip and knee angles from it (two-bone IK), with heel strike and toe-off. Swinging thighs by a sine wave makes the feet skate even when phase follows distance.
- Drive animation states from simulation state: idle, walk, run, jump, fall, land, interact, hit. Blend between them over 0.1-0.2 s.
- Idle is never frozen: a small breath at about 0.25 Hz.
- Turn the character toward the move direction over 0.1-0.2 s, and lean into turns (motion-and-physics skill).
- Heads look at targets within 70 degrees of forward.

## Creatures and other body plans

Use the same method. Write a landmark table for the body plan before building: shoulder and hip heights, body length, head size, leg length. For a quadruped, stride comes from leg length the same way.

## 2D characters

- Put the sprite pivot at the feet. Keep the sprite near the hitbox size (technical-art skill).
- Readable poses at 8-12 animation frames per second; physics stays at the full tick rate.

## Verify

- Unit test the layout: eye, shoulder, hip and knee within 1% of their shares for the realistic style.
- Screenshot each character next to scale references: a 2.1 m door, a car, another character.
- Walk at 1.4 m/s and record the heel and toe world positions during contact: each moves less than 2 cm. `packages/kit/tests/kit.test.ts` runs this check at walk and run speeds without a browser.
- In first person, the camera height equals the layout's eye height.

## Sources

- Winter, *Biomechanics and Motor Control of Human Movement* (4th edition, 2009): segment lengths after Drillis and Contini (1966).
- Loomis, *Figure Drawing for All It's Worth* (1943): proportions in head heights.
- Williams, *The Animator's Survival Kit* (2001): walk and run cycles.
- Solarski, *Drawing Basics and Video Game Art* (2012): shape language.
