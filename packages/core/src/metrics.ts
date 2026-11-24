import type { CombatMetricsConfig, MetricFamily, MovementMetricsConfig } from './schemas.js';
import type { ScenarioRun } from './scenario.js';

export interface MetricValue {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  method: string;
  /** Measurement resolution, e.g. one simulation tick for timings. */
  resolution: string;
  /** Number of observations the value is based on. */
  n: number;
}

const round = (v: number, digits = 2): number => Math.round(v * 10 ** digits) / 10 ** digits;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function computeMetrics(run: ScenarioRun, families: readonly MetricFamily[]): MetricValue[] {
  const out: MetricValue[] = [];
  for (const f of families) {
    if (f.family === 'movement') out.push(...movementMetrics(run, f));
    else out.push(...combatMetrics(run, f));
  }
  return out;
}

export function movementMetrics(run: ScenarioRun, cfg: MovementMetricsConfig): MetricValue[] {
  const msPerTick = 1000 / run.tickRateHz;
  const tickRes = `±1 tick (${round(msPerTick)} ms)`;
  const metrics: MetricValue[] = [];
  const sampleAt = (tick: number) => run.samples.find((s) => s.tick >= tick);

  // Jump arc: first jump event, apex against gravity, landing.
  const jump = run.events.find((e) => e.type === cfg.jumpEvent);
  let apexHeight: number | null = null;
  let timeToApex: number | null = null;
  let airtime: number | null = null;
  if (jump) {
    const startSample = run.samples.filter((s) => s.tick < jump.tick).at(-1) ?? sampleAt(jump.tick);
    const y0 = num(startSample?.state[cfg.y]);
    const g = cfg.gravitySign ? (num(startSample?.state[cfg.gravitySign]) ?? 1) : 1;
    const land = run.events.find((e) => e.type === cfg.landEvent && e.tick > jump.tick);
    const endTick = land?.tick ?? run.ticks;
    if (y0 !== null) {
      let best = 0;
      let bestTick = jump.tick;
      for (const s of run.samples) {
        if (s.tick < jump.tick || s.tick > endTick) continue;
        const y = num(s.state[cfg.y]);
        if (y === null) continue;
        const h = (y0 - y) * g;
        if (h > best) {
          best = h;
          bestTick = s.tick;
        }
      }
      apexHeight = round(best);
      timeToApex = round((bestTick - jump.tick) * msPerTick);
    }
    if (land) airtime = round((land.tick - jump.tick) * msPerTick);
  }
  metrics.push(
    { id: 'jump.apexHeight', label: 'Jump apex height', value: apexHeight, unit: 'px', method: 'Max displacement against gravity between first jump and next landing', resolution: `sampled every ${sampleStride(run)} tick(s)`, n: jump ? 1 : 0 },
    { id: 'jump.timeToApex', label: 'Time to apex', value: timeToApex, unit: 'ms', method: 'Ticks from jump event to apex sample', resolution: tickRes, n: jump ? 1 : 0 },
    { id: 'jump.airtime', label: 'Airtime', value: airtime, unit: 'ms', method: 'Ticks from jump event to next landing event', resolution: tickRes, n: airtime === null ? 0 : 1 },
  );

  // Horizontal acceleration: time from first motion to 95% of observed top speed.
  let maxSpeed = 0;
  for (const s of run.samples) maxSpeed = Math.max(maxSpeed, Math.abs(num(s.state[cfg.vx]) ?? 0));
  let accelTime: number | null = null;
  if (maxSpeed > 0) {
    const firstMove = run.samples.find((s) => Math.abs(num(s.state[cfg.vx]) ?? 0) > 0);
    const reached = run.samples.find((s) => Math.abs(num(s.state[cfg.vx]) ?? 0) >= maxSpeed * 0.95);
    if (firstMove && reached) accelTime = round((reached.tick - firstMove.tick) * msPerTick);
  }
  metrics.push(
    { id: 'run.topSpeed', label: 'Observed top speed', value: maxSpeed > 0 ? round(maxSpeed) : null, unit: 'px/s', method: `Max |${cfg.vx}| over samples`, resolution: 'exact per sample', n: run.samples.length },
    { id: 'run.timeTo95', label: 'Time to 95% top speed', value: accelTime, unit: 'ms', method: 'First moving sample to first sample at >= 95% of observed top speed', resolution: tickRes, n: accelTime === null ? 0 : 1 },
  );

  // Stopping: from release of the move key to zero horizontal speed.
  const release = run.inputs.find((i) => i.key === cfg.moveKey && !i.down);
  let stopTime: number | null = null;
  let stopDistance: number | null = null;
  if (release) {
    const at = run.samples.filter((s) => s.tick <= release.tick).at(-1);
    const stopped = run.samples.find((s) => s.tick > release.tick && Math.abs(num(s.state[cfg.vx]) ?? 1) < 0.5);
    const x0 = num(at?.state[cfg.x]);
    const x1 = num(stopped?.state[cfg.x]);
    if (stopped) stopTime = round((stopped.tick - release.tick) * msPerTick);
    if (stopped && x0 !== null && x1 !== null) stopDistance = round(Math.abs(x1 - x0));
  }
  metrics.push(
    { id: 'run.stopTime', label: 'Stop time after release', value: stopTime, unit: 'ms', method: `Release of "${cfg.moveKey}" to |vx| < 0.5 px/s`, resolution: tickRes, n: stopTime === null ? 0 : 1 },
    { id: 'run.stopDistance', label: 'Stopping distance', value: stopDistance, unit: 'px', method: 'Horizontal travel between release and stop', resolution: `sampled every ${sampleStride(run)} tick(s)`, n: stopDistance === null ? 0 : 1 },
  );
  return metrics;
}

export function combatMetrics(run: ScenarioRun, cfg: CombatMetricsConfig): MetricValue[] {
  const msPerTick = 1000 / run.tickRateHz;
  const tickRes = `±1 tick (${round(msPerTick)} ms)`;
  const attacks = run.events.filter((e) => e.type === cfg.attackEvent).map((e) => e.tick);
  const intervals = attacks.slice(1).map((t, i) => (t - (attacks[i] as number)) * msPerTick);
  const hits = run.events.filter((e) => e.type === cfg.hitEvent);
  const latencies: number[] = [];
  for (const hit of hits) {
    const hitId = hit.data['hitId'];
    const fb = run.events.find((e) => cfg.feedbackEvents.includes(e.type) && e.tick >= hit.tick && (hitId === undefined || e.data['hitId'] === hitId));
    if (fb) latencies.push((fb.tick - hit.tick) * msPerTick);
  }
  const metrics: MetricValue[] = [
    { id: 'combat.attacks', label: 'Attacks performed', value: attacks.length, unit: 'count', method: `Count of "${cfg.attackEvent}" events`, resolution: 'exact', n: attacks.length },
    { id: 'combat.minAttackInterval', label: 'Shortest attack interval', value: intervals.length ? round(Math.min(...intervals)) : null, unit: 'ms', method: 'Min gap between consecutive attack events', resolution: tickRes, n: intervals.length },
    { id: 'combat.medianAttackInterval', label: 'Median attack interval', value: median(intervals) === null ? null : round(median(intervals) as number), unit: 'ms', method: 'Median gap between consecutive attack events', resolution: tickRes, n: intervals.length },
    { id: 'combat.hits', label: 'Hits registered', value: hits.length, unit: 'count', method: `Count of "${cfg.hitEvent}" events`, resolution: 'exact', n: hits.length },
    { id: 'combat.feedbackLatency', label: 'Hit to first feedback', value: median(latencies) === null ? null : round(median(latencies) as number), unit: 'ms', method: `Median ticks from hit to first of ${cfg.feedbackEvents.join('/')} with the same hitId`, resolution: tickRes, n: latencies.length },
  ];
  for (const kind of cfg.feedbackEvents) {
    const count = run.events.filter((e) => e.type === kind).length;
    metrics.push({ id: `combat.feedback.${kind}`, label: `"${kind}" feedback events`, value: count, unit: 'count', method: `Count of "${kind}" events`, resolution: 'exact', n: count });
  }
  if (cfg.hitstopField) {
    const frozen = run.samples.filter((s) => (num(s.state[cfg.hitstopField as string]) ?? 0) > 0).length * sampleStride(run);
    metrics.push({ id: 'combat.hitstopTotal', label: 'Total hit-stop time', value: round(frozen * msPerTick), unit: 'ms', method: `Sampled ticks with ${cfg.hitstopField} > 0`, resolution: tickRes, n: hits.length });
  }
  return metrics;
}

function sampleStride(run: ScenarioRun): number {
  if (run.samples.length < 2) return 1;
  return Math.max(1, (run.samples[1] as { tick: number }).tick - (run.samples[0] as { tick: number }).tick);
}

export interface MetricRange {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  min: number | null;
  max: number | null;
  runs: number;
  resolution: string;
  method: string;
}

/** Aggregate repeated-run metrics into value plus observed range (the reported uncertainty). */
export function aggregateMetrics(perRun: readonly MetricValue[][]): MetricRange[] {
  const first = perRun[0] ?? [];
  return first.map((m) => {
    const values = perRun.map((r) => r.find((x) => x.id === m.id)?.value).filter((v): v is number => typeof v === 'number');
    return {
      id: m.id,
      label: m.label,
      unit: m.unit,
      value: m.value,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      runs: perRun.length,
      resolution: m.resolution,
      method: m.method,
    };
  });
}
