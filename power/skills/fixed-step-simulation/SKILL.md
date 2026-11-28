---
name: fixed-step-simulation
description: Tick rate, accumulator, integration order, render interpolation, determinism and seeded randomness. Use when speed or jump height changes with frame rate, motion stutters on fast displays, or replays diverge. Not for contacts (collision-and-response), movement tuning (character-movement) or frame cost (performance-budgets).
license: MIT
metadata:
  owner: simulation
  topics: fixed timestep, numerical integration, render interpolation, determinism, seeded randomness, simulation and presentation separation
  engines: portable, three@0.170, phaser@3.90
  kit: kit/loop, kit/random, kit/contracts, starter, core
---

# Fixed-step simulation

## Scope

Owns how real time becomes ticks, how a tick advances state, how drawing is smoothed between ticks, and what makes runs identical. When bodies sink into or tunnel through geometry, use `collision-and-response`; when ticks fit but frames do not, use `performance-budgets`; for the order of systems inside a tick, use `game-architecture`.

## Decisions

- **Rate.** 60 Hz by default; 120 Hz only when sub-stepping the fast movers is not enough; 30 Hz for slow simulations with hundreds of agents. Declare it in the simulation contract and convert durations once at reset with `ticksFor` or `msToTicks`. Timers are integer tick counters.
- **Accumulator.** Clamp frame delta to 250 ms, run at most 5 ticks per frame, drop the rest. Below 12 fps the game slows instead of spiralling. Ticks per frame times tick cost must fit `simulationBudgetMs`, typically 2 ms.
- **Integration.** Semi-implicit Euler: velocity first, then position from the new velocity. It keeps springs stable and lands a jump apex about `v·dt/2` below `v²/2g` (85.8 px instead of 90.1 for 520 px/s and 1500 px/s²). Explicit Euler overshoots by as much. Write decay as `Math.pow(keep, dt * 60)` or `ease(dt, tau)`. Error tables and bit-exact rules are in `references/integration.md`.
- **Interpolate, never extrapolate.** Copy each mover to `prev` before its step; draw `prev + (cur - prev) * alpha`, angles via `wrapAngle` of the difference. One tick of latency buys smooth motion on 120 and 144 Hz displays. Set `prev = cur` on teleport and respawn.
- **Determinism.** Rules read state, the tick's input and seeded streams only. One stream per consumer from the root seed (`deriveSeed(seed, 'loot')`) so a new draw in one system does not shift another; presentation gets its own stream.
- **Separation.** `tick` samples input once (presses latched) and writes simulation state; `render` reads it and writes scene objects, sound and effects. Events leave through a queue `render` drains. Name each transform's writer in `transformOwners`.
- **Pause** stops ticking and resets the clock. Pause on `onPageHidden`.

## Mistakes

- Rules scaled by frame delta in `requestAnimationFrame` or Phaser's `update`: speed and jump height change at 144 Hz.
- Periodic stutter on some entities: `prev` captured after the step or not at all.
- Reduced motion changes enemy spawns: effects draw from the rules' `Rng`.
- Falling through the floor after unpausing: the accumulator kept the paused time.
- Slow motion or hit-stop by shrinking `dt`: arcs and collisions change. Skip whole ticks.

## Reuse

- `@gamedna/kit/loop`: `runFixedStep({ hz, maxStepsPerFrame, tick, render })` when the game owns the frame; `FixedStepClock` (`advance`, `alpha`, `reset`) when an engine does; `onPageHidden`.
- `@gamedna/kit/random`: `createRng`, `restoreRng(rng.state())`, `deriveSeed`, `ease`, `wrapAngle`.
- `@gamedna/kit/contracts`: `defineContracts` (`simulation.hz`, `order`), `stepSeconds`, `ticksFor`.
- `@gamedna/starter`: `FixedStepSimulation` reseeds `rng`, latches input and buffers events for `runScenario`.
- `@gamedna/core`: `runScenario`, `assessReproducibility`, `compareRuns`.

The game keeps its state layout and update order.

## Engines

- three.js 0.170: read `references/three.md` when the loop runs from `renderer.setAnimationLoop` or meshes and camera need interpolation.
- Phaser 3.90: read `references/phaser.md` when the simulation runs in a `SimScene` or beside Arcade Physics.

## Verify

- Five same-seed runs give `assessReproducibility(runs).status === 'stable'`.
- `FixedStepClock` fed 6.94 ms, 16.67 ms and jittered deltas of equal total runs tick counts within one of each other.
- A run saved halfway (with `rng.state()`) and reloaded ends like an uninterrupted one.
- Rule code contains no `Math.random`, `Date.now`, `performance.now` or frame `delta`.
