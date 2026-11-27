import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFrameSampler, createQualityGovernor, frameBudgetMs, measure } from '../src/budget.js';
import { defineContracts } from '../src/contracts.js';
import { createRng } from '../src/random.js';

const nearestRank = (window: number[], q: number) => {
  const s = [...window].sort((a, b) => a - b);
  return s.length === 0 ? 0 : (s[Math.min(s.length, Math.max(1, Math.ceil(q * s.length))) - 1] as number);
};

describe('frame sampler', () => {
  it('matches a sorted brute force over the rolling window', () => {
    const ms = fc.double({ min: 0, max: 200, noNaN: true });
    fc.assert(fc.property(fc.integer({ min: 1, max: 64 }), fc.array(ms, { maxLength: 300 }), fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 5 }), (capacity, samples, qs) => {
      const s = createFrameSampler(capacity);
      for (const v of samples) s.push(v);
      const window = samples.slice(Math.max(0, samples.length - capacity));
      expect(s.count).toBe(window.length);
      for (const q of [0, 0.5, 0.95, 0.99, 1, ...qs]) expect(s.quantile(q)).toBe(nearestRank(window, q));
      const mean = window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0;
      expect(s.mean()).toBeCloseTo(mean, 6);
      expect(s.last).toBe(window.at(-1) ?? 0);
      const st = s.stats();
      expect([st.p50, st.p95, st.p99, st.min, st.max]).toEqual([0.5, 0.95, 0.99, 0, 1].map((q) => nearestRank(window, q)));
    }));
  });

  it('ignores non-finite samples and reuses the stats object', () => {
    const s = createFrameSampler(4);
    s.push(NaN);
    s.push(Infinity);
    expect(s.count).toBe(0);
    expect(s.quantile(0.5)).toBe(0);
    s.push(5);
    const out = s.stats();
    expect(s.stats(out)).toBe(out);
    s.reset();
    expect(s.count).toBe(0);
  });

  it('keeps the mean exact over long runs', () => {
    const s = createFrameSampler(60), rng = createRng(3);
    for (let i = 0; i < 100_000; i++) s.push(rng.range(1, 40));
    s.push(16);
    for (let i = 0; i < 59; i++) s.push(16);
    expect(s.mean()).toBe(16);
  });
});

describe('measure', () => {
  it('reads elapsed time from the injected clock', () => {
    let t = 100;
    expect(measure(() => { t += 7.5; }, () => t)).toBe(7.5);
  });
});

describe('quality governor', () => {
  const perf = defineContracts({
    name: 'budget-test', spatial: { unit: 'meter', up: '+y', ground: 'xz' },
    simulation: { hz: 60, deterministic: true, order: ['rules'] },
    performance: { targetFps: 60, targetHardware: 'mid-range phone', simulationBudgetMs: 4, quality: ['high', 'medium', 'low'] },
  }).performance;

  it('takes its budget and levels from the performance contract', () => {
    const g = createQualityGovernor({ performance: perf });
    expect(g.targetMs).toBeCloseTo(frameBudgetMs(perf), 9);
    expect(g.levels).toEqual(['high', 'medium', 'low']);
    expect(createQualityGovernor({ levels: ['a'], targetFps: 30 }).targetMs).toBeCloseTo(33.333, 3);
    expect(() => createQualityGovernor({ levels: [], targetMs: 16 })).toThrow();
    expect(() => createQualityGovernor({ levels: ['a'] })).toThrow();
  });

  it('steps down after downAfter over-budget windows and up after upAfter under-budget windows', () => {
    const changes: string[] = [];
    const g = createQualityGovernor({ levels: ['high', 'medium', 'low'], targetMs: 16, downAfter: 3, upAfter: 5, hysteresis: 0.25, onChange: (l) => changes.push(l) });
    g.judge(20); g.judge(20);
    expect(g.level).toBe('high');
    g.judge(20);
    expect(g.level).toBe('medium');
    for (let i = 0; i < 3; i++) g.judge(20);
    expect(g.level).toBe('low');
    for (let i = 0; i < 10; i++) g.judge(20);
    expect(g.level).toBe('low');
    for (let i = 0; i < 4; i++) g.judge(10);
    expect(g.level).toBe('low');
    g.judge(10);
    expect(g.level).toBe('medium');
    expect(changes).toEqual(['medium', 'low', 'medium']);
  });

  it('a window in the hysteresis band or a short spike breaks the streak', () => {
    const g = createQualityGovernor({ levels: ['high', 'low'], targetMs: 16, downAfter: 3, upAfter: 3, hysteresis: 0.25, start: 1 });
    for (const ms of [10, 10, 14, 10, 10, 20, 10, 10]) g.judge(ms);
    expect(g.level).toBe('low');
    g.judge(10);
    expect(g.level).toBe('high');
    for (const ms of [20, 20, 15, 20, 20, 9, 20, 20]) g.judge(ms);
    expect(g.level).toBe('high');
  });

  it('never changes level on a noisy signal that stays in band', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 0, max: 2 }), (seed, start) => {
      const rng = createRng(seed);
      let changes = 0;
      const g = createQualityGovernor({ performance: perf, start, hysteresis: 0.2, onChange: () => changes++ });
      const lo = g.targetMs * 0.8, hi = g.targetMs;
      for (let i = 0; i < 30 * 200; i++) g.frame(rng.range(lo, hi));
      expect(changes).toBe(0);
      expect(g.index).toBe(start);
    }));
  });

  it('backs off retrying a level that cannot hold the budget, instead of oscillating', () => {
    const cost: Record<string, number> = { high: 22, medium: 12, low: 6 }, rng = createRng(9), probes: number[] = [];
    const g = createQualityGovernor({ performance: perf, onChange: (l) => { if (l === 'high') probes.push(frame); } });
    let frame = 0, highLate = 0;
    for (; frame < 30 * 2000; frame++) {
      g.frame((cost[g.level] ?? 0) + rng.range(-1, 1));
      if (frame >= 30 * 1000 && g.level === 'high') highLate++;
    }
    expect(g.level).toBe('medium');
    expect(highLate / (30 * 1000)).toBeLessThan(0.05);
    const gaps = probes.slice(1).map((p, i) => p - (probes[i] as number));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual((gaps[i - 1] as number) - 30);
    const naive = createQualityGovernor({ performance: perf, maxBackoff: 1 });
    let naiveHigh = 0;
    for (let f = 0; f < 30 * 1000; f++) { naive.frame((cost[naive.level] ?? 0) + rng.range(-1, 1)); if (naive.level === 'high') naiveHigh++; }
    expect(naiveHigh / (30 * 1000)).toBeGreaterThan(0.2);
  });

  it('set forces a level and ignores unknown ones', () => {
    const g = createQualityGovernor({ levels: ['high', 'low'], targetMs: 16 });
    g.set('low');
    expect(g.index).toBe(1);
    g.set('ultra' as 'high');
    g.set(5);
    expect(g.level).toBe('low');
    g.set(0);
    expect(g.level).toBe('high');
  });
});
