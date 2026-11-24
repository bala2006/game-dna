import type { Primitive } from './schemas.js';
import type { ScenarioRun } from './scenario.js';

export interface Divergence {
  kind: 'sample' | 'event' | 'length';
  tick: number;
  field: string;
  a: Primitive | undefined;
  b: Primitive | undefined;
}

export interface TraceComparison {
  /** exact: every compared value equal. within_tolerance: numeric fields differ only within tolerances. */
  status: 'exact' | 'within_tolerance' | 'diverged';
  comparedSamples: number;
  comparedEvents: number;
  maxDelta: Record<string, number>;
  firstDivergence: Divergence | null;
}

export interface CompareOptions {
  /** Absolute tolerance per numeric state field. Fields without a tolerance are compared exactly. */
  tolerances?: Record<string, number>;
}

export function compareRuns(a: ScenarioRun, b: ScenarioRun, options: CompareOptions = {}): TraceComparison {
  const tolerances = options.tolerances ?? {};
  const maxDelta: Record<string, number> = {};
  let usedTolerance = false;
  const result = (status: TraceComparison['status'], firstDivergence: Divergence | null, samples: number, events: number): TraceComparison => ({
    status,
    comparedSamples: samples,
    comparedEvents: events,
    maxDelta,
    firstDivergence,
  });

  const n = Math.min(a.events.length, b.events.length);
  for (let i = 0; i < n; i++) {
    const ea = a.events[i]!;
    const eb = b.events[i]!;
    if (ea.type !== eb.type || ea.tick !== eb.tick || JSON.stringify(ea.data) !== JSON.stringify(eb.data)) {
      return result('diverged', { kind: 'event', tick: Math.min(ea.tick, eb.tick), field: `event[${i}]`, a: `${ea.type}@${ea.tick}`, b: `${eb.type}@${eb.tick}` }, 0, i);
    }
  }
  if (a.events.length !== b.events.length) {
    const extra = a.events[n] ?? b.events[n];
    return result('diverged', { kind: 'length', tick: extra?.tick ?? 0, field: 'events.length', a: a.events.length, b: b.events.length }, 0, n);
  }

  const m = Math.min(a.samples.length, b.samples.length);
  for (let i = 0; i < m; i++) {
    const sa = a.samples[i]!;
    const sb = b.samples[i]!;
    if (sa.tick !== sb.tick) {
      return result('diverged', { kind: 'sample', tick: sa.tick, field: 'tick', a: sa.tick, b: sb.tick }, i, n);
    }
    const fields = new Set([...Object.keys(sa.state), ...Object.keys(sb.state)]);
    for (const f of fields) {
      const va = sa.state[f];
      const vb = sb.state[f];
      if (va === vb) continue;
      const tol = tolerances[f];
      if (typeof va === 'number' && typeof vb === 'number' && tol !== undefined) {
        const d = Math.abs(va - vb);
        maxDelta[f] = Math.max(maxDelta[f] ?? 0, d);
        if (d <= tol) {
          usedTolerance = true;
          continue;
        }
      }
      return result('diverged', { kind: 'sample', tick: sa.tick, field: f, a: va, b: vb }, i, n);
    }
  }
  if (a.samples.length !== b.samples.length) {
    return result('diverged', { kind: 'length', tick: a.samples[m]?.tick ?? b.samples[m]?.tick ?? 0, field: 'samples.length', a: a.samples.length, b: b.samples.length }, m, n);
  }
  return result(usedTolerance ? 'within_tolerance' : 'exact', null, m, n);
}

export interface Reproducibility {
  status: 'stable' | 'unstable' | 'single_run';
  runs: number;
  comparisons: TraceComparison[];
  note: string;
}

/** Compare every repeated run with the first one. Any divergence marks the scenario unstable. */
export function assessReproducibility(runs: readonly ScenarioRun[], options: CompareOptions = {}): Reproducibility {
  if (runs.length < 2) {
    return { status: 'single_run', runs: runs.length, comparisons: [], note: 'Run with repeat >= 2 to measure reproducibility.' };
  }
  const first = runs[0]!;
  const comparisons = runs.slice(1).map((r) => compareRuns(first, r, options));
  const diverged = comparisons.filter((c) => c.status === 'diverged');
  const tolerant = comparisons.some((c) => c.status === 'within_tolerance');
  if (diverged.length > 0) {
    const d = diverged[0]!.firstDivergence;
    return {
      status: 'unstable',
      runs: runs.length,
      comparisons,
      note: `${diverged.length} of ${comparisons.length} repeats diverged${d ? ` (first at tick ${d.tick}, ${d.field})` : ''}.`,
    };
  }
  return {
    status: 'stable',
    runs: runs.length,
    comparisons,
    note: tolerant ? 'All repeats matched within the stated tolerances.' : 'All repeats matched exactly (events and sampled state).',
  };
}
