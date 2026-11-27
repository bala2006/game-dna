# Scenarios and property tests

## Contents

- Harness contract
- Scenario JSON
- Assertions
- Running scenarios in Vitest
- Seeded faults
- Property tests
- Reproducibility and metrics
- Complete example

## Harness contract

`runScenario` from `@gamedna/core` drives any `GameHarness`: `tickRateHz`, `reset(seed, params, setup)`, `setInput(key, down)`, `step()` (exactly one tick), `snapshot()` (a flat record of string, number, boolean or null, keyed like `player.x`), `drainEvents()` and `currentTick()`. `FixedStepSimulation` from `@gamedna/starter` implements all of it; a subclass writes `onReset`, `update(input)` and `snapshot`, and calls `this.emit(type, data)` for events. Expose in `snapshot()` every field an assertion reads.

## Scenario JSON

One file per scenario in `.gamedna/scenarios/<id>.json`, parsed with `ScenarioSchema`:

| Field | Rule |
|---|---|
| `id` | kebab-case, 2 to 63 characters |
| `description` | at most 300 characters: what the player does and what must hold |
| `seed` | integer, 0 to 2147483647 |
| `maxTicks` | 1 to 36000, which is 10 minutes at 60 Hz |
| `setup` | flat values passed to `reset`, such as `{ "level": "lab-flat" }` |
| `params` | tuning overrides with dotted lowerCamel keys such as `movement.jumpVelocity` |
| `inputs` | `{ "tick", "key", "down" }` transitions, at most 5000; keys are lowerCamel, at most 20 characters |
| `checkpoints` | up to 8 ticks where a browser run may take screenshots |
| `sampleEvery` | 1 to 60 ticks; past 6000 samples the stride widens and `limitations` says so |
| `assertions` | at most 40 |
| `tags`, `detectsFault` | labels, and the fault parameter this scenario must catch |

An input at `tick: t` is applied just before the step from tick t to t + 1. Tick 0 is held on the very first step; a press at 20 and release at 22 is held for exactly two steps. Transitions only: a key stays down until its `down: false`.

## Assertions

| `type` | Passes when | Other outcomes |
|---|---|---|
| `eventCount` | the number of `event` events, filtered by `where`, satisfies `op value` | the failure tick is the first event past an upper bound |
| `stateAlways` | every sample from `fromTick` satisfies `path op value` | `unsupported` when `path` is not in the snapshot, `not_tested` with no samples |
| `stateAtEnd` | the final snapshot satisfies `path op value` | `unsupported` when `path` is missing |
| `minEventInterval` | the shortest gap between `event`s is at least `minMs`, or the numeric parameter named by `minMsFromParam`, floored to ticks | `not_tested` with fewer than two events |
| `eventUnique` | no two `event`s share the value of `data[key]` | `not_tested` with no events |

`op` is `eq`, `neq`, `lt`, `lte`, `gt` or `gte`; the ordered ones need numbers. Several assertions may share one `checkId`; the check takes the worst status.

## Running scenarios in Vitest

Follow `apps/gravity-shift/tests/scenarios.test.ts`: read every JSON file in `.gamedna/scenarios`, parse it with `ScenarioSchema`, run `runScenario(new Sim(), scenario, resolveRunParameters(tuning, scenario))`, and expect the list of assertions whose status is not `passed` to equal `[]`, printed with `JSON.stringify` so CI shows the tick and observed value.

## Seeded faults

Declare the switch in `.gamedna/project.json` under `parameters` with `"type": "boolean", "fault": true`, and read it in the sim like any parameter. The test reruns the scenario with `{ [scenario.detectsFault]: true }` and expects `run.status` to be `failed` and `run.firstFailure.checkId` to be the constraint. Tuning code validates overrides with `checkParameterOverrides(project.parameters, overrides)`, which rejects fault and protected keys unless `allowFault` or `allowProtected` is set.

## Property tests

- Action arbitrary: `fc.record({ key: fc.constantFrom(...KEYS), down: fc.boolean(), hold: fc.integer({ min: 0, max: 12 }) })` in arrays of up to 60 to 80, plus `fc.integer({ min: 0, max: 10_000 })` for the seed and `fc.constantFrom(...)` for the level.
- Check the invariant after every `step()`, not only at the end: a health floor broken for one tick is still a bug.
- Reset per-run bookkeeping when the sim emits its restart event, as `apps/neon-survivor/tests/rules.property.test.ts` does with `runReset`.
- When fast-check reports a shrunk counterexample, copy it into a new scenario JSON so it stays a regression test.

## Reproducibility and metrics

- `assessReproducibility(runs)` over 3 to 5 runs returns `stable`, `unstable` with the first divergent tick and field, or `single_run`.
- `compareRuns(a, b, { tolerances: { 'player.x': 0.001 } })` allows a stated float tolerance and reports `within_tolerance`.
- `computeMetrics(run, project.metrics)` measures jump apex, time to apex, airtime, time to 95 percent speed and stop time (movement), and attack intervals and hit-to-feedback latency (combat). Each value carries its resolution, one tick or 16.7 ms at 60 Hz; report it with the value.

## Complete example

```ts
// check: compile
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ScenarioSchema, assessReproducibility, runScenario, type FlatState } from '@gamedna/core';
import { FixedStepSimulation, num, type InputFrame } from '@gamedna/starter';

class Walker extends FixedStepSimulation {
  x = 0;
  constructor() { super({ 'movement.step': 2 }); }
  protected onReset(): void { this.x = 0; }
  protected update(input: InputFrame): void {
    if (input.wasPressed('right')) this.emit('start', { tick: this.tick });
    if (input.isDown('right')) this.x += num(this.params, 'movement.step', 2);
  }
  snapshot(): FlatState { return { 'player.x': this.x }; }
}

const walkRight = ScenarioSchema.parse({
  id: 'walk-right',
  description: 'Hold right for 30 ticks, then release. The walker moves 60 units and starts once.',
  seed: 1,
  maxTicks: 60,
  inputs: [{ tick: 0, key: 'right', down: true }, { tick: 30, key: 'right', down: false }],
  assertions: [
    { type: 'stateAtEnd', checkId: 'MOVE-01', path: 'player.x', op: 'eq', value: 60 },
    { type: 'eventCount', checkId: 'MOVE-01', event: 'start', op: 'eq', value: 1 },
  ],
});

describe('walker', () => {
  it('passes walk-right and replays identically', () => {
    const runs = Array.from({ length: 3 }, () => runScenario(new Walker(), walkRight));
    expect(runs.map((r) => r.status)).toEqual(['passed', 'passed', 'passed']);
    expect(assessReproducibility(runs).status).toBe('stable');
  });

  it('never moves backward under random input', () => {
    const action = fc.record({ key: fc.constantFrom('left', 'right'), down: fc.boolean(), hold: fc.integer({ min: 0, max: 12 }) });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.array(action, { maxLength: 60 }), (seed, actions) => {
        const sim = new Walker();
        sim.reset(seed, {});
        let last = 0;
        for (const a of actions) {
          sim.setInput(a.key, a.down);
          for (let i = 0; i <= a.hold; i++) {
            sim.step();
            const x = sim.snapshot()['player.x'];
            expect(typeof x === 'number' && x >= last).toBe(true);
            last = typeof x === 'number' ? x : last;
          }
        }
      }),
      { numRuns: 120, seed: 42 },
    );
  });
});
```
