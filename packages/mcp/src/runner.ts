import path from 'node:path';
import {
  GameDNAError,
  aggregateMetrics,
  assessReproducibility,
  checkParameterOverrides,
  computeMetrics,
  resolveRunParameters,
  runScenario,
  runScenarioOn,
  type BridgeDriver,
  type MetricRange,
  type ParameterValues,
  type Reproducibility,
  type Scenario,
  type ScenarioRun,
} from '@gamedna/core';
import { newId, resolveInside, writeFileAtomic, writeJsonAtomic } from '@gamedna/core/node';
import { loadHarness } from './headless.js';
import { EVIDENCE_DIR, type LoadedProject } from './project.js';
import type { BrowserSession } from './session.js';

/** Where a scenario runs: the browser page, an adapter on the bridge, or the harness module in Node. */
export type ScenarioTarget = { runtime: 'browser'; session: BrowserSession } | { runtime: 'process'; driver: BridgeDriver } | { runtime: 'headless-node' };
export type Runtime = ScenarioTarget['runtime'];

export interface ExecutedScenario {
  runtime: Runtime;
  runs: ScenarioRun[];
  traceId: string;
  screenshotIds: string[];
  metrics: MetricRange[];
  reproducibility: Reproducibility;
  limitations: string[];
}

interface BridgeWindow {
  __GAMEDNA__: {
    runScenario(s: unknown, o: unknown, opts: unknown): ScenarioRun | { ok: false; errors: string[] };
    beginScenario(s: unknown, o: unknown, opts: unknown): { ok: boolean; errors: string[] };
    advanceScenario(t: number): { tick: number };
    finishScenario(): ScenarioRun | null;
  };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function saveScreenshot(project: LoadedProject, png: Buffer): Promise<string> {
  const id = newId('shot');
  writeFileAtomic(resolveInside(project.root, path.posix.join(EVIDENCE_DIR, 'screenshots', `${id}.png`)), png);
  return id;
}

export function canScreenshot(driver: BridgeDriver): boolean {
  return driver.hello.capabilities.includes('screenshot');
}

/** Ask the adapter for a screenshot and check that it really is a PNG. */
export async function adapterScreenshot(driver: BridgeDriver): Promise<Buffer> {
  const png = Buffer.from((await driver.call('screenshot', {})).data, 'base64');
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new GameDNAError('ADAPTER_ERROR', 'The adapter screenshot is not a PNG image');
  return png;
}

async function nextFrames(session: BrowserSession): Promise<void> {
  await session.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))), undefined);
}

async function browserRun(session: BrowserSession, project: LoadedProject, scenario: Scenario, overrides: ParameterValues, revision: string, screenshots: boolean): Promise<{ run: ScenarioRun; shots: string[] }> {
  const shots: string[] = [];
  if (screenshots && scenario.checkpoints.length > 0) {
    const begun = await session.page.evaluate(([s, o, r]) => (window as unknown as BridgeWindow).__GAMEDNA__.beginScenario(s, o, { revision: r }), [scenario, overrides, revision] as const);
    if (!begun.ok) throw new GameDNAError('INVALID_INPUT', 'The adapter rejected the scenario', { details: { errors: begun.errors } });
    for (const tick of [...scenario.checkpoints].sort((a, b) => a - b)) {
      await session.page.evaluate((t) => (window as unknown as BridgeWindow).__GAMEDNA__.advanceScenario(t), tick);
      await nextFrames(session);
      shots.push(await saveScreenshot(project, await session.page.screenshot({ type: 'png' })));
    }
    const run = await session.page.evaluate(() => (window as unknown as BridgeWindow).__GAMEDNA__.finishScenario(), undefined);
    if (!run) throw new GameDNAError('SESSION_NOT_READY', 'Scenario execution was lost (page reloaded?)');
    return { run, shots };
  }
  const run = await session.page.evaluate(([s, o, r]) => (window as unknown as BridgeWindow).__GAMEDNA__.runScenario(s, o, { revision: r }), [scenario, overrides, revision] as const);
  if ('ok' in run && run.ok === false) throw new GameDNAError('INVALID_INPUT', 'The adapter rejected the scenario', { details: { errors: run.errors } });
  return { run: run as ScenarioRun, shots };
}

/** Run a scenario 1..10 times on the target, then store the trace. */
export async function executeScenario(args: {
  project: LoadedProject;
  scenario: Scenario;
  overrides?: ParameterValues;
  seed?: number;
  repeat?: number;
  target: ScenarioTarget;
  screenshots?: boolean;
  revision: string;
}): Promise<ExecutedScenario> {
  const { project, target } = args;
  const overrides = args.overrides ?? {};
  const problems = checkParameterOverrides(project.record.parameters, overrides, { allowFault: true, allowProtected: true });
  if (problems.length) throw new GameDNAError('INVALID_PARAMETER', 'Rejected parameter overrides', { details: { problems } });
  const scenario = args.seed === undefined ? args.scenario : { ...args.scenario, seed: args.seed };
  const repeat = Math.max(1, Math.min(args.repeat ?? 1, 10));
  const runs: ScenarioRun[] = [];
  const screenshotIds: string[] = [];
  const limitations: string[] = [];
  if (target.runtime === 'browser') {
    for (let i = 0; i < repeat; i++) {
      const { run, shots } = await browserRun(target.session, project, scenario, overrides, args.revision, Boolean(args.screenshots) && i === 0);
      runs.push(run);
      screenshotIds.push(...shots);
    }
  } else if (target.runtime === 'process') {
    const { driver } = target;
    const shoot = Boolean(args.screenshots) && canScreenshot(driver);
    if (args.screenshots && !shoot) limitations.push(`The ${driver.hello.engine} adapter does not offer screenshots (hello.capabilities).`);
    const onCheckpoint = async () => {
      screenshotIds.push(await saveScreenshot(project, await adapterScreenshot(driver)));
    };
    for (let i = 0; i < repeat; i++) {
      runs.push(await runScenarioOn(driver, scenario, overrides, { revision: args.revision, ...(shoot && i === 0 ? { onCheckpoint } : {}) }));
    }
  } else {
    const make = await loadHarness(project.root, project.record);
    const params = resolveRunParameters(project.tuning, scenario, overrides);
    for (let i = 0; i < repeat; i++) runs.push(runScenario(make(), scenario, params, { revision: args.revision }));
    limitations.push('Headless run: same simulation code, no Phaser rendering, audio or screenshots.');
    if (args.screenshots) limitations.push('Screenshots need a browser session (gd_start_session).');
  }
  const first = runs[0] as ScenarioRun;
  limitations.push(...first.limitations);
  const reproducibility = assessReproducibility(runs);
  const metrics = aggregateMetrics(runs.map((r) => computeMetrics(r, project.record.metrics)));
  const traceId = newId('trace');
  writeJsonAtomic(resolveInside(project.root, path.posix.join(EVIDENCE_DIR, 'traces', `${traceId}.json`)), {
    traceId,
    runtime: target.runtime,
    repeat,
    reproducibility: { status: reproducibility.status, note: reproducibility.note },
    screenshotIds,
    run: first,
  });
  return { runtime: target.runtime, runs, traceId, screenshotIds, metrics, reproducibility, limitations };
}
