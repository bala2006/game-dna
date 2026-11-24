import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ScenarioSchema, runScenario, worstStatus, assessReproducibility, compareRuns, createRng, deriveSeed, type ScenarioInput } from '../src/index.js';
import { CounterHarness } from './helpers.js';

const base = (over: Partial<ScenarioInput> = {}) =>
  ScenarioSchema.parse({
    id: 'counter',
    description: 'test',
    seed: 1,
    maxTicks: 30,
    inputs: [
      { tick: 2, key: 'inc', down: true },
      { tick: 3, key: 'inc', down: false },
      { tick: 10, key: 'inc', down: true },
      { tick: 11, key: 'inc', down: false },
    ],
    assertions: [],
    ...over,
  });

describe('prng', () => {
  it('is deterministic per seed and stays in range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const a = createRng(seed);
        const b = createRng(seed);
        for (let i = 0; i < 20; i++) {
          const v = a.next();
          expect(v).toBe(b.next());
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });
  it('derives distinct child seeds per label', () => {
    expect(deriveSeed(5, 'a')).not.toBe(deriveSeed(5, 'b'));
    expect(deriveSeed(5, 'a')).toBe(deriveSeed(5, 'a'));
  });
});

describe('scenario schema', () => {
  it('rejects unbounded tick limits and bad IDs', () => {
    expect(ScenarioSchema.safeParse({ ...base(), maxTicks: 10_000_000 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...base(), id: 'Bad Id' }).success).toBe(false);
  });
});

describe('runScenario', () => {
  it('records inputs, events with ticks, and passes satisfied assertions', () => {
    const run = runScenario(
      new CounterHarness(),
      base({
        assertions: [
          { type: 'eventCount', checkId: 'CNT-01', event: 'inc', op: 'eq', value: 2 },
          { type: 'stateAtEnd', checkId: 'CNT-02', path: 'count', op: 'eq', value: 2 },
          { type: 'stateAlways', checkId: 'CNT-03', path: 'count', op: 'lte', value: 2 },
          { type: 'eventUnique', checkId: 'CNT-04', event: 'inc', key: 'id' },
          { type: 'minEventInterval', checkId: 'CNT-05', event: 'inc', minMs: 100 },
        ],
      }),
    );
    expect(run.status).toBe('passed');
    expect(run.inputs).toHaveLength(4);
    expect(run.events.map((e) => e.tick)).toEqual([3, 11]);
    expect(run.ticks).toBe(30);
    expect(run.stepMode).toBe('fixed-step');
  });

  it('reports the first failure with its tick', () => {
    const run = runScenario(new CounterHarness(), base({ assertions: [{ type: 'eventCount', checkId: 'CNT-01', event: 'inc', op: 'lte', value: 1 }] }));
    expect(run.status).toBe('failed');
    expect(run.firstFailure?.tick).toBe(11);
  });

  it('marks missing state fields unsupported instead of passing', () => {
    const run = runScenario(new CounterHarness(), base({ assertions: [{ type: 'stateAtEnd', checkId: 'CNT-01', path: 'missing.field', op: 'eq', value: 1 }] }));
    expect(run.status).toBe('unsupported');
  });

  it('marks checks without evidence as not_tested', () => {
    const run = runScenario(new CounterHarness(), base({ inputs: [], assertions: [{ type: 'eventUnique', checkId: 'CNT-01', event: 'inc', key: 'id' }] }));
    expect(run.checks[0]?.status).toBe('not_tested');
  });

  it('reads cooldown thresholds from run parameters', () => {
    const s = base({ params: { 'counter.cooldownMs': 500 }, assertions: [{ type: 'minEventInterval', checkId: 'CNT-01', event: 'inc', minMsFromParam: 'counter.cooldownMs' }] });
    expect(runScenario(new CounterHarness(), s).status).toBe('failed');
  });

  it('applies parameter overrides', () => {
    const run = runScenario(new CounterHarness(), base(), { 'counter.step': 5 });
    expect(run.finalState['count']).toBe(10);
  });

  it('worstStatus never hides a failure', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('passed', 'not_tested', 'unsupported', 'unstable', 'failed' as const)), (statuses) => {
        const w = worstStatus(statuses);
        if (statuses.includes('failed')) expect(w).toBe('failed');
        if (statuses.length === 0) expect(w).toBe('not_tested');
      }),
    );
  });
});

describe('trace comparison and reproducibility', () => {
  it('identical runs compare exact and are stable', () => {
    const runs = [1, 2, 3, 4, 5].map(() => runScenario(new CounterHarness(), base()));
    expect(compareRuns(runs[0]!, runs[1]!).status).toBe('exact');
    expect(assessReproducibility(runs).status).toBe('stable');
  });
  it('noisy runs are unstable unless within tolerance', () => {
    const noisy = () => {
      const h = new CounterHarness();
      h.noise = 0.01;
      return runScenario(h, base());
    };
    const runs = [noisy(), noisy(), noisy()];
    expect(assessReproducibility(runs).status).toBe('unstable');
    const tolerant = assessReproducibility(runs, { tolerances: { count: 0.05 } });
    expect(tolerant.status).toBe('stable');
    expect(tolerant.comparisons[0]?.status).toBe('within_tolerance');
  });
  it('different inputs diverge at the first differing event', () => {
    const a = runScenario(new CounterHarness(), base());
    const b = runScenario(new CounterHarness(), base({ inputs: [{ tick: 4, key: 'inc', down: true }] }));
    const c = compareRuns(a, b);
    expect(c.status).toBe('diverged');
    expect(c.firstDivergence?.kind).toBe('event');
  });
});
