# Vehicle dimensions

Real ranges in meters. The four car rows match `CAR_PRESETS`; the others need a spec table and a layout function of their own.

| Class | Length | Width | Height | Wheelbase | Wheel diameter | Clearance |
|---|---|---|---|---|---|---|
| Hatchback | 3.9-4.3 | 1.7-1.8 | 1.42-1.5 | 2.5-2.65 | 0.6-0.65 | 0.13-0.16 |
| Sedan | 4.6-4.9 | 1.8-1.87 | 1.42-1.48 | 2.8-2.95 | 0.65-0.7 | 0.13-0.15 |
| Sports coupe | 4.3-4.6 | 1.85-1.95 | 1.22-1.32 | 2.45-2.65 | 0.66-0.7 | 0.1-0.12 |
| SUV | 4.6-4.9 | 1.9-1.95 | 1.68-1.78 | 2.8-2.9 | 0.74-0.8 | 0.19-0.22 |
| Pickup | 5.3-5.9 | 2.0-2.1 | 1.85-1.95 | 3.3-3.7 | 0.8-0.85 | 0.22-0.25 |
| Kart | 1.8 | 1.4 | 0.6 without driver | 1.01-1.07 | 0.28 | 0.03-0.05 |
| Motorbike | 2.0-2.2 | 0.75-0.85 | 1.1-1.2 | 1.35-1.6 | 0.6-0.65 | 0.13-0.15; seat 0.78-0.85 |
| City bus | 12 | 2.55 | 3.0-3.2 | 5.9-6.1 | 1.0 | 0.25-0.3 |
| Semi tractor | 6-7 | 2.5-2.55 | 3.8-4.0 | 3.8-5.0 | 1.0-1.1 | 0.25-0.3 |

## Reading a profile

- A coupe's roof sits near a 1.75 m person's chest; an SUV's roof near the top of the head.
- Driver eye height: about 1.1 m in a sedan, 1.0 m in a coupe, 1.4-1.5 m in an SUV, 2.3-2.5 m in a bus or truck.
- Wheel arches leave 2-4 cm above the tire on road cars and 8-12 cm on off-road vehicles.

## Other vehicles

Write the spec first: length, width, height, wheelbase, wheel size, clearance, seat and eye height. Then a pure layout function in the shape of `carLayout`, and a measurement test like `measureCar`.

- Boats: draft (depth below the waterline) and freeboard (hull above it). A 5-6 m runabout has about 0.3-0.4 m of draft and 0.6-0.8 m of freeboard.
- Aircraft: wingspan, wing position along the fuselage, and tail height. The wing's lift center sits near the center of mass, about a quarter to a third of the way back along the wing chord.

## 2D ratios

Top-down car sprites keep a length-to-width ratio of 2.3-2.5. Side-view sprites keep wheelbase over length at 0.56-0.62.

## Sources

- SAE J1100, *Motor Vehicle Dimensions*: length, wheelbase, overhang and clearance.
- CIK-FIA *Technical Regulations* for karts: wheelbase range.
- EU Directive 96/53/EC: maximum width 2.55 m and height 4 m.
- Macey and Wardle, *H-Point: The Fundamentals of Car Design and Packaging* (2nd edition, 2014): proportions, glass share, eye points.
