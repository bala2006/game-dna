/**
 * Conformance of the Godot adapter through the bundled Power server over real stdio: the same
 * scenario must give identical samples and events on Godot and on the TypeScript twin.
 * Needs `npm run build:power` and Godot 4 at GODOT_BIN; skipped when GODOT_BIN is unset.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ScenarioSchema, resolveRunParameters, runScenario, type ScenarioRun } from '@gamedna/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Walker } from '../fixtures/godot-mini/walker.js';

const godot = process.env.GODOT_BIN;
const root = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(root, 'tests/fixtures/godot-mini');

type Json = Record<string, any>;
let client: Client;
let work = '';
let rel = '';
let sessionId: string | undefined;

async function call(name: string, args: Json): Promise<{ data: Json; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  return { data: JSON.parse(r.content[0]!.text!), isError: Boolean(r.isError) };
}

function trace(traceId: string): ScenarioRun {
  return JSON.parse(readFileSync(path.join(work, 'godot-mini/.gamedna/evidence/traces', `${traceId}.json`), 'utf8')).run;
}

function twinRun(): ScenarioRun {
  const scenario = ScenarioSchema.parse(JSON.parse(readFileSync(path.join(fixture, '.gamedna/scenarios/walk-jump.json'), 'utf8')));
  const tuning = JSON.parse(readFileSync(path.join(fixture, 'tuning.json'), 'utf8'));
  return runScenario(new Walker(), scenario, resolveRunParameters(tuning, scenario));
}

beforeAll(async () => {
  if (!godot) return;
  mkdirSync(path.join(root, '.scratch'), { recursive: true });
  work = mkdtempSync(path.join(root, '.scratch', 'e2e-godot-'));
  cpSync(fixture, path.join(work, 'godot-mini'), { recursive: true });
  rel = path.relative(root, path.join(work, 'godot-mini'));
  client = new Client({ name: 'gamedna-e2e-godot', version: '0.1.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, 'power/server/gamedna-mcp.mjs')],
      cwd: root,
      stderr: 'ignore',
      // The tool path goes into a throwaway config folder, never the user's real one.
      env: { ...(process.env as Record<string, string>), GAMEDNA_CONFIG_DIR: path.join(work, 'config'), GODOT_BIN: '' },
    }),
  );
});

afterAll(async () => {
  if (sessionId) await call('gd_stop_session', { sessionId }).catch(() => undefined);
  await client?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe.skipIf(!godot)('Godot 4 adapter over stdio', () => {
  it('detects Godot, then installs the adapter and the engine tool', async () => {
    const before = await call('gd_project_status', { projectPath: rel });
    expect(before.isError).toBe(false);
    expect(before.data.engine).toMatchObject({ id: 'godot', runtime: 'process' });
    expect(before.data.adapter.installed).toBe(false);

    const installed = await call('gd_install_adapter', { projectPath: rel });
    expect(installed.isError).toBe(false);
    expect(existsSync(path.join(work, 'godot-mini/addons/gamedna/gamedna.gd'))).toBe(true);

    const tool = await call('gd_configure_tool', { tool: 'godot', path: godot });
    expect(tool.isError).toBe(false);
    const after = await call('gd_project_status', { projectPath: rel });
    expect(after.data.adapter.installed).toBe(true);
    expect(JSON.stringify(after.data)).toContain(path.basename(godot!));
  });

  it('runs the scenario on Godot with the same samples and events as the twin', async () => {
    const started = await call('gd_start_session', { projectPath: rel, commandId: 'headless' });
    expect(started.isError, JSON.stringify(started.data)).toBe(false);
    sessionId = started.data.sessionId;

    const result = await call('gd_run_scenario', { sessionId, scenarioId: 'walk-jump', repeat: 2 });
    expect(result.isError, JSON.stringify(result.data)).toBe(false);
    expect(result.data.status).toBe('passed');
    expect(result.data.reproducibility.status).toBe('stable');

    const godotRun = trace(result.data.traceId);
    const twin = twinRun();
    expect(godotRun.samples.length).toBeGreaterThan(100);
    expect(godotRun.events.length).toBeGreaterThan(5);
    expect(godotRun.samples).toEqual(twin.samples);
    expect(godotRun.events).toEqual(twin.events);
    expect(godotRun.checks).toEqual(twin.checks);
  });

  it('observes and steps the running game', async () => {
    const first = await call('gd_observe', { sessionId, fields: ['player.x', 'tick'] });
    expect(first.isError, JSON.stringify(first.data)).toBe(false);
    const stepped = await call('gd_observe', { sessionId, step: 30, fields: ['player.x', 'tick'] });
    expect(stepped.isError, JSON.stringify(stepped.data)).toBe(false);
    expect(stepped.data.snapshot?.tick ?? stepped.data.tick).toBe((first.data.snapshot?.tick ?? first.data.tick) + 30);
    await call('gd_stop_session', { sessionId });
    sessionId = undefined;
  });

  it('runs headless without a session and verifies the protected checks', async () => {
    const run = await call('gd_run_scenario', { projectPath: rel, scenarioId: 'walk-jump' });
    expect(run.isError, JSON.stringify(run.data)).toBe(false);
    expect(run.data.status).toBe('passed');

    const verify = await call('gd_verify', { projectPath: rel, checkIds: ['WALK-01', 'JUMP-01', 'COIN-01'] });
    expect(verify.isError, JSON.stringify(verify.data)).toBe(false);
    const byId = Object.fromEntries((verify.data.checks as Json[]).map((c) => [c.id, c.status]));
    expect(byId).toMatchObject({ 'WALK-01': 'passed', 'JUMP-01': 'passed', 'COIN-01': 'passed' });
  });
});
