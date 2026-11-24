import {
  checkParameterOverrides,
  GAMEDNA_VERSION,
  resolveRunParameters,
  ScenarioExecution,
  ScenarioSchema,
  formatIssues,
  type FlatState,
  type GameHarness,
  type ParameterSpec,
  type ParameterValues,
  type Primitive,
  type RawEvent,
  type ScenarioRun,
  type TraceEvent,
} from '@gamedna/core';

/** Marker checked by scripts/check-prod-bridge.mjs. It must never appear in a production bundle. */
export const BRIDGE_GLOBAL = '__GAMEDNA__';

export interface BridgeOptions {
  projectId: string;
  /** The live simulation the game renders. */
  sim: GameHarness & { parameters(): ParameterValues };
  specs: Record<string, ParameterSpec>;
  /** Values from the game's tuning file. */
  baseline: ParameterValues;
  /** Hand control to the bridge (true) or back to the player (false). */
  setControlled(on: boolean): void;
  /** Called after parameters or seed change so the game can refresh derived visuals. */
  onReset?(): void;
  engine: { id: string; version: string };
  viewport: { width: number; height: number };
  /** Window used for URL parsing and the global; defaults to `window`. */
  target?: { location: { search: string }; [key: string]: unknown };
}

const MAX_LIVE_EVENTS = 2_000;
const MAX_STEP = 3_600;

function decodeParams(encoded: string): unknown {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    Array.from(atob(b64))
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
  return JSON.parse(json);
}

export function encodeParams(values: ParameterValues): string {
  const json = JSON.stringify(values);
  const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface BridgeApi {
  version: string;
  ready: boolean;
  info(): Record<string, unknown>;
  getSnapshot(fields?: string[]): { tick: number; mode: 'live' | 'controlled'; state: FlatState; missing: string[] };
  getEvents(cursor?: number, limit?: number): { events: TraceEvent[]; nextCursor: number; dropped: number };
  getParameters(): ParameterValues;
  setExperimentParameters(values: Record<string, unknown>): { ok: boolean; rejected: Array<{ key: string; reason: string }>; effective: ParameterValues };
  reset(seed?: number, setup?: Record<string, Primitive>): { tick: number };
  setMode(mode: 'live' | 'controlled'): void;
  step(n: number): { tick: number; events: number };
  beginScenario(scenario: unknown, overrides?: Record<string, unknown>, options?: { revision?: string }): { ok: boolean; errors: string[] };
  advanceScenario(tick: number): { tick: number };
  finishScenario(): ScenarioRun | null;
  runScenario(scenario: unknown, overrides?: Record<string, unknown>, options?: { revision?: string }): ScenarioRun | { ok: false; errors: string[] };
}

export interface InstalledBridge {
  api: BridgeApi;
  /** Forward events the game produced during live play. */
  recordLiveEvents(events: RawEvent[], tick: number): void;
}

export function installBridge(opts: BridgeOptions): InstalledBridge {
  const target = (opts.target ?? (globalThis as unknown as { location: { search: string }; [key: string]: unknown })) as {
    location: { search: string };
    [key: string]: unknown;
  };
  let overrides: ParameterValues = {};
  let seed = 1;
  let mode: 'live' | 'controlled' = 'live';
  const live: TraceEvent[] = [];
  let seq = 0;
  let dropped = 0;
  let execution: ScenarioExecution | null = null;
  const urlNotes: string[] = [];

  const effective = (): ParameterValues => ({ ...opts.baseline, ...overrides });
  const record = (events: RawEvent[], tick: number) => {
    for (const e of events) {
      live.push({ seq: seq++, tick, type: e.type, data: e.data ?? {} });
      if (live.length > MAX_LIVE_EVENTS) {
        live.shift();
        dropped++;
      }
    }
  };

  const applyReset = (): void => {
    opts.sim.reset(seed, effective(), {});
    opts.sim.drainEvents();
    opts.onReset?.();
  };

  // Variant previews from the workbench arrive as ?gamedna=1&gdSeed=..&gdParams=<base64url JSON>.
  const search = new URLSearchParams(target.location.search);
  if (search.has('gdSeed')) {
    const s = Number(search.get('gdSeed'));
    if (Number.isInteger(s) && s >= 0) seed = s;
  }
  const encoded = search.get('gdParams');
  if (encoded) {
    try {
      const raw = decodeParams(encoded) as Record<string, unknown>;
      const problems = checkParameterOverrides(opts.specs, raw, { allowFault: true });
      if (problems.length === 0) overrides = raw as ParameterValues;
      else urlNotes.push(...problems.map((p) => `${p.key}: ${p.reason}`));
    } catch {
      urlNotes.push('gdParams could not be decoded; ignored');
    }
  }
  if (encoded || search.has('gdSeed')) applyReset();

  const api: BridgeApi = {
    version: GAMEDNA_VERSION,
    ready: true,
    info() {
      return {
        projectId: opts.projectId,
        adapterVersion: GAMEDNA_VERSION,
        engine: opts.engine,
        viewport: opts.viewport,
        stepMode: 'fixed-step',
        tickRateHz: opts.sim.tickRateHz,
        seed,
        overrides,
        urlNotes,
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      };
    },
    getSnapshot(fields) {
      const state = opts.sim.snapshot();
      if (!fields || fields.length === 0) return { tick: opts.sim.currentTick(), mode, state, missing: [] };
      const picked: FlatState = {};
      const missing: string[] = [];
      for (const f of fields) {
        if (f in state) picked[f] = state[f] ?? null;
        else missing.push(f);
      }
      return { tick: opts.sim.currentTick(), mode, state: picked, missing };
    },
    getEvents(cursor = 0, limit = 200) {
      const capped = Math.max(1, Math.min(limit, 500));
      const events = live.filter((e) => e.seq >= cursor).slice(0, capped);
      const last = events.at(-1);
      return { events, nextCursor: last ? last.seq + 1 : Math.max(cursor, seq), dropped };
    },
    getParameters() {
      return { ...opts.sim.parameters() };
    },
    setExperimentParameters(values) {
      const rejected = checkParameterOverrides(opts.specs, values, { allowFault: true });
      if (rejected.length) return { ok: false, rejected, effective: effective() };
      overrides = values as ParameterValues;
      applyReset();
      return { ok: true, rejected: [], effective: effective() };
    },
    reset(newSeed, setup = {}) {
      if (typeof newSeed === 'number' && Number.isInteger(newSeed) && newSeed >= 0) seed = newSeed;
      opts.sim.reset(seed, effective(), setup);
      opts.sim.drainEvents();
      opts.onReset?.();
      return { tick: opts.sim.currentTick() };
    },
    setMode(next) {
      mode = next;
      opts.setControlled(next === 'controlled');
    },
    step(n) {
      api.setMode('controlled');
      const count = Math.max(0, Math.min(Math.trunc(n), MAX_STEP));
      let events = 0;
      for (let i = 0; i < count; i++) {
        opts.sim.step();
        const evs = opts.sim.drainEvents();
        events += evs.length;
        record(evs, opts.sim.currentTick());
      }
      return { tick: opts.sim.currentTick(), events };
    },
    beginScenario(scenario, extra = {}, options = {}) {
      const parsed = ScenarioSchema.safeParse(scenario);
      if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };
      const problems = checkParameterOverrides(opts.specs, { ...parsed.data.params, ...extra }, { allowFault: true });
      if (problems.length) return { ok: false, errors: problems.map((p) => `${p.key}: ${p.reason}`) };
      api.setMode('controlled');
      const params = resolveRunParameters(effective(), parsed.data, extra as ParameterValues);
      execution = new ScenarioExecution(opts.sim, parsed.data, params, options.revision ? { revision: options.revision } : {});
      opts.onReset?.();
      return { ok: true, errors: [] };
    },
    advanceScenario(tick) {
      execution?.advanceTo(tick);
      return { tick: opts.sim.currentTick() };
    },
    finishScenario() {
      if (!execution) return null;
      const run = execution.finish();
      execution = null;
      return run;
    },
    runScenario(scenario, extra = {}, options = {}) {
      const begun = api.beginScenario(scenario, extra, options);
      if (!begun.ok) return { ok: false, errors: begun.errors };
      return api.finishScenario() as ScenarioRun;
    },
  };

  target[BRIDGE_GLOBAL] = api;
  return { api, recordLiveEvents: record };
}
