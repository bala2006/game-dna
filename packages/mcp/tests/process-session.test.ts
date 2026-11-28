import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScenarioSchema, runScenario } from '@gamedna/core';
import { CounterHarness } from '../../core/tests/helpers.js';
import { setToolPath } from '../src/commands.js';
import { createContext } from '../src/server.js';
import {
  compareExperiment,
  createExperimentTool,
  observe,
  prepareChange,
  projectStatus,
  recordSelectionTool,
  runScenarioTool,
  startSession,
  stopSession,
  verify,
  type ToolContext,
} from '../src/tools.js';
import { connectFakeAdapter } from './fake-adapter.js';

const SCENARIO = {
  id: 'counter-run',
  description: 'press inc twice',
  seed: 7,
  maxTicks: 40,
  checkpoints: [6, 20],
  inputs: [
    { tick: 12, key: 'inc', down: true },
    { tick: 3, key: 'inc', down: true },
    { tick: 5, key: 'inc', down: false },
    { tick: 14, key: 'inc', down: false },
  ],
  assertions: [{ type: 'eventCount', checkId: 'INC-01', event: 'inc', op: 'eq', value: 2 }],
};

let workspace: string;
let ctx: ToolContext;
const savedConfig = process.env['GAMEDNA_CONFIG_DIR'];

function project(name: string, engine: Record<string, unknown>, commands: Record<string, unknown>, files: Record<string, string> = {}): void {
  const record = {
    schemaVersion: 1,
    projectId: name,
    name,
    engine,
    design: { genre: 'test', coreLoop: 'press to count', stylePack: 'layered-minimal', experienceGoals: ['responsive'] },
    tuningFile: 'tuning.json',
    viewport: { width: 320, height: 240 },
    constraints: [{ id: 'INC-01', requirementRef: 'REQ-1', statement: 'Each press counts once' }],
    parameters: { 'counter.step': { type: 'number', value: 1, min: 1, max: 5 } },
    commands,
  };
  const all = { ...files, '.gamedna/project.json': JSON.stringify(record), 'tuning.json': JSON.stringify({ 'counter.step': 1 }), '.gamedna/scenarios/counter-run.json': JSON.stringify(SCENARIO) };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(workspace, name, rel)), { recursive: true });
    writeFileSync(path.join(workspace, name, rel), text);
  }
}

const readTuning = (name: string) => JSON.parse(readFileSync(path.join(workspace, name, 'tuning.json'), 'utf8')) as Record<string, number>;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms = 5000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

beforeAll(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'gd-process-'));
  process.env['GAMEDNA_CONFIG_DIR'] = path.join(workspace, 'config');
  const game = path.join(import.meta.dirname, 'fake-game.mjs');
  mkdirSync(path.join(workspace, 'bin'));
  const wrapper = path.join(workspace, 'bin', process.platform === 'win32' ? 'fakegame.cmd' : 'fakegame');
  writeFileSync(wrapper, process.platform === 'win32' ? `@"${process.execPath}" "${game}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${game}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  setToolPath('fakegame', wrapper);
  project('godot-counter', { id: 'godot', version: '4.3' }, {}, { 'project.godot': 'config/features=PackedStringArray("4.3")\n' });
  const native = { id: 'custom', version: '1.0', runtime: 'process', tools: ['fakegame'] };
  project('native-counter', native, {
    run: { argv: ['fakegame'], kind: 'run', readyTimeoutMs: 15_000 },
    headless: { argv: ['fakegame'], kind: 'headless', readyTimeoutMs: 15_000 },
    silent: { argv: ['fakegame', 'silent'], kind: 'run', readyTimeoutMs: 1_000 },
  });
  project('phone-counter', { id: 'android-kotlin', version: 'unknown' }, {}, { 'settings.gradle': "include ':app'\n", 'app/build.gradle': "plugins { id 'com.android.application' }\n" });
  ctx = createContext(workspace, null);
});

afterAll(async () => {
  await ctx.sessions.stopAll();
  await ctx.workbench.stop();
  if (savedConfig === undefined) delete process.env['GAMEDNA_CONFIG_DIR'];
  else process.env['GAMEDNA_CONFIG_DIR'] = savedConfig;
  rmSync(workspace, { recursive: true, force: true });
});

describe('attach session on a Godot project', () => {
  let sessionId: string;

  it('waits for the game and runs a scenario with the same result as the in-process runner', async () => {
    const started = (await startSession(ctx, { projectPath: 'godot-counter' })).data as Record<string, any>;
    expect(started.status).toBe('waiting');
    expect(started.token).toMatch(/^[0-9a-f]{32}$/);
    expect(started.launchEnv).toEqual({ GAMEDNA_BRIDGE: started.bridge, GAMEDNA_TOKEN: started.token });
    sessionId = started.sessionId;
    connectFakeAdapter({ address: started.bridge, token: started.token, capabilities: ['screenshot'], baseline: () => readTuning('godot-counter') });

    const r = (await runScenarioTool(ctx, { sessionId, scenarioId: 'counter-run', params: { 'counter.step': 2 }, screenshots: true, repeat: 2 })).data as Record<string, any>;
    expect(r.status).toBe('passed');
    expect(r.runtime).toBe('process');
    expect(r.reproducibility.status).toBe('stable');
    expect(r.screenshotIds).toHaveLength(2);
    const trace = JSON.parse(readFileSync(path.join(workspace, 'godot-counter/.gamedna/evidence/traces', `${r.traceId}.json`), 'utf8'));
    const local = runScenario(new CounterHarness(), ScenarioSchema.parse(SCENARIO), { 'counter.step': 2 }, { revision: r.revision });
    expect(trace.run).toEqual(JSON.parse(JSON.stringify(local)));
    expect((projectStatus(ctx, { projectPath: 'godot-counter' }).data as Record<string, any>).sessions[0]).toMatchObject({ sessionId, runtime: 'process', status: 'ready' });
  });

  it('observes state, events, stepping and screenshots over the bridge', async () => {
    const o = await observe(ctx, { sessionId, fields: ['count', 'nope'], step: 5, screenshot: true });
    const data = o.data as Record<string, any>;
    expect(data.stepped).toEqual({ mode: 'controlled', from: 40, to: 45, events: 0 });
    expect(data.snapshot).toEqual({ tick: 45, state: { count: 4 }, missing: ['nope'] });
    expect(data.events.events.length).toBeGreaterThan(0);
    expect(o.images).toHaveLength(1);
  });

  it('compares an experiment and verifies the applied decision through the session', async () => {
    const created = createExperimentTool(ctx, { projectPath: 'godot-counter', question: 'Step size?', scenarioIds: ['counter-run'], protectedChecks: ['INC-01'], variants: [
      { id: 'A', label: 'Two', rationale: 'bigger steps', parameters: { 'counter.step': 2 } },
      { id: 'B', label: 'Three', rationale: 'biggest steps', parameters: { 'counter.step': 3 } },
    ] }).data as Record<string, any>;
    const compared = (await compareExperiment(ctx, { projectPath: 'godot-counter', experimentId: created.experimentId, sessionId, repeat: 1 })).data as Record<string, any>;
    expect(compared.runtime).toBe('process');
    expect(compared.protectedChecks).toEqual({ baseline: 'passed', A: 'passed', B: 'passed' });
    recordSelectionTool(ctx, { projectPath: 'godot-counter', experimentId: created.experimentId, variantId: 'B', userStatement: 'B please' });
    const prep = prepareChange(ctx, { projectPath: 'godot-counter', experimentId: created.experimentId }).data as Record<string, any>;
    writeFileSync(path.join(workspace, 'godot-counter/tuning.json'), JSON.stringify(prep.patch.set));
    const v = (await verify(ctx, { projectPath: 'godot-counter', decisionId: prep.decisionId, sessionId, runTests: false })).data as Record<string, any>;
    expect(v.runtime).toBe('process');
    expect(v.checks.map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([['PARAMS-APPLIED', 'passed'], ['RUNTIME-PARAMS', 'passed'], ['INC-01', 'passed']]);
    expect(v.decisionStatus).toBe('verified');
  });

  it('stops the session without touching a process it did not start', async () => {
    expect((await stopSession(ctx, { sessionId })).data).toMatchObject({ runtime: 'process', processStopped: false, attachedOnly: true });
  });

  it('needs a session or a headless command for scenarios', async () => {
    await expect(runScenarioTool(ctx, { projectPath: 'godot-counter', scenarioId: 'counter-run' })).rejects.toThrow(expect.objectContaining({ code: 'SESSION_NOT_READY' }));
  });
});

describe('launched process sessions', () => {
  const readPid = () => Number(readFileSync(path.join(workspace, 'native-counter/fake-game.pid'), 'utf8'));

  it('runs a scenario through the headless command and always stops it', async () => {
    const r = (await runScenarioTool(ctx, { projectPath: 'native-counter', scenarioId: 'counter-run' })).data as Record<string, any>;
    expect(r.status).toBe('passed');
    expect(r.runtime).toBe('process');
    expect(r.temporarySession).toBe(true);
    expect(ctx.sessions.list()).toHaveLength(0);
    expect(await until(() => !alive(readPid()))).toBe(true);
  });

  it('launches a run command with the bridge address and token', async () => {
    const s = (await startSession(ctx, { projectPath: 'native-counter', commandId: 'run' })).data as Record<string, any>;
    expect(s).toMatchObject({ status: 'ready', launched: true, commandId: 'run', adapter: { engine: 'fake-native', protocol: 1 } });
    expect(s.adapter).not.toHaveProperty('token');
    const r = (await runScenarioTool(ctx, { sessionId: s.sessionId, scenarioId: 'counter-run', screenshots: true })).data as Record<string, any>;
    expect(r.status).toBe('passed');
    expect(r.limitations.join(' ')).toMatch(/does not offer screenshots/);
    const pid = readPid();
    expect((await stopSession(ctx, { sessionId: s.sessionId })).data).toMatchObject({ processStopped: true, attachedOnly: false });
    expect(await until(() => !alive(pid))).toBe(true);
  });

  it('returns ADAPTER_MISSING when no hello arrives in time, and kills what it launched', async () => {
    rmSync(path.join(workspace, 'native-counter/fake-game.pid'), { force: true });
    await expect(startSession(ctx, { projectPath: 'native-counter', commandId: 'silent' })).rejects.toThrow(expect.objectContaining({ code: 'ADAPTER_MISSING' }));
    expect(existsSync(path.join(workspace, 'native-counter/fake-game.pid'))).toBe(true);
    expect(await until(() => !alive(readPid()))).toBe(true);
    expect(ctx.sessions.list()).toHaveLength(0);
  });

  it('says Android sessions are not implemented yet', async () => {
    await expect(startSession(ctx, { projectPath: 'phone-counter' })).rejects.toThrow(/not implemented yet/);
  });
});
