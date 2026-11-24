import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllHarnesses } from '../src/headless.js';
import { createContext } from '../src/server.js';
import {
  compareExperiment,
  createExperimentTool,
  exportReport,
  generateAssetTool,
  getSelection,
  prepareChange,
  projectStatus,
  recordSelectionTool,
  runScenarioTool,
  startSession,
  validateDesignTool,
  verify,
  type ToolContext,
} from '../src/tools.js';

const repo = path.resolve(import.meta.dirname, '../../..');
const scratch = path.join(repo, '.scratch');
let work: string;
let rel: string;
let ctx: ToolContext;

beforeAll(() => {
  mkdirSync(scratch, { recursive: true });
  work = mkdtempSync(path.join(scratch, 'mcp-test-'));
  // A disposable copy of Gravity Shift inside the repo, so node_modules resolve and the real app stays untouched.
  cpSync(path.join(repo, 'apps/gravity-shift'), path.join(work, 'gravity-shift'), { recursive: true, filter: (src) => !/node_modules|dist|\.gamedna\/(evidence|experiments|reports)\/./.test(src) });
  writeFileSync(path.join(work, 'gravity-shift/.gamedna/decisions.json'), JSON.stringify({ schemaVersion: 1, decisions: [] }));
  mkdirSync(path.join(work, 'not-a-game'));
  writeFileSync(path.join(work, 'not-a-game/package.json'), JSON.stringify({ name: 'x', dependencies: { 'pixi.js': '8.0.0' } }));
  rel = path.relative(repo, path.join(work, 'gravity-shift'));
  ctx = createContext(repo, null);
});

afterAll(async () => {
  await ctx.workbench.stop();
  await closeAllHarnesses();
  rmSync(work, { recursive: true, force: true });
});

const tuningPath = () => path.join(work, 'gravity-shift/src/game/tuning.json');
const readTuning = () => JSON.parse(readFileSync(tuningPath(), 'utf8')) as Record<string, number | boolean>;
const writeTuning = (t: Record<string, number | boolean>) => writeFileSync(tuningPath(), `${JSON.stringify(t, null, 2)}\n`);

describe('project status and validation', () => {
  it('detects Phaser, the record, scenarios and the headless harness', () => {
    const r = projectStatus(ctx, { projectPath: rel }).data as Record<string, any>;
    expect(r.engine.id).toBe('phaser');
    expect(r.engine.version).toBe('3.90.0');
    expect(r.record.state).toBe('valid');
    expect(r.scenarios.map((s: { id: string }) => s.id)).toContain('jump-arc');
    expect(r.record.headless).toMatch(/available/);
  });

  it('returns UNSUPPORTED_ENGINE for a non-Phaser project', () => {
    expect(() => projectStatus(ctx, { projectPath: path.relative(repo, path.join(work, 'not-a-game')) })).toThrow(/PixiJS/);
  });

  it('refuses paths outside the workspace', () => {
    expect(() => projectStatus(ctx, { projectPath: '../../etc' })).toThrow(/outside/);
  });

  it('validates the design record against the Kiro requirements file and tuning', () => {
    const r = validateDesignTool(ctx, { projectPath: rel }).data as Record<string, any>;
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.checkedAgainst.requirementsFile).toBe('.kiro/specs/game/requirements.md');
  });
});

describe('sessions are restricted to declared commands', () => {
  it('rejects unknown commands, non-dev commands and remote URLs', async () => {
    await expect(startSession(ctx, { projectPath: rel, commandId: 'rm-rf' })).rejects.toThrow(/not declared/);
    await expect(startSession(ctx, { projectPath: rel, commandId: 'test' })).rejects.toThrow(/dev command/);
    await expect(startSession(ctx, { projectPath: rel, url: 'https://example.com/' })).rejects.toThrow(/loopback/);
  });
});

describe('assets', () => {
  it('generates, validates and records provenance', () => {
    const r = generateAssetTool(ctx, { projectPath: rel, id: 'test-enemy', request: { type: 'sprite', styleId: 'pixel-adventure', seed: 9, params: { kind: 'enemy' } } });
    expect(r.data['valid']).toBe(true);
    expect(r.images?.[0]?.mimeType).toBe('image/png');
    const manifest = JSON.parse(readFileSync(path.join(work, 'gravity-shift/.gamedna/assets-manifest.json'), 'utf8'));
    expect(manifest.assets.find((a: { id: string }) => a.id === 'test-enemy').seed).toBe(9);
  });
});

describe('headless scenarios', () => {
  it('runs a scenario with metrics and reproducibility', async () => {
    const r = (await runScenarioTool(ctx, { projectPath: rel, scenarioId: 'jump-arc', repeat: 5 })).data as Record<string, any>;
    expect(r.status).toBe('passed');
    expect(r.runtime).toBe('headless-node');
    expect(r.reproducibility.status).toBe('stable');
    expect(r.metrics.find((m: { id: string }) => m.id === 'jump.apexHeight').value).toBeGreaterThan(70);
  });

  it('detects the seeded double-jump fault with the first failing tick', async () => {
    const r = (await runScenarioTool(ctx, { projectPath: rel, scenarioId: 'double-jump-coyote', params: { 'fault.coyoteAfterJump': true } })).data as Record<string, any>;
    expect(r.status).toBe('failed');
    expect(r.firstFailure.checkId).toBe('MOVE-01');
    expect(r.firstFailure.tick).toBeGreaterThan(0);
  });
});

describe('experiment → selection → change → verify', () => {
  type V = { id: 'A' | 'B'; label: string; rationale: string; parameters: Record<string, number | boolean> };
  const variants: V[] = [
    { id: 'A' as const, label: 'Snappy', rationale: 'Faster, shorter arc', parameters: { 'movement.jumpVelocity': 560, 'movement.gravity': 1900, 'movement.acceleration': 3000 } },
    { id: 'B' as const, label: 'Floaty', rationale: 'Higher, slower arc', parameters: { 'movement.jumpVelocity': 480, 'movement.gravity': 1100, 'movement.airControl': 0.6 } },
  ];

  it('rejects protected or fault parameters in variants', () => {
    expect(() => createExperimentTool(ctx, { projectPath: rel, question: 'bad?', scenarioIds: ['jump-arc'], variants: [{ ...variants[0]!, parameters: { 'rules.respawnDelayMs': 900 } }, variants[1]!] })).toThrow(/Rejected/);
  });

  it('completes the loop and verifies the applied decision', async () => {
    const created = createExperimentTool(ctx, { projectPath: rel, question: 'Which jump feels best?', scenarioIds: ['jump-arc', 'double-jump-coyote'], protectedChecks: ['MOVE-01'], variants }).data as Record<string, any>;
    const before = readTuning();
    const compared = (await compareExperiment(ctx, { projectPath: rel, experimentId: created.experimentId, repeat: 2 })).data as Record<string, any>;
    expect(compared.workbenchUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#token=/);
    expect(compared.protectedChecks).toEqual({ baseline: 'passed', A: 'passed', B: 'passed' });
    expect(compared.metricDeltas.B.some((d: { metricId: string }) => d.metricId === 'jump.airtime')).toBe(true);
    expect(readTuning()).toEqual(before); // comparing never edits the working tree

    expect((getSelection(ctx, { projectPath: rel, experimentId: created.experimentId }).data as Record<string, any>).status).toBe('pending');
    const sel = recordSelectionTool(ctx, { projectPath: rel, experimentId: created.experimentId, variantId: 'B', userStatement: 'B feels the best to me', rationale: 'floaty suits the calm mood' }).data as Record<string, any>;
    expect(sel.decisionStatus).toBe('selected');

    const prep = prepareChange(ctx, { projectPath: rel, experimentId: created.experimentId }).data as Record<string, any>;
    expect(prep.patch.set).toEqual({ 'movement.airControl': 0.6, 'movement.gravity': 1100, 'movement.jumpVelocity': 480 });

    // Verify before applying: the parameter check must fail and the decision must not verify.
    writeTuning({ ...before, ...prep.patch.set, 'movement.gravity': 1500 });
    const bad = (await verify(ctx, { projectPath: rel, decisionId: prep.decisionId, runTests: false })).data as Record<string, any>;
    expect(bad.verified).toBe(false);
    expect(bad.decisionStatus).toBe('failed');
  });

  it('verifies a correctly applied change and refuses stale selections', async () => {
    const created = createExperimentTool(ctx, { projectPath: rel, question: 'Run speed?', scenarioIds: ['run-stop'], protectedChecks: ['MOVE-01'], variants: [
      { id: 'A', label: 'Brisk', rationale: 'faster', parameters: { 'movement.maxSpeed': 280 } },
      { id: 'B', label: 'Measured', rationale: 'slower', parameters: { 'movement.maxSpeed': 200 } },
    ] }).data as Record<string, any>;
    recordSelectionTool(ctx, { projectPath: rel, experimentId: created.experimentId, variantId: 'A', userStatement: 'go with A' });
    const prep = prepareChange(ctx, { projectPath: rel, experimentId: created.experimentId }).data as Record<string, any>;
    writeTuning({ ...readTuning(), ...prep.patch.set });
    const good = (await verify(ctx, { projectPath: rel, decisionId: prep.decisionId, runTests: false })).data as Record<string, any>;
    expect(good.checks.find((c: { id: string }) => c.id === 'PARAMS-APPLIED').status).toBe('passed');
    expect(good.checks.find((c: { id: string }) => c.id === 'MOVE-01').status).toBe('passed');
    // RUNTIME-PARAMS is not_tested without a browser session, so the decision stays "applied", not verified.
    expect(good.decisionStatus).toBe('applied');

    const stale = createExperimentTool(ctx, { projectPath: rel, question: 'Stale?', scenarioIds: ['run-stop'], variants: [
      { id: 'A', label: 'a', rationale: 'r', parameters: { 'movement.deceleration': 3000 } },
      { id: 'B', label: 'b', rationale: 'r', parameters: { 'movement.deceleration': 1500 } },
    ] }).data as Record<string, any>;
    recordSelectionTool(ctx, { projectPath: rel, experimentId: stale.experimentId, variantId: 'A', userStatement: 'A please' });
    writeTuning({ ...readTuning(), 'movement.coyoteTimeMs': 90 }); // someone edits the baseline
    expect(() => prepareChange(ctx, { projectPath: rel, experimentId: stale.experimentId })).toThrow(/stale/);
  });

  it('exports a sanitized report', () => {
    const r = exportReport(ctx, { projectPath: rel }).data as Record<string, any>;
    const md = readFileSync(path.join(work, 'gravity-shift', r.report), 'utf8');
    expect(md).toContain('# GameDNA evidence report: Gravity Shift');
    expect(md).not.toContain(repo);
  });
});

describe('workbench HTTP security', () => {
  it('requires the token, a loopback Host and same-origin writes', async () => {
    const port = await ctx.workbench.start();
    const base = `http://127.0.0.1:${port}`;
    expect((await fetch(`${base}/api/projects`)).status).toBe(401);
    const okRes = await fetch(`${base}/api/projects`, { headers: { 'X-GameDNA-Token': ctx.workbench.token } });
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    // fetch() cannot override Host, so use node:http for the DNS-rebinding check.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/projects', headers: { 'X-GameDNA-Token': ctx.workbench.token, Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(421);
    const crossOrigin = await fetch(`${base}/api/projects/gravity-shift/experiments/exp-x-0000/selection`, { method: 'POST', headers: { 'X-GameDNA-Token': ctx.workbench.token, Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    expect(crossOrigin.status).toBe(403);
  });
});
