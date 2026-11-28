# Tire and suspension models

## Contents

- When to leave the arcade model
- Arcade grip in physical terms
- Bicycle model with slip angles
- Load transfer
- Low-speed and stiffness problems
- Spring-damper suspension

## When to leave the arcade model

`stepVehicle` treats grip as a decay of lateral velocity. It cannot produce understeer at the limit, lift-off oversteer, or a car that grips better under braking. Move to a slip-angle model only when players are meant to learn those behaviors, and keep the arcade model's outputs (`slip`, `latAccel`, `accel`) so effects and cameras do not change.

## Arcade grip in physical terms

A kept share `k` per 1/60 s is an exponential decay with time constant `τ = -1 / (60 · ln k)`:

| `k` | `τ` | Half-life | Reads as |
|---|---|---|---|
| 0.32 (Ridgeline grip) | 15 ms | 0.6 ticks | Planted road car |
| 0.6 | 33 ms | 1.4 ticks | Loose gravel |
| 0.93 (Ridgeline drift) | 230 ms | 9.6 ticks | Held drift |
| 0.98 | 825 ms | 34 ticks | Ice |

## Bicycle model with slip angles

Merge each axle into one wheel. With forward speed `u`, lateral speed `v`, yaw rate `r`, steer angle `δ`, and distances `a` (front axle) and `b` (rear axle) from the center of mass:

- Front slip angle `αf = atan2(v + a·r, u) - δ`; rear slip angle `αr = atan2(v - b·r, u)`.
- Lateral force per axle `F = -μ·Fz · sin(C · atan(B · α))` with `B` about 8 to 12 and `C` about 1.3 to 1.6. The force peaks near 6 to 10 degrees of slip for road tires and 3 to 6 degrees for racing slicks, then falls: that drop is what lets a car slide.
- Below the peak the curve is nearly linear with cornering stiffness `Cα ≈ B·C·μ·Fz` per radian, roughly 80 to 140 kN/rad per axle for a 1500 kg car.
- Equations of motion: `m·(v' + u·r) = Ff·cos δ + Fr` and `Iz·r' = a·Ff·cos δ - b·Fr`, with `Iz ≈ m·a·b` as a first guess.
- Front saturating first gives understeer, which is the safe default for most players. Rear saturating first, through a rearward weight bias or a handbrake that scales rear `μ` by 0.3 to 0.5, gives oversteer and drift.

## Load transfer

- Longitudinal: `ΔFz = m · ax · h / L`. With center-of-mass height `h` = 0.5 m and wheelbase `L` = 2.6 m, braking at 1 g moves 19 percent of the weight to the front axle. That is why braking into a corner sharpens turn-in.
- Lateral: `ΔFz = m · ay · h / track`. Because peak force grows less than linearly with load, transfer lowers the axle's total grip.
- Compute transfer from last tick's accelerations to avoid an algebraic loop.

## Low-speed and stiffness problems

- Slip angles divide by `u`. Below 3 to 5 m/s, blend to the kinematic model `r = u · tan(δ) / L`, or the car jitters while parking.
- Lateral velocity relaxes with a time constant near `m · u / (Cf + Cr)`: 0.15 s at 20 m/s for 1500 kg and 200 kN/rad in total, but under one tick at 2 m/s. Sub-step the tire model 4 to 8 times per tick, or the blend above must start higher.

## Spring-damper suspension

Only simulate it when wheel contact matters in play: jumps, bumpy off-road, wheels lifting in a roll.

- Each wheel casts down from its mount by rest length plus travel (0.1 to 0.25 m). Compression `x = rest - hitDistance`; force `F = k·x - c·x'`, clamped at zero so a spring never pulls the car down, with a stiff bump stop at full travel.
- Stiffness from ride frequency: `k = mCorner · (2π·f)²`. Road cars ride at 1 to 1.5 Hz, sports cars 1.5 to 2.5 Hz, racing cars 3 to 5 Hz. A 375 kg corner at 1.5 Hz needs about 33 kN/m.
- Damping from the ratio `ζ`: `c = 2ζ · sqrt(k · mCorner)`. Comfort 0.2 to 0.3, sport 0.4 to 0.7. The same corner at `ζ` = 0.3 needs about 2.1 kN·s/m.
- Semi-implicit Euler is stable while `ω·dt < 2`, so springs up to 19 Hz are safe at 60 Hz; real suspensions are far below that.
- For presentation-only body motion, the Kit's `animateCar` eases roll toward 0.006 rad per m/s² of lateral acceleration (about 3.4 degrees per g, capped at 0.06 rad) and pitch toward 0.004 rad per m/s² (capped at 0.035 rad).
