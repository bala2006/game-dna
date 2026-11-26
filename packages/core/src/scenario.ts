import {
  LIMITS,
  type Assertion,
  type CheckStatus,
  type ComparisonOp,
  type FlatState,
  type InputTransition,
  type ParameterValues,
  type Primitive,
  type RawEvent,
  type Scenario,
  type TraceEvent,
  type TraceSample,
} from './schemas.js';
import { advanceHarness, type AdvanceRequest, type AdvanceResult, type BridgeDriver, type BridgeParams, type StateResult } from './bridge.js';

/** What a game must provide so GameDNA can drive its simulation tick by tick. */
export interface GameHarness {
  readonly tickRateHz: number;
  reset(seed: number, params: ParameterValues, setup: Record<string, Primitive>): void;
  setInput(key: string, down: boolean): void;
  /** Advance exactly one fixed simulation tick. */
  step(): void;
  /** Sanitized flat state, e.g. { "player.x": 12, "player.alive": true }. */
  snapshot(): FlatState;
  /** Events emitted since the previous call. */
  drainEvents(): RawEvent[];
  currentTick(): number;
}

export interface AssertionResult {
  checkId: string;
  assertion: Assertion['type'];
  status: CheckStatus;
  message: string;
  observed?: Primitive;
  expected?: Primitive;
  tick?: number;
}

export interface CheckSummary {
  id: string;
  status: CheckStatus;
  observed?: string;
  tick?: number;
}

export interface ScenarioRun {
  scenarioId: string;
  seed: number;
  revision: string;
  params: ParameterValues;
  setup: Record<string, Primitive>;
  stepMode: 'fixed-step';
  tickRateHz: number;
  ticks: number;
  inputs: InputTransition[];
  samples: TraceSample[];
  events: TraceEvent[];
  finalState: FlatState;
  assertions: AssertionResult[];
  checks: CheckSummary[];
  status: CheckStatus;
  firstFailure: AssertionResult | null;
  limitations: string[];
}

const STATUS_RANK: Record<CheckStatus, number> = { passed: 0, not_tested: 1, unsupported: 2, unstable: 3, failed: 4 };

/** Combine statuses: the worst one wins, so a failure can never be hidden by a pass. */
export function worstStatus(statuses: readonly CheckStatus[]): CheckStatus {
  let worst: CheckStatus = 'passed';
  if (statuses.length === 0) return 'not_tested';
  for (const s of statuses) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return worst;
}

export function compare(observed: Primitive | undefined, op: ComparisonOp, expected: Primitive): boolean {
  if (observed === undefined) return false;
  switch (op) {
    case 'eq':
      return observed === expected;
    case 'neq':
      return observed !== expected;
    default: {
      if (typeof observed !== 'number' || typeof expected !== 'number') return false;
      if (op === 'lt') return observed < expected;
      if (op === 'lte') return observed <= expected;
      if (op === 'gt') return observed > expected;
      return observed >= expected;
    }
  }
}

function matchesWhere(event: TraceEvent, where: Record<string, Primitive> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) if (event.data[k] !== v) return false;
  return true;
}

/**
 * Turns a scenario into `advance` requests and their results into a `ScenarioRun`.
 * It owns everything a run means (sampling bounds, event cap, assertions), so a local
 * harness and a remote adapter produce the same run for the same game.
 */
export class ScenarioRecorder {
  readonly sampleEvery: number;
  private readonly scenario: Scenario;
  private readonly params: ParameterValues;
  private readonly revision: string;
  private readonly tickRateHz: number;
  private readonly inputs: InputTransition[];
  private readonly samples: TraceSample[] = [];
  private readonly events: TraceEvent[] = [];
  private readonly limitations: string[] = [];
  private reached = 0;
  private eventsTruncated = false;
  private finished: ScenarioRun | null = null;

  constructor(scenario: Scenario, params: ParameterValues, options: { revision?: string | undefined; tickRateHz: number }) {
    this.scenario = scenario;
    this.params = { ...scenario.params, ...params };
    this.revision = options.revision ?? 'unknown';
    this.tickRateHz = options.tickRateHz;
    this.inputs = scenario.inputs.map((input, order) => ({ input, order })).sort((a, b) => a.input.tick - b.input.tick || a.order - b.order).map((x) => x.input);
    // Keep the sample count bounded: widen the stride when a long scenario would exceed the cap.
    const needed = Math.ceil(scenario.maxTicks / scenario.sampleEvery) + 1;
    this.sampleEvery = needed > LIMITS.maxSamples ? Math.ceil(scenario.maxTicks / (LIMITS.maxSamples - 1)) : scenario.sampleEvery;
    if (this.sampleEvery !== scenario.sampleEvery) {
      this.limitations.push(`Sampling stride widened from ${scenario.sampleEvery} to ${this.sampleEvery} ticks to stay within ${LIMITS.maxSamples} samples.`);
    }
  }

  get tick(): number {
    return this.reached;
  }

  resetParams(): BridgeParams<'reset'> {
    return { seed: this.scenario.seed, params: this.params, setup: this.scenario.setup };
  }

  start(reset: StateResult): void {
    this.reached = reset.tick;
    this.samples.push({ tick: reset.tick, state: reset.state });
  }

  /** The `advance` request that reaches `targetTick` (bounded by maxTicks), or null when already there. */
  request(targetTick: number): AdvanceRequest | null {
    const to = Math.min(targetTick, this.scenario.maxTicks);
    if (this.finished || this.reached >= to) return null;
    return {
      to,
      inputs: this.inputs.filter((i) => i.tick >= this.reached && i.tick < to),
      sampleEvery: this.sampleEvery,
      lastTick: this.scenario.maxTicks,
      maxEvents: LIMITS.maxEvents - this.events.length,
    };
  }

  record(result: AdvanceResult): void {
    for (const e of result.events) this.events.push({ seq: this.events.length, tick: e.tick, type: e.type, data: e.data });
    for (const s of result.samples) this.samples.push(s);
    if (result.truncated) this.eventsTruncated = true;
    this.reached = result.tick;
  }

  finish(finalState: FlatState): ScenarioRun {
    if (this.finished) return this.finished;
    if (this.eventsTruncated) this.limitations.push(`Event log truncated at ${LIMITS.maxEvents} events; later events were not evaluated.`);
    if (this.sampleEvery > 1) this.limitations.push(`State checks only see every ${this.sampleEvery}th tick.`);
    const ctx: EvalContext = {
      events: this.events,
      samples: this.samples,
      finalState,
      params: this.params,
      tickRateHz: this.tickRateHz,
    };
    const assertions = this.scenario.assertions.map((a) => evaluateAssertion(a, ctx));
    const checks = summarizeChecks(assertions);
    const firstFailure =
      assertions
        .filter((a) => a.status === 'failed')
        .sort((a, b) => (a.tick ?? Number.MAX_SAFE_INTEGER) - (b.tick ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
    this.finished = {
      scenarioId: this.scenario.id,
      seed: this.scenario.seed,
      revision: this.revision,
      params: this.params,
      setup: this.scenario.setup,
      stepMode: 'fixed-step',
      tickRateHz: this.tickRateHz,
      ticks: this.reached,
      inputs: this.inputs.filter((i) => i.tick < this.reached),
      samples: this.samples,
      events: this.events,
      finalState,
      assertions,
      checks,
      status: worstStatus(assertions.map((a) => a.status)),
      firstFailure,
      limitations: this.limitations,
    };
    return this.finished;
  }
}

/**
 * Runs a scenario against an in-process harness, segment by segment, so a caller can take
 * screenshots at checkpoints.
 */
export class ScenarioExecution {
  private readonly harness: GameHarness;
  private readonly recorder: ScenarioRecorder;
  private readonly maxTicks: number;

  constructor(harness: GameHarness, scenario: Scenario, params: ParameterValues = {}, options: { revision?: string } = {}) {
    this.harness = harness;
    this.maxTicks = scenario.maxTicks;
    this.recorder = new ScenarioRecorder(scenario, params, { revision: options.revision, tickRateHz: harness.tickRateHz });
    const r = this.recorder.resetParams();
    harness.reset(r.seed, r.params, r.setup);
    harness.drainEvents();
    this.recorder.start({ tick: harness.currentTick(), state: harness.snapshot() });
  }

  get tick(): number {
    return this.harness.currentTick();
  }

  /** Advance until the harness reaches `targetTick` (bounded by maxTicks). */
  advanceTo(targetTick: number): void {
    const req = this.recorder.request(targetTick);
    if (req) this.recorder.record(advanceHarness(this.harness, req));
  }

  finish(): ScenarioRun {
    this.advanceTo(this.maxTicks);
    return this.recorder.finish(this.harness.snapshot());
  }
}

/**
 * Runs a scenario through a connected adapter on any engine. `onCheckpoint` runs after each
 * checkpoint tick is reached, e.g. to take a screenshot.
 */
export async function runScenarioOn(
  driver: BridgeDriver,
  scenario: Scenario,
  params: ParameterValues = {},
  options: { revision?: string; onCheckpoint?: (tick: number) => Promise<void> } = {},
): Promise<ScenarioRun> {
  const recorder = new ScenarioRecorder(scenario, params, { revision: options.revision, tickRateHz: driver.hello.tickRateHz });
  recorder.start(await driver.call('reset', recorder.resetParams()));
  const stops = [...new Set(scenario.checkpoints.filter((t) => t <= scenario.maxTicks))].sort((a, b) => a - b);
  for (const stop of stops) {
    const req = recorder.request(stop);
    if (req) recorder.record(await driver.call('advance', req));
    await options.onCheckpoint?.(recorder.tick);
  }
  const rest = recorder.request(scenario.maxTicks);
  if (rest) recorder.record(await driver.call('advance', rest));
  return recorder.finish((await driver.call('snapshot', {})).state);
}

/** Full parameter set for a run: tuning baseline, then scenario params, then caller overrides. */
export function resolveRunParameters(baseline: ParameterValues, scenario: Scenario, overrides: ParameterValues = {}): ParameterValues {
  return { ...baseline, ...scenario.params, ...overrides };
}

export function runScenario(
  harness: GameHarness,
  scenario: Scenario,
  params: ParameterValues = {},
  options: { revision?: string } = {},
): ScenarioRun {
  return new ScenarioExecution(harness, scenario, params, options).finish();
}

export interface EvalContext {
  events: readonly TraceEvent[];
  samples: readonly TraceSample[];
  finalState: FlatState;
  params: ParameterValues;
  tickRateHz: number;
}

export function evaluateAssertion(a: Assertion, ctx: EvalContext): AssertionResult {
  const base = { checkId: a.checkId, assertion: a.type } as const;
  switch (a.type) {
    case 'eventCount': {
      let count = 0;
      let failTick: number | undefined;
      for (const e of ctx.events) {
        if (e.type !== a.event || !matchesWhere(e, a.where)) continue;
        count++;
        // For upper bounds, the first event that breaks the bound is the failure point.
        if (failTick === undefined && (a.op === 'eq' || a.op === 'lte' || a.op === 'lt') && !compare(count, a.op === 'eq' ? 'lte' : a.op, a.value)) {
          failTick = e.tick;
        }
      }
      const ok = compare(count, a.op, a.value);
      const filter = a.where ? ` matching ${JSON.stringify(a.where)}` : '';
      return {
        ...base,
        status: ok ? 'passed' : 'failed',
        observed: count,
        expected: a.value,
        ...(ok ? {} : { tick: failTick ?? ctx.samples.at(-1)?.tick ?? 0 }),
        message: `${count} "${a.event}" event(s)${filter}; expected ${a.op} ${a.value}`,
      };
    }
    case 'stateAlways': {
      const from = a.fromTick ?? 0;
      let checked = 0;
      for (const s of ctx.samples) {
        if (s.tick < from) continue;
        if (!(a.path in s.state)) {
          return { ...base, status: 'unsupported', message: `State field "${a.path}" is not exposed by the harness snapshot` };
        }
        checked++;
        const v = s.state[a.path];
        if (!compare(v, a.op, a.value)) {
          return { ...base, status: 'failed', observed: v ?? null, expected: a.value, tick: s.tick, message: `"${a.path}" was ${String(v)} at tick ${s.tick}; expected always ${a.op} ${String(a.value)}` };
        }
      }
      if (checked === 0) return { ...base, status: 'not_tested', message: `No samples at or after tick ${from}` };
      return { ...base, status: 'passed', expected: a.value, message: `"${a.path}" stayed ${a.op} ${String(a.value)} across ${checked} samples` };
    }
    case 'stateAtEnd': {
      if (!(a.path in ctx.finalState)) {
        return { ...base, status: 'unsupported', message: `State field "${a.path}" is not exposed by the harness snapshot` };
      }
      const v = ctx.finalState[a.path];
      const ok = compare(v, a.op, a.value);
      return {
        ...base,
        status: ok ? 'passed' : 'failed',
        observed: v ?? null,
        expected: a.value,
        ...(ok ? {} : { tick: ctx.samples.at(-1)?.tick ?? 0 }),
        message: `"${a.path}" ended as ${String(v)}; expected ${a.op} ${String(a.value)}`,
      };
    }
    case 'minEventInterval': {
      let minMs = a.minMs;
      if (a.minMsFromParam) {
        const p = ctx.params[a.minMsFromParam];
        if (typeof p !== 'number') {
          return { ...base, status: 'unsupported', message: `Parameter "${a.minMsFromParam}" is not a numeric parameter in this run` };
        }
        minMs = p;
      }
      if (minMs === undefined) return { ...base, status: 'unsupported', message: 'Assertion needs minMs or minMsFromParam' };
      // Tick quantization: an interval may legitimately be up to one tick shorter than the configured ms.
      const minTicks = Math.max(0, Math.floor((minMs * ctx.tickRateHz) / 1000));
      const ticks = ctx.events.filter((e) => e.type === a.event).map((e) => e.tick);
      if (ticks.length < 2) return { ...base, status: 'not_tested', observed: ticks.length, message: `Needs at least two "${a.event}" events; saw ${ticks.length}` };
      let smallest = Number.POSITIVE_INFINITY;
      let at = 0;
      for (let i = 1; i < ticks.length; i++) {
        const d = (ticks[i] as number) - (ticks[i - 1] as number);
        if (d < smallest) {
          smallest = d;
          at = ticks[i] as number;
        }
      }
      const ok = smallest >= minTicks;
      return {
        ...base,
        status: ok ? 'passed' : 'failed',
        observed: smallest,
        expected: minTicks,
        ...(ok ? {} : { tick: at }),
        message: `Shortest "${a.event}" interval was ${smallest} ticks; required >= ${minTicks} ticks (${minMs} ms at ${ctx.tickRateHz} Hz)`,
      };
    }
    case 'eventUnique': {
      const seen = new Map<Primitive, number>();
      let events = 0;
      for (const e of ctx.events) {
        if (e.type !== a.event) continue;
        events++;
        const key = e.data[a.key];
        if (key === undefined) return { ...base, status: 'unsupported', message: `"${a.event}" events have no "${a.key}" field` };
        if (seen.has(key)) {
          return { ...base, status: 'failed', observed: String(key), tick: e.tick, message: `"${a.event}" repeated for ${a.key}=${String(key)} (first at tick ${seen.get(key)}, again at tick ${e.tick})` };
        }
        seen.set(key, e.tick);
      }
      if (events === 0) return { ...base, status: 'not_tested', message: `No "${a.event}" events occurred` };
      return { ...base, status: 'passed', observed: events, message: `${events} "${a.event}" event(s), each with a unique ${a.key}` };
    }
  }
}

export function summarizeChecks(results: readonly AssertionResult[]): CheckSummary[] {
  const byId = new Map<string, AssertionResult[]>();
  for (const r of results) byId.set(r.checkId, [...(byId.get(r.checkId) ?? []), r]);
  return [...byId.entries()].map(([id, rs]) => {
    const status = worstStatus(rs.map((r) => r.status));
    const decisive = rs.find((r) => r.status === status) ?? rs[0];
    return {
      id,
      status,
      ...(decisive ? { observed: decisive.message } : {}),
      ...(decisive?.tick !== undefined ? { tick: decisive.tick } : {}),
    };
  });
}
