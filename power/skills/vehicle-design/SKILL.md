---
name: vehicle-design
description: Cars, karts, bikes and trucks at real dimensions, with body proportions, wheels, cockpit, materials, camera mounts and animation from driving state. Use when adding a vehicle, or when one looks like a box or the wrong size.
---

# Vehicle design

A vehicle reads as real when its proportions match real vehicles, its wheels fill their arches and sit flush with the body, and its body moves on its wheels. Handling lives in the motion-and-physics skill. This skill builds what the player sees.

## The data shape

1. **Spec**: real dimensions in meters: length, width, height, wheelbase, front overhang, wheel diameter, tire width, ground clearance, and the side-profile heights (nose, cowl, deck, tail) and cabin span as shares of length.
2. **Layout**: a pure function of the spec. It gives the axle positions, the body top and width at any point along the length, the roof line, the belt line, the wheel positions and the mounts. It is testable without a renderer.
3. **View**: meshes built from the layout, in a fixed hierarchy (Step 3).
4. **Animation**: wheel spin, steer, body roll and pitch, and lights, from simulation state. The view never writes the simulation.

`@gamedna/kit/vehicle` implements this for three.js: `CAR_PRESETS`, `carLayout(spec)`, `buildCar({ preset, paint, caliper, ...spec })` (returns the groups in Step 3 plus `hull`, `cabin`, `wheels`, `materials`, `layout` and `mounts`), `animateCar(view, state, dt)`, `setCockpitView(view, inside)` and `measureCar(view)`.

## Step 1: Pick a class and its numbers

Start from real ranges. `CAR_PRESETS` holds the four car rows.

| Class | Length | Width | Height | Wheelbase | Wheel diameter | Clearance |
|---|---|---|---|---|---|---|
| Hatchback | 3.9-4.3 m | 1.7-1.8 m | 1.42-1.5 m | 2.5-2.65 m | 0.6-0.65 m | 0.13-0.16 m |
| Sedan | 4.6-4.9 m | 1.8-1.87 m | 1.42-1.48 m | 2.8-2.95 m | 0.65-0.7 m | 0.13-0.15 m |
| Sports coupe | 4.3-4.6 m | 1.85-1.95 m | 1.22-1.32 m | 2.45-2.65 m | 0.66-0.7 m | 0.1-0.12 m |
| SUV | 4.6-4.9 m | 1.9-1.95 m | 1.68-1.78 m | 2.8-2.9 m | 0.74-0.8 m | 0.19-0.22 m |
| Pickup | 5.3-5.9 m | 2.0-2.1 m | 1.85-1.95 m | 3.3-3.7 m | 0.8-0.85 m | 0.22-0.25 m |
| Kart | 1.8 m | 1.4 m | 0.6 m without driver | 1.01-1.07 m | 0.28 m | 0.03-0.05 m |
| Motorbike | 2.0-2.2 m | 0.75-0.85 m | 1.1-1.2 m | 1.35-1.6 m | 0.6-0.65 m | 0.13-0.15 m; seat 0.78-0.85 m |
| City bus | 12 m | 2.55 m | 3.0-3.2 m | 5.9-6.1 m | 1.0 m | 0.25-0.3 m |

Use one scale for the whole game: 1 unit = 1 m (world-building skill). A stylized game may exaggerate wheels by up to 15% and height by up to 10%; keep the rest real.

## Step 2: Proportions that stop the box look

| Rule | Starting value | Why it matters |
|---|---|---|
| Wheelbase share of length | 0.56-0.62 for cars | Short wheelbases look like toys |
| Wheels fill the arches | Arch radius = wheel radius x 1.1 + 2-3 cm | Big gaps read as a model kit |
| Wheels flush with the sides | Track = width - tire width - 4 cm | Inset wheels look like a cart |
| Glass height share of total height | 0.28-0.35; 0.25 on sports cars | A tall glass band looks like a van |
| Roof narrower than the body | Roof width 0.78-0.86 x body width | Straight sides look like a box |
| Ends taper in plan view | The last 15-20% of the length at each end narrows by 8-14% | Square ends look like a brick |
| Rounded sections | Superellipse body cross-section, exponent about 0.4 | Flat sides catch no reflections |
| Lights and grille | Head and tail lights near the corners, a dark lower intake | The face tells the type at a glance |

Check the profile against a person: a coupe roof sits near a 1.75 m person's chest, an SUV roof near the top of the head (character-design skill).

## Step 3: Structure

```text
root (ground point at the center of the wheelbase, yaw)
  body (pivot at 0.4-0.45 x height; rolls and pitches)
    shell (paint, glass, lights, trim)
      interior (dash, seats, steering wheel, headliner)
  wheel pivot x4 -> steer -> spin
```

- Wheels hang from the root, not from the body, so body roll does not tilt the wheels.
- Front wheels steer around their vertical axis; every wheel spins around its axle.
- Expose mounts for the camera skill: `eye` at the driver's eye, `hood` just above the hood. Mounts are in shell space so they roll with the body.
- Put the driver on the correct side for the market: `driverSide: 'left'` or `'right'`.

## Step 4: Materials

| Part | three.js starting values |
|---|---|
| Paint | `MeshPhysicalMaterial`: metalness 0.4-0.5, roughness 0.3, clearcoat 1, clearcoat roughness 0.05 |
| Glass | Dark tint, opacity 0.6 outside and 0.1 from the cockpit, `depthWrite: false` |
| Trim, tires | Near black, roughness 0.6 for trim and 0.9 for rubber |
| Rims, chrome, mirrors | Metalness 0.9-1, roughness 0.06-0.3 |
| Lights | Emissive; tail lights about 5x brighter while braking |

Take paint colors from the game's palette (art-direction skill). A realistic look needs a sky environment map, or paint and chrome look like plastic (three-js skill).

## Step 5: Animation from state

| Visual | Source | Starting value |
|---|---|---|
| Wheel spin | Distance travelled / wheel radius | Exact, so tires never slide visually |
| Front wheel angle | Steering state | Up to 0.4-0.6 rad at low speed |
| Steering wheel | Wheel angle x ratio | Ratio 6-8 reads well on screen; real cars use 12-16 |
| Body roll | Lateral acceleration | 0.006 rad per m/s², capped at 0.06 rad |
| Body pitch | Longitudinal acceleration | 0.004 rad per m/s², capped at 0.035 rad |
| Smoothing | Time constant on roll and pitch | 0.1-0.15 s |

Skid marks, smoke and tire sound come from the simulation's `slip` event (motion-and-physics skill).

## Step 6: Cockpit view

- Model what the driver sees: dash top, steering wheel, A-pillars, headliner, seats and mirrors with a reflective face.
- Inside faces need their own materials: the cabin's inner side shows the headliner, not paint.
- Call `setCockpitView(view, true)` on entering the view and `false` on leaving it, so glass fades from inside.
- The camera's near plane drops to 0.05 m in this view only (camera skill).

## 2D vehicles

- Top-down sprites keep the real length-to-width ratio, about 2.3-2.5 for cars. Rotate around the center of the wheelbase.
- Side view: wheels are separate sprites that spin by distance, and the body sprite bobs on them.

## Other vehicles

Write the spec table first (length, width, height, wheelbase, wheel size, clearance, seat and eye height), then a layout function like `carLayout`. Boats need draft and freeboard; aircraft need wingspan and wing position along the length.

## Verify

- Unit test the layout: the axles match the wheelbase and overhang, and the wheels touch the ground.
- `measureCar(view)` measures the hull and cabin in the car's own frame, wherever the car stands. Mirrors stay out, as in published specs. Length, width and height are within 2% of the spec; `packages/kit/tests/kit.test.ts` checks every preset.
- Screenshot the vehicle from the side, the front, the rear three-quarter, and in the cockpit view at speed. Put a 1.75 m person next to it in one shot.
- In each shot, check that the wheels fill the arches and that nothing clips the camera.

## Sources

- SAE J1100, *Motor Vehicle Dimensions*: names and measurement of length, wheelbase, overhang and clearance.
- Gillespie, *Fundamentals of Vehicle Dynamics* (1992): roll and pitch from lateral and longitudinal acceleration.
- CIK-FIA *Technical Regulations* for karts: wheelbase range.
- EU Directive 96/53/EC: maximum width 2.55 m and height 4 m for buses and trucks.
- Macey and Wardle, *H-Point: The Fundamentals of Car Design and Packaging* (2nd edition, 2014): proportions, glass share, packaging.
