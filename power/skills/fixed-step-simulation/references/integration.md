# Integration, damping and determinism in detail

## Contents

- Integrators compared on one jump
- Springs and damping
- Converting per-tick constants
- Sub-steps instead of a higher rate
- Bit-exact determinism
- A frame-rate independence test

## Integrators compared on one jump

Gravity Shift's jump: 520 px/s take-off, 1500 px/s² gravity. The continuous apex is `v²/2g` = 90.1 px at 0.347 s.

| Integrator | Step | Apex at 30 Hz | 60 Hz | 120 Hz |
|---|---|---|---|---|
| Explicit Euler | `x += v·dt; v += a·dt` | 99.0 px | 94.5 px | 92.3 px |
| Semi-implicit Euler | `v += a·dt; x += v·dt` | 81.7 px | 85.8 px | 88.0 px |
| Exact for constant `a` | `x += v·dt + ½a·dt²; v += a·dt` | 90.0 px | 90.1 px | 90.1 px |

The exact step is exact at every tick; its sampled apex at 30 Hz is 90.0 px only because no tick lands on the true peak.

- The error is about `v·dt/2`, so it halves when the rate doubles. Changing the tick rate of a tuned game changes every arc: retune, or use the exact step for ballistic bodies.
- The Kit controllers and `integrate` in `@gamedna/kit/steering` use semi-implicit Euler. Measure arcs with the jump metrics; do not trust the closed form to better than `v·dt`.
- Verlet (`x' = 2x - x_prev + a·dt²`) suits ropes, cloth and ragdolls where constraints are solved by moving positions. It has no explicit velocity, so friction and speed caps are awkward.

## Springs and damping

For a spring `a = -ω²·x - c·v` with natural frequency `ω` in rad/s:

- Explicit Euler grows an undamped spring by `sqrt(1 + (ω·dt)²)` per step at any rate. Never use it for springs.
- Semi-implicit Euler is stable while `ω·dt < 2`: at 60 Hz that is `ω < 120` rad/s, about 19 Hz. Camera and UI springs at 2 to 8 Hz are far inside it.
- Strong damping as `v *= 1 - c·dt` flips sign once `c·dt > 1` and oscillates. Use the exact decay `v *= Math.exp(-c·dt)`.
- A critically damped follow (`ζ = 1`) settles to 2 percent in about `5.8 / ω` seconds.

## Converting per-tick constants

A multiplier `keep` applied every tick at 60 Hz:

- half-life in ticks = `ln 0.5 / ln keep`; time constant in seconds = `-1 / (60 · ln keep)`.
- `keep = 0.9`: half-life 6.6 ticks (110 ms), time constant 158 ms. `keep = 0.93`: 9.6 ticks (160 ms).
- The same decay at another step: `Math.pow(keep, dt * 60)`. `stepVehicle` does this for grip.
- Smoothing toward a target: `x += (target - x) * ease(dt, tau)` reaches 63 percent after `tau` seconds at any rate.

## Sub-steps instead of a higher rate

When one fast body needs finer steps, split its move, not the whole simulation: `n = ceil(speed·dt / (0.5 · smallestSize))` sub-steps. `moveAndCollideTiles` in `@gamedna/kit/collision` already sub-steps. Raising the global rate multiplies the cost of every system, every AI agent and every timer.

## Bit-exact determinism

- `+ - * /` and `Math.sqrt` are correctly rounded everywhere. `Math.sin`, `cos`, `atan2`, `exp`, `pow` and `hypot` are implementation-defined and may differ between V8, SpiderMonkey and JavaScriptCore in the last bit.
- Same-engine replays, scenario tests and saves are exact. Cross-browser lockstep multiplayer needs rules without transcendental functions (tables or polynomials built from basic operations) or fixed-point integers.
- `createRng` uses only `Math.imul` and shifts, so its sequence is identical everywhere.
- Object keys that look like integers iterate in numeric order before other keys. Keep entities in arrays or `Map`s, never in objects keyed by id.
- `Array.prototype.sort` is stable, but a comparator that returns `NaN` or contradicts itself gives engine-specific orders. Break ties by id.

## A frame-rate independence test

```ts
// check: compile
import { FixedStepClock } from '@gamedna/kit/loop';
import { createRng } from '@gamedna/kit/random';

/** Ticks a 60 Hz clock runs for a list of frame times in milliseconds. */
function countTicks(frames: readonly number[]): number {
  const clock = new FixedStepClock(60, 5);
  let ticks = 0;
  for (const ms of frames) ticks += clock.advance(ms);
  return ticks;
}

const rng = createRng(7);
const steady = Array.from({ length: 600 }, () => 1000 / 60);
const fast = Array.from({ length: 1440 }, () => 1000 / 144);
// Pairs of frames that sum to two 60 Hz frames, so the total time is unchanged.
const rough = Array.from({ length: 300 }, () => rng.range(-6, 6)).flatMap((j) => [1000 / 60 + j, 1000 / 60 - j]);

for (const frames of [fast, rough]) {
  if (Math.abs(countTicks(frames) - countTicks(steady)) > 1) throw new Error('tick count depends on frame rate');
}
```
