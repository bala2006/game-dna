/**
 * Frame budgets: rolling frame or simulation time statistics, and a governor that steps render
 * quality down when frames run long and back up when they run short. All times are milliseconds.
 * Pure: callers pass measured times in; `measure` takes an injected clock such as
 * `performance.now`. Sampling allocates nothing. Quantiles use the nearest-rank method, so each
 * one is a real sample from the window.
 */
import type { PerformanceContract } from './contracts.js';

export interface FrameStats { count: number; mean: number; p50: number; p95: number; p99: number; min: number; max: number }

export interface FrameSampler {
  /** Adds one time in ms, dropping the oldest once full. Ignores non-finite values. */
  push(ms: number): void;
  /** Smallest sample with at least `q` (0-1) of the window at or below it. 0 when empty. */
  quantile(q: number): number;
  /** Window mean, 0 when empty. */
  mean(): number;
  /** Every statistic at once, written into `out` when given. */
  stats(out?: FrameStats): FrameStats;
  reset(): void;
  readonly count: number;
  readonly capacity: number;
  /** Most recent sample, 0 when empty. */
  readonly last: number;
}

/** A rolling window of the last `capacity` samples, kept sorted so quantiles cost O(1). Push is O(capacity) with no allocation. */
export function createFrameSampler(capacity: number): FrameSampler {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('createFrameSampler needs an integer capacity of at least 1');
  const ring = new Float64Array(capacity), sorted = new Float64Array(capacity);
  let count = 0, head = 0, sum = 0;
  const lowerBound = (v: number) => {
    let lo = 0, hi = count;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if ((sorted[mid] ?? 0) < v) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const quantile = (q: number) => (count === 0 ? 0 : (sorted[Math.min(count, Math.max(1, Math.ceil(q * count))) - 1] ?? 0));
  const mean = () => (count === 0 ? 0 : sum / count);
  return {
    push(ms) {
      if (!Number.isFinite(ms)) return;
      if (count === capacity) {
        const old = ring[head] ?? 0, i = lowerBound(old);
        sorted.copyWithin(i, i + 1, count);
        count--;
        sum -= old;
      }
      ring[head] = ms;
      head = (head + 1) % capacity;
      const j = lowerBound(ms);
      sorted.copyWithin(j + 1, j, count);
      sorted[j] = ms;
      count++;
      sum += ms;
      if (head === 0) { sum = 0; for (let k = 0; k < count; k++) sum += ring[k] ?? 0; }
    },
    quantile,
    mean,
    stats(out = { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 }) {
      out.count = count;
      out.mean = mean();
      out.p50 = quantile(0.5);
      out.p95 = quantile(0.95);
      out.p99 = quantile(0.99);
      out.min = quantile(0);
      out.max = quantile(1);
      return out;
    },
    reset() { count = 0; head = 0; sum = 0; },
    get count() { return count; },
    capacity,
    get last() { return count === 0 ? 0 : (ring[(head + capacity - 1) % capacity] ?? 0); },
  };
}

/** Milliseconds per frame at the contract's target frame rate. */
export const frameBudgetMs = (perf: Pick<PerformanceContract, 'targetFps'>): number => 1000 / perf.targetFps;

/** Runs `fn` and returns how long it took in ms, read from `now` (ms), e.g. `measure(tick, () => performance.now())`. */
export function measure(fn: () => void, now: () => number): number {
  const start = now();
  fn();
  return now() - start;
}

export type QualityStatistic = 'mean' | 'p50' | 'p95' | 'p99';

export interface QualityGovernorOptions<L extends string> {
  /** Quality levels, highest first. Defaults to `performance.quality`. */
  levels?: readonly L[];
  /** Frame budget in ms. Otherwise from `targetFps` or `performance.targetFps`. */
  targetMs?: number;
  targetFps?: number;
  performance?: Pick<PerformanceContract, 'targetFps' | 'quality'>;
  /** Consecutive over-budget windows before stepping down. Default 3. */
  downAfter?: number;
  /** Consecutive under-budget windows before stepping up. Default 6. */
  upAfter?: number;
  /** A window is under budget only below `targetMs * (1 - hysteresis)`. Between that and `targetMs` it is in band and changes nothing. Default 0.2. */
  hysteresis?: number;
  /** Frames per window for `frame()`. Default 30. */
  window?: number;
  /** Window statistic `frame()` judges. Default `p95`. */
  statistic?: QualityStatistic;
  /** Largest multiple of `upAfter` that back-off reaches, so a level is still retried now and then. Default 16. */
  maxBackoff?: number;
  /** Starting level index. Default 0, the highest. */
  start?: number;
  onChange?: ((level: L, index: number) => void) | null;
}

export interface QualityGovernor<L extends string = string> {
  readonly level: L;
  /** Index into `levels`: 0 is the highest quality. */
  readonly index: number;
  readonly levels: readonly L[];
  readonly targetMs: number;
  /** Feeds one frame (or work) time in ms. Every `window` frames, judges the window statistic. Returns the current level. */
  frame(ms: number): L;
  /** Judges one window's statistic in ms directly, for callers with their own sampler. Returns the current level. */
  judge(windowMs: number): L;
  /** Forces a level, such as a player setting, and clears streaks and back-off. Ignores unknown levels. */
  set(level: L | number): void;
  /** Clears streaks, back-off and the partial window. Keeps the level. */
  reset(): void;
}

const QUANTILE: Record<Exclude<QualityStatistic, 'mean'>, number> = { p50: 0.5, p95: 0.95, p99: 0.99 };

/**
 * Steps quality down after `downAfter` consecutive over-budget windows and up after `upAfter`
 * consecutive under-budget windows; in-band windows break both streaks. When a level reached by
 * stepping up is left again within `downAfter + upAfter` windows, the wait before retrying it
 * doubles (up to `maxBackoff`), so a level that cannot hold the budget is not probed in a loop.
 */
export function createQualityGovernor<L extends string = string>({
  levels: levelsOption, targetMs: targetOption, targetFps, performance,
  downAfter = 3, upAfter = 6, hysteresis = 0.2, window = 30, statistic = 'p95', maxBackoff = 16, start = 0, onChange = null,
}: QualityGovernorOptions<L>): QualityGovernor<L> {
  const levels = levelsOption ?? (performance?.quality as readonly L[] | undefined) ?? [];
  if (levels.length === 0) throw new Error('createQualityGovernor needs at least one quality level');
  const fps = targetFps ?? performance?.targetFps;
  const targetMs = targetOption ?? (fps ? 1000 / fps : NaN);
  if (!(targetMs > 0 && Number.isFinite(targetMs))) throw new Error('createQualityGovernor needs a positive targetMs or targetFps');
  const sampler = createFrameSampler(window), backoff = levels.map(() => 1), underMs = targetMs * (1 - hysteresis);
  let index = Math.min(levels.length - 1, Math.max(0, Math.trunc(start))), over = 0, under = 0, since = 0, cameUp = false;
  const level = () => levels[index] as L;
  const change = (to: number, up: boolean) => {
    if (!up && cameUp && since <= downAfter + upAfter) backoff[index] = Math.min(maxBackoff, (backoff[index] ?? 1) * 2);
    index = to;
    cameUp = up;
    over = under = since = 0;
    onChange?.(level(), index);
  };
  const judge = (ms: number): L => {
    since++;
    if (ms > targetMs) { over++; under = 0; } else if (ms < underMs) { under++; over = 0; } else over = under = 0;
    if (over >= downAfter && index < levels.length - 1) change(index + 1, false);
    else if (index > 0 && under >= upAfter * (backoff[index - 1] ?? 1)) change(index - 1, true);
    return level();
  };
  const clear = () => { backoff.fill(1); sampler.reset(); over = under = since = 0; cameUp = false; };
  return {
    get level() { return level(); },
    get index() { return index; },
    levels,
    targetMs,
    frame(ms) {
      sampler.push(ms);
      if (sampler.count < window) return level();
      const stat = statistic === 'mean' ? sampler.mean() : sampler.quantile(QUANTILE[statistic]);
      sampler.reset();
      return judge(stat);
    },
    judge,
    set(next) {
      const i = typeof next === 'number' ? next : levels.indexOf(next);
      if (!Number.isInteger(i) || i < 0 || i >= levels.length) return;
      clear();
      if (i !== index) change(i, false);
    },
    reset: clear,
  };
}
