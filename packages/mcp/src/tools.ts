import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  GameDNAError,
  GAMEDNA_VERSION,
  createExperiment,
  decisionFromSelection,
  diffParameters,
  effectiveParameters,
  metricDeltas,
  recordSelection,
  renderReport,
  transitionDecision,
  upsertDecision,
  validateDesign,
  worstStatus,
  type CheckStatus,
  type DecisionRecord,
  type ExperimentRecord,
  type ParameterValues,
  type ReportRun,
  type VariantEvidence,
} from '@gamedna/core';
import { newId, resolveInside, writeFileAtomic, writeJsonAtomic } from '@gamedna/core/node';
import { STYLE_PACKS, STYLE_PACK_IDS, getStylePack, mimeType, materializeAsset, readManifest, type AssetRequest } from '@gamedna/assets/node';
import { invalidateHarness } from './headless.js';
import {
  EVIDENCE_DIR,
  RECORD_FILE,
  baselineRevision,
  detectEngine,
  detectPackageManager,
  getScenario,
  listExperiments,
  listScenarios,
  loadDecisions,
  loadExperiment,
  loadRecord,
  loadTuning,
  readPackage,
  resolveFromProject,
  saveDecisions,
  saveExperiment,
  type LoadedProject,
} from './project.js';
import { executeScenario, saveScreenshot } from './runner.js';
import type { SessionManager } from './session.js';
import type { WorkbenchServer } from './workbench-server.js';

export interface ToolContext {
  workspaceRoot: string;
  sessions: SessionManager;
  workbench: WorkbenchServer;
  registry: Map<string, { root: string; relPath: string; name: string }>;
  now(): string;
}

export interface ImageOut {
  data: string;
  mimeType: string;
}
export interface ToolResult {
  data: Record<string, unknown>;
  images?: ImageOut[];
}

const ok = (data: Record<string, unknown>, images?: ImageOut[]): ToolResult => ({ data: { ok: true, ...data }, ...(images?.length ? { images } : {}) });

export function openProject(ctx: ToolContext, projectPath = '.'): LoadedProject {
  const root = resolveInside(ctx.workspaceRoot, projectPath);
  if (!existsSync(path.join(root, 'package.json'))) throw new GameDNAError('NOT_FOUND', `No package.json at ${projectPath}`, { fix: 'projectPath is relative to the workspace root, e.g. "apps/gravity-shift".' });
  detectEngine(root, readPackage(root));
  const record = loadRecord(root);
  const tuning = loadTuning(root, record);
  const relPath = path.relative(ctx.workspaceRoot, root) || '.';
  ctx.registry.set(record.projectId, { root, relPath, name: record.name });
  return { root, relPath, record, tuning };
}

// ------------------------------------------------------------------ gd_project_status

export function projectStatus(ctx: ToolContext, args: { projectPath?: string }): ToolResult {
  const root = resolveInside(ctx.workspaceRoot, args.projectPath ?? '.');
  const pkg = readPackage(root);
  const engine = detectEngine(root, pkg);
  const adapterInstalled = Boolean(pkg.deps['@gamedna/phaser-adapter']) || existsSync(path.join(root, 'src/dev/gamedna-adapter.ts'));
  const out: Record<string, unknown> = {
    gamednaVersion: GAMEDNA_VERSION,
    projectPath: path.relative(ctx.workspaceRoot, root) || '.',
    packageName: pkg.name,
    engine,
    packageManager: detectPackageManager(root, ctx.workspaceRoot),
    adapter: adapterInstalled ? 'installed (dev builds only)' : 'missing',
    browserRunner: resolveFromProject(root, 'playwright') ? 'playwright available' : 'playwright not installed (headless runs still work)',
    capabilities: ['project_status', 'style_packs', 'design_validation', 'asset_generation', 'headless_scenarios', 'browser_sessions', 'screenshots', 'experiments', 'workbench', 'decisions', 'verification', 'reports'],
  };
  if (!existsSync(path.join(root, RECORD_FILE))) {
    out['record'] = { state: 'missing', fix: `Create ${RECORD_FILE}; see power/skills/game-direction/SKILL.md for the schema.` };
    return ok(out);
  }
  const v = validateDesign(JSON.parse(readFileSync(path.join(root, RECORD_FILE), 'utf8')));
  if (!v.record) {
    out['record'] = { state: 'invalid', errors: v.errors };
    return ok(out);
  }
  const project = openProject(ctx, args.projectPath);
  const scen = listScenarios(root);
  const decisions = loadDecisions(root).decisions;
  const byStatus: Record<string, number> = {};
  for (const d of decisions) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  out['record'] = {
    state: 'valid',
    projectId: project.record.projectId,
    name: project.record.name,
    design: project.record.design,
    constraints: project.record.constraints,
    tuningFile: project.record.tuningFile,
    parameters: Object.fromEntries(Object.entries(project.record.parameters).map(([k, s]) => [k, { value: project.tuning[k], unit: s.unit, min: s.min, max: s.max, protected: s.protected, fault: s.fault }])),
    baselineRevision: baselineRevision(root, project.record),
    commands: project.record.commands,
    headless: project.record.harness ? `available (${project.record.harness.module}#${project.record.harness.export})` : 'not configured',
  };
  out['scenarios'] = scen.scenarios.map((s) => ({ id: s.id, description: s.description, checks: [...new Set(s.assertions.map((a) => a.checkId))], tags: s.tags, ...(s.detectsFault ? { detectsFault: s.detectsFault } : {}) }));
  if (scen.invalid.length) out['invalidScenarios'] = scen.invalid;
  out['experiments'] = listExperiments(root).map((e) => ({ experimentId: e.experimentId, question: e.question, status: e.status }));
  out['decisions'] = byStatus;
  out['sessions'] = ctx.sessions.list().filter((s) => s.projectId === project.record.projectId).map((s) => ({ sessionId: s.id, url: s.url }));
  return ok(out);
}

// ------------------------------------------------------------------ gd_get_style_pack

export function getStylePackTool(args: { packId?: string; section?: string }): ToolResult {
  if (!args.packId) return ok({ packs: STYLE_PACK_IDS.map((id) => ({ id, name: STYLE_PACKS[id].name, summary: STYLE_PACKS[id].summary })) });
  const pack = getStylePack(args.packId);
  if (!pack) throw new GameDNAError('NOT_FOUND', `Unknown style pack ${args.packId}`, { details: { available: STYLE_PACK_IDS } });
  if (args.section) {
    const value = (pack as unknown as Record<string, unknown>)[args.section];
    if (value === undefined) throw new GameDNAError('NOT_FOUND', `Section ${args.section} not in pack`, { details: { sections: Object.keys(pack) } });
    return ok({ packId: pack.id, section: args.section, value, license: pack.license });
  }
  return ok({ pack });
}

// ------------------------------------------------------------------ gd_validate_design

export function validateDesignTool(ctx: ToolContext, args: { projectPath?: string; candidate?: unknown }): ToolResult {
  const root = resolveInside(ctx.workspaceRoot, args.projectPath ?? '.');
  const candidate = args.candidate ?? JSON.parse(readFileSync(resolveInside(root, RECORD_FILE), 'utf8'));
  const prelim = validateDesign(candidate);
  let tuningValues: ParameterValues | null = null;
  let requirementsMarkdown: string | null = null;
  if (prelim.record) {
    try {
      tuningValues = loadTuning(root, prelim.record);
    } catch {
      tuningValues = null;
    }
    if (prelim.record.requirementsFile) {
      const f = resolveInside(root, prelim.record.requirementsFile);
      if (existsSync(f)) requirementsMarkdown = readFileSync(f, 'utf8');
    }
  }
  const v = validateDesign(candidate, { tuningValues, requirementsMarkdown });
  return ok({ valid: v.valid, errors: v.errors, warnings: v.warnings, conflicts: v.conflicts, missingRequirementRefs: v.missingRequirementRefs, checkedAgainst: { tuningFile: tuningValues ? prelim.record?.tuningFile : null, requirementsFile: requirementsMarkdown ? prelim.record?.requirementsFile : null } });
}

// ------------------------------------------------------------------ gd_generate_asset

export function generateAssetTool(ctx: ToolContext, args: { projectPath?: string; id: string; request: AssetRequest; dir?: string }): ToolResult {
  const root = resolveInside(ctx.workspaceRoot, args.projectPath ?? '.');
  const dir = args.dir ?? 'public/assets/generated';
  if (!/^[a-zA-Z0-9_./-]{1,120}$/.test(dir) || dir.includes('..')) throw new GameDNAError('PERMISSION_DENIED', 'dir must be a simple relative path inside the project');
  const m = materializeAsset(root, args.id, args.request, { dir, createdWith: 'gd_generate_asset', now: ctx.now() });
  const images: ImageOut[] = m.asset.payload.format === 'rgba' ? [{ data: m.bytes.toString('base64'), mimeType: 'image/png' }] : [];
  const preview = m.asset.payload.format === 'svg' || m.asset.payload.format === 'json' ? m.bytes.toString('utf8').slice(0, 1500) : undefined;
  return ok({ artifactId: m.entry.id, file: m.entry.file, mimeType: mimeType(m.asset), manifest: m.entry, diagnostics: m.diagnostics, valid: m.diagnostics.every((d) => d.status !== 'failed'), replacedExisting: m.replaced, ...(preview ? { preview } : {}) }, images);
}

// ------------------------------------------------------------------ sessions

export async function startSession(ctx: ToolContext, args: { projectPath?: string; commandId?: string; url?: string }): Promise<ToolResult> {
  const project = openProject(ctx, args.projectPath);
  const existing = ctx.sessions.forProject(project.record.projectId);
  if (existing) return ok({ sessionId: existing.id, url: existing.url, reused: true });
  const s = await ctx.sessions.start({ root: project.root, record: project.record, ...(args.commandId ? { commandId: args.commandId } : {}), ...(args.url ? { url: args.url } : {}) });
  const info = await s.page.evaluate(() => (window as unknown as { __GAMEDNA__: { info(): unknown } }).__GAMEDNA__.info(), undefined);
  return ok({ sessionId: s.id, url: s.url, ready: true, spawnedDevServer: s.spawned, browser: `chromium ${s.browserVersion}`, adapter: info, diagnostics: s.errors.slice(-5) });
}

export async function stopSession(ctx: ToolContext, args: { sessionId: string }): Promise<ToolResult> {
  return ok({ ...(await ctx.sessions.stop(args.sessionId)) });
}

export async function observe(ctx: ToolContext, args: { sessionId: string; fields?: string[]; screenshot?: boolean; eventCursor?: number; step?: number }): Promise<ToolResult> {
  const s = ctx.sessions.get(args.sessionId);
  type Api = { getSnapshot(f?: string[]): unknown; getEvents(c: number, l: number): unknown; step(n: number): unknown; info(): unknown };
  if (args.step) await s.page.evaluate((n) => (window as unknown as { __GAMEDNA__: Api }).__GAMEDNA__.step(n), args.step);
  const snap = await s.page.evaluate((f) => (window as unknown as { __GAMEDNA__: Api }).__GAMEDNA__.getSnapshot(f), args.fields ?? []);
  const events = await s.page.evaluate((c) => (window as unknown as { __GAMEDNA__: Api }).__GAMEDNA__.getEvents(c, 100), args.eventCursor ?? 0);
  const images: ImageOut[] = [];
  let screenshotId: string | null = null;
  if (args.screenshot) {
    const png = await s.page.screenshot({ type: 'png' });
    const project = openProject(ctx, path.relative(ctx.workspaceRoot, s.root) || '.');
    screenshotId = await saveScreenshot(project, png);
    images.push({ data: png.toString('base64'), mimeType: 'image/png' });
  }
  return ok({ sessionId: s.id, snapshot: snap, events, screenshotId, runtimeErrors: s.errors.slice(-10) }, images);
}

// ------------------------------------------------------------------ gd_run_scenario

export async function runScenarioTool(ctx: ToolContext, args: { projectPath?: string; sessionId?: string; scenarioId: string; seed?: number; repeat?: number; params?: ParameterValues; screenshots?: boolean }): Promise<ToolResult> {
  const session = args.sessionId ? ctx.sessions.get(args.sessionId) : undefined;
  const project = openProject(ctx, session ? path.relative(ctx.workspaceRoot, session.root) || '.' : args.projectPath);
  const scenario = getScenario(project.root, args.scenarioId);
  const revision = baselineRevision(project.root, project.record);
  const ex = await executeScenario({ project, scenario, overrides: args.params ?? {}, ...(args.seed !== undefined ? { seed: args.seed } : {}), repeat: args.repeat ?? 1, session, screenshots: args.screenshots ?? false, revision });
  const run = ex.runs[0]!;
  const status: CheckStatus = run.status === 'failed' ? 'failed' : ex.reproducibility.status === 'unstable' ? 'unstable' : run.status;
  return ok({
    status,
    scenarioId: run.scenarioId,
    runtime: ex.runtime,
    revision,
    seed: run.seed,
    params: args.params ?? {},
    checks: run.checks,
    firstFailure: run.firstFailure,
    metrics: ex.metrics,
    traceId: ex.traceId,
    screenshotIds: ex.screenshotIds,
    reproducibility: { status: ex.reproducibility.status, runs: ex.reproducibility.runs, note: ex.reproducibility.note },
    reproduction: { scenarioId: run.scenarioId, seed: run.seed, params: args.params ?? {}, inputs: run.inputs.length },
    stepMode: run.stepMode,
    ticks: run.ticks,
    limitations: ex.limitations,
  });
}

// ------------------------------------------------------------------ experiments

export function createExperimentTool(ctx: ToolContext, args: { projectPath?: string; expectedBaselineRevision?: string; question: string; scenarioIds: string[]; protectedChecks?: string[]; variants: Array<{ id: 'A' | 'B' | 'C'; label: string; rationale: string; changes?: string; parameters: ParameterValues }> }): ToolResult {
  const project = openProject(ctx, args.projectPath);
  const revision = baselineRevision(project.root, project.record);
  if (args.expectedBaselineRevision && args.expectedBaselineRevision !== revision) {
    throw new GameDNAError('STALE_BASELINE', 'The project changed since the baseline you expected', { details: { expected: args.expectedBaselineRevision, current: revision } });
  }
  const exp = createExperiment({
    project: project.record,
    baselineValues: project.tuning,
    revision,
    experimentId: newId('exp', new Date(ctx.now())),
    now: ctx.now(),
    knownScenarioIds: listScenarios(project.root).scenarios.map((s) => s.id),
    input: { question: args.question, scenarioIds: args.scenarioIds, protectedChecks: args.protectedChecks ?? [], variants: args.variants.map((v) => ({ ...v, changes: v.changes ?? '' })) },
  });
  saveExperiment(project.root, exp);
  return ok({
    experimentId: exp.experimentId,
    baselineRevision: revision,
    variants: exp.variants.map((v) => ({ id: v.id, label: v.label, overrides: v.parameters, diff: diffParameters(exp.baselineParameters, effectiveParameters(exp, v.id), project.record.parameters) })),
    workingTreeChanged: false,
    next: 'Call gd_compare_experiment to measure the variants and open the workbench for the user to play and choose.',
  });
}

export async function compareExperiment(ctx: ToolContext, args: { projectPath?: string; experimentId: string; sessionId?: string; repeat?: number }): Promise<ToolResult> {
  const project = openProject(ctx, args.projectPath);
  let exp = loadExperiment(project.root, args.experimentId);
  const session = args.sessionId ? ctx.sessions.get(args.sessionId) : ctx.sessions.forProject(project.record.projectId);
  const revision = baselineRevision(project.root, project.record);
  const results: Record<string, VariantEvidence[]> = {};
  const warnings: string[] = [];
  if (revision !== exp.baselineRevision) warnings.push(`Baseline changed since the experiment was created (${exp.baselineRevision} → ${revision}); evidence reflects the current files.`);
  for (const v of exp.variants) {
    results[v.id] = [];
    for (const scenarioId of exp.scenarioIds) {
      const scenario = getScenario(project.root, scenarioId);
      const ex = await executeScenario({ project, scenario, overrides: v.parameters, repeat: args.repeat ?? 3, session, screenshots: Boolean(session), revision });
      const run = ex.runs[0]!;
      const checks = run.checks.filter((c) => exp.protectedChecks.length === 0 || exp.protectedChecks.includes(c.id));
      results[v.id]!.push({
        scenarioId,
        status: run.status === 'failed' ? 'failed' : ex.reproducibility.status === 'unstable' ? 'unstable' : worstStatus(checks.map((c) => c.status)),
        checks,
        metrics: ex.metrics,
        traceId: ex.traceId,
        reproducibility: `${ex.reproducibility.status}: ${ex.reproducibility.note}`,
        screenshotIds: ex.screenshotIds,
      });
    }
  }
  exp = { ...exp, evidence: { generatedAt: ctx.now(), sessionId: session?.id ?? null, seedNote: 'Each scenario uses its own fixed seed for every variant.', results, notTestedReason: null } };
  saveExperiment(project.root, exp);
  await ctx.workbench.start();
  const deltas = Object.fromEntries(exp.variants.filter((v) => v.id !== 'baseline').map((v) => [v.id, metricDeltas(exp, v.id).filter((d) => d.delta !== 0 && d.delta !== null)]));
  const protectedSummary = Object.fromEntries(Object.entries(results).map(([vid, evs]) => [vid, worstStatus(evs.map((e) => e.status))]));
  return ok({
    experimentId: exp.experimentId,
    runtime: session ? 'browser' : 'headless-node',
    protectedChecks: protectedSummary,
    metricDeltas: deltas,
    workbenchUrl: ctx.workbench.url({ projectId: project.record.projectId, experimentId: exp.experimentId }),
    playable: project.record.commands['dev']?.url ? 'Variants load in the workbench from the dev server; it must be running (gd_start_session or npm run dev).' : 'No dev URL configured; the workbench can show evidence only.',
    warnings,
    next: 'Share workbenchUrl with the user. Do not choose for them. Then call gd_get_selection.',
  });
}

function decisionForExperiment(root: string, experimentId: string): DecisionRecord | undefined {
  return loadDecisions(root).decisions.find((d) => d.experimentId === experimentId);
}

/** Ensure a decision exists once an experiment has a user selection. */
export function syncDecision(ctx: ToolContext, root: string, exp: ExperimentRecord): DecisionRecord | undefined {
  if (!exp.selection) return undefined;
  const existing = decisionForExperiment(root, exp.experimentId);
  if (existing) return existing;
  const record = loadRecord(root);
  const dec = decisionFromSelection(exp, record, newId('dec', new Date(ctx.now())), ctx.now());
  saveDecisions(root, upsertDecision(loadDecisions(root), dec));
  saveExperiment(root, { ...exp, decisionId: dec.decisionId });
  return dec;
}

export function getSelection(ctx: ToolContext, args: { projectPath?: string; experimentId: string }): ToolResult {
  const project = openProject(ctx, args.projectPath);
  const exp = loadExperiment(project.root, args.experimentId);
  if (exp.status === 'pending') return ok({ experimentId: exp.experimentId, status: 'pending', message: 'The user has not chosen yet. Wait; do not infer a choice.' });
  const dec = syncDecision(ctx, project.root, exp);
  return ok({ experimentId: exp.experimentId, status: exp.status, selection: exp.selection, decisionId: dec?.decisionId ?? null, decisionStatus: dec?.status ?? null, parameterDiff: dec?.parameterDiff ?? [] });
}

export function recordSelectionTool(ctx: ToolContext, args: { projectPath?: string; experimentId: string; variantId: 'baseline' | 'A' | 'B' | 'C' | null; userStatement: string; rationale?: string }): ToolResult {
  const project = openProject(ctx, args.projectPath);
  const exp = recordSelection(loadExperiment(project.root, args.experimentId), { variantId: args.variantId, source: 'chat', userStatement: args.userStatement, ...(args.rationale ? { rationale: args.rationale } : {}) }, ctx.now());
  saveExperiment(project.root, exp);
  const dec = syncDecision(ctx, project.root, exp);
  return ok({ experimentId: exp.experimentId, status: exp.status, decisionId: dec?.decisionId ?? null, decisionStatus: dec?.status ?? null });
}

// ------------------------------------------------------------------ gd_prepare_change

export function prepareChange(ctx: ToolContext, args: { projectPath?: string; experimentId: string; expectedBaselineRevision?: string; mode?: 'apply' | 'revert' }): ToolResult {
  const project = openProject(ctx, args.projectPath);
  const exp = loadExperiment(project.root, args.experimentId);
  const dec = syncDecision(ctx, project.root, exp);
  if (!dec || exp.selection?.variantId === null || exp.selection === null) {
    throw new GameDNAError('INVALID_TRANSITION', exp.status === 'rejected' ? 'The user rejected all variants; nothing to apply' : 'No selection yet', { fix: 'Wait for the user to choose in the workbench (gd_get_selection).' });
  }
  const current = baselineRevision(project.root, project.record);
  const mode = args.mode ?? 'apply';
  if (mode === 'revert') {
    const set = Object.fromEntries(dec.parameterDiff.filter((d) => d.from !== undefined).map((d) => [d.key, d.from]));
    return ok({ decisionId: dec.decisionId, mode, patch: { file: project.record.tuningFile, set }, instructions: `Edit ${project.record.tuningFile} to set these keys back, then call gd_verify with decisionId ${dec.decisionId} and revert: true.` });
  }
  if (dec.status !== 'selected') throw new GameDNAError('INVALID_TRANSITION', `Decision ${dec.decisionId} is ${dec.status}; only selected decisions can be prepared`);
  const expected = args.expectedBaselineRevision ?? exp.baselineRevision;
  if (current !== expected || current !== exp.baselineRevision) {
    const stale = transitionDecision(dec, 'stale', `Baseline moved from ${exp.baselineRevision} to ${current}`, ctx.now());
    saveDecisions(project.root, upsertDecision(loadDecisions(project.root), stale));
    throw new GameDNAError('STALE_BASELINE', 'The tuning or design record changed after the experiment was created; the selection is stale', {
      details: { experimentRevision: exp.baselineRevision, currentRevision: current, decisionId: dec.decisionId },
      fix: 'Create a new experiment from the current baseline and ask the user to choose again.',
    });
  }
  const set = Object.fromEntries(dec.parameterDiff.map((d) => [d.key, d.to]));
  return ok({
    decisionId: dec.decisionId,
    mode,
    baselineRevision: current,
    patch: { file: project.record.tuningFile, set, diff: dec.parameterDiff },
    instructions: `Apply with your normal edit tools: in ${project.record.tuningFile}, set each key to the value shown and change nothing else. Then call gd_verify with decisionId ${dec.decisionId}.`,
  });
}

// ------------------------------------------------------------------ gd_verify

interface VerifyCheck {
  id: string;
  status: CheckStatus;
  evidence: string;
  traceId?: string;
}

function runTestCommand(root: string, script: string, timeoutMs: number): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['run', script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' } });
    let out = '';
    const add = (d: Buffer) => {
      // eslint-disable-next-line no-control-regex
      out = (out + d.toString().replace(/\u001b\[[0-9;]*m/g, '')).slice(-4000);
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: null, output: out, timedOut: true });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output: out, timedOut: false });
    });
  });
}

export async function verify(ctx: ToolContext, args: { projectPath?: string; decisionId?: string; checkIds?: string[]; sessionId?: string; runTests?: boolean; revert?: boolean }): Promise<ToolResult> {
  const project = openProject(ctx, args.projectPath);
  await invalidateHarness(project.root); // pick up edited tuning and source
  const session = args.sessionId ? ctx.sessions.get(args.sessionId) : undefined;
  const checks: VerifyCheck[] = [];
  let decision: DecisionRecord | undefined;
  if (args.decisionId) {
    decision = loadDecisions(project.root).decisions.find((d) => d.decisionId === args.decisionId);
    if (!decision) throw new GameDNAError('NOT_FOUND', `Decision ${args.decisionId} not found`);
    if (!['selected', 'applied'].includes(decision.status)) throw new GameDNAError('INVALID_TRANSITION', `Decision ${decision.decisionId} is ${decision.status}`);
    const target = (k: { from?: unknown; to: unknown }) => (args.revert ? k.from : k.to);
    const mismatched = decision.parameterDiff.filter((d) => project.tuning[d.key] !== target(d));
    checks.push({
      id: args.revert ? 'PARAMS-REVERTED' : 'PARAMS-APPLIED',
      status: mismatched.length ? 'failed' : 'passed',
      evidence: mismatched.length ? `${project.record.tuningFile} differs: ${mismatched.map((d) => `${d.key}=${String(project.tuning[d.key])} (expected ${String(target(d))})`).join(', ')}` : `${project.record.tuningFile} holds every ${args.revert ? 'baseline' : 'selected'} value`,
    });
    // Effective runtime parameters: reload the page so the dev server serves the edited file.
    if (session) {
      await ctx.sessions.load(session, true);
      const runtime = await session.page.evaluate(() => (window as unknown as { __GAMEDNA__: { getParameters(): Record<string, unknown> } }).__GAMEDNA__.getParameters(), undefined);
      const off = decision.parameterDiff.filter((d) => runtime[d.key] !== target(d));
      checks.push({ id: 'RUNTIME-PARAMS', status: off.length ? 'failed' : 'passed', evidence: off.length ? `Running game uses ${off.map((d) => `${d.key}=${String(runtime[d.key])}`).join(', ')}` : 'Running game reports the expected effective parameters' });
    } else {
      checks.push({ id: 'RUNTIME-PARAMS', status: 'not_tested', evidence: 'No browser session; the tuning file was checked directly.' });
    }
  }

  const wanted = args.checkIds?.length ? args.checkIds : decision?.protectedChecks.length ? decision.protectedChecks : project.record.constraints.map((c) => c.id);
  const unknown = wanted.filter((id) => !project.record.constraints.some((c) => c.id === id));
  if (unknown.length) throw new GameDNAError('NOT_FOUND', `Unknown check(s): ${unknown.join(', ')}`);
  const revision = baselineRevision(project.root, project.record);
  const scenarios = listScenarios(project.root).scenarios.filter((s) => s.assertions.some((a) => wanted.includes(a.checkId)));
  const perCheck = new Map<string, VerifyCheck[]>();
  for (const s of scenarios) {
    try {
      const ex = await executeScenario({ project, scenario: s, repeat: 2, session, revision });
      const run = ex.runs[0]!;
      for (const c of run.checks.filter((x) => wanted.includes(x.id))) {
        const status: CheckStatus = c.status === 'passed' && ex.reproducibility.status === 'unstable' ? 'unstable' : c.status;
        perCheck.set(c.id, [...(perCheck.get(c.id) ?? []), { id: c.id, status, evidence: `${s.id} (${ex.runtime}): ${c.observed ?? ''}`, traceId: ex.traceId }]);
      }
    } catch (err) {
      // A tool failure is never a pass.
      for (const id of new Set(s.assertions.map((a) => a.checkId).filter((x) => wanted.includes(x)))) {
        perCheck.set(id, [...(perCheck.get(id) ?? []), { id, status: 'not_tested', evidence: `${s.id}: could not run (${(err as Error).message})` }]);
      }
    }
  }
  for (const id of wanted) {
    const list = perCheck.get(id);
    if (!list) checks.push({ id, status: 'not_tested', evidence: 'No scenario asserts this check. Add one under .gamedna/scenarios/.' });
    else checks.push({ id, status: worstStatus(list.map((l) => l.status)), evidence: list.map((l) => l.evidence).join(' | '), ...(list[0]?.traceId ? { traceId: list[0].traceId } : {}) });
  }

  if (args.runTests !== false) {
    const cmd = Object.values(project.record.commands).find((c) => c.kind === 'test');
    if (!cmd) checks.push({ id: 'PROJECT-TESTS', status: 'not_tested', evidence: 'No test command declared in project.json' });
    else {
      const r = await runTestCommand(project.root, cmd.script, cmd.timeoutMs);
      checks.push({ id: 'PROJECT-TESTS', status: r.timedOut ? 'not_tested' : r.code === 0 ? 'passed' : 'failed', evidence: r.timedOut ? `Timed out after ${cmd.timeoutMs} ms` : `npm run ${cmd.script} exited ${r.code}: ${r.output.trim().split('\n').slice(-4).join(' / ')}` });
    }
  }

  const overall = worstStatus(checks.map((c) => c.status));
  let decisionStatus: string | null = null;
  if (decision) {
    let d = decision;
    if (args.revert) {
      if (d.status === 'applied' && overall === 'passed') d = transitionDecision(d, 'reverted', 'Baseline restored and verified', ctx.now());
    } else {
      if (d.status === 'selected') d = transitionDecision(d, 'applied', 'Kiro applied the parameter patch', ctx.now(), { appliedRevision: revision });
      if (overall === 'passed') d = transitionDecision(d, 'verified', `All ${checks.length} checks passed`, ctx.now());
      else if (checks.some((c) => c.status === 'failed')) d = transitionDecision(d, 'failed', `Failed: ${checks.filter((c) => c.status === 'failed').map((c) => c.id).join(', ')}`, ctx.now());
      // not_tested / unstable leave the decision "applied": it is not verified.
    }
    d = { ...d, evidenceIds: [...new Set([...d.evidenceIds, ...checks.flatMap((c) => (c.traceId ? [c.traceId] : []))])] };
    saveDecisions(project.root, upsertDecision(loadDecisions(project.root), d));
    decisionStatus = d.status;
  }
  return ok({ status: overall, verified: overall === 'passed', decisionId: decision?.decisionId ?? null, decisionStatus, revision, runtime: session ? 'browser' : 'headless-node', checks });
}

// ------------------------------------------------------------------ gd_export_report

export function exportReport(ctx: ToolContext, args: { projectPath?: string; traceIds?: string[] }): ToolResult {
  const project = openProject(ctx, args.projectPath);
  const traceDir = resolveInside(project.root, path.posix.join(EVIDENCE_DIR, 'traces'));
  const available = existsSync(traceDir) ? readdirSync(traceDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort() : [];
  const ids = args.traceIds?.length ? args.traceIds : available.slice(-20);
  const runs: ReportRun[] = [];
  for (const id of ids) {
    if (!/^trace-[a-z0-9-]+$/.test(id)) continue;
    const file = resolveInside(project.root, path.posix.join(EVIDENCE_DIR, 'traces', `${id}.json`));
    if (!existsSync(file)) continue;
    const t = JSON.parse(readFileSync(file, 'utf8')) as { run: { scenarioId: string; seed: number; status: CheckStatus; revision: string; params: Record<string, unknown>; checks: ReportRun['checks']; limitations: string[] } };
    runs.push({ traceId: id, scenarioId: t.run.scenarioId, seed: t.run.seed, status: t.run.status, revision: t.run.revision, params: t.run.params, checks: t.run.checks, metrics: [], limitations: t.run.limitations });
  }
  const manifest = readManifest(project.root);
  const engine = detectEngine(project.root, readPackage(project.root));
  const md = renderReport({
    projectId: project.record.projectId,
    projectName: project.record.name,
    generatedAt: ctx.now(),
    revision: baselineRevision(project.root, project.record),
    engine: `phaser ${engine.version}`,
    runs,
    experiments: listExperiments(project.root),
    decisions: loadDecisions(project.root).decisions,
    assets: manifest.assets,
    limitations: [
      'Scenario checks cover only the defined scenarios; they do not prove all behavior.',
      'Timings are in simulation ticks (60 Hz), not end-to-end hardware latency.',
      'Subjective quality comes from recorded user selections, not from metrics.',
    ],
  });
  const stamp = ctx.now().replace(/[-:]/g, '').replace(/\..*/, '');
  const mdRel = path.posix.join('.gamedna/reports', `report-${stamp}.md`);
  writeFileAtomic(resolveInside(project.root, mdRel), md);
  const jsonRel = path.posix.join('.gamedna/reports', `report-${stamp}.json`);
  writeJsonAtomic(resolveInside(project.root, jsonRel), { generatedAt: ctx.now(), runs, decisions: loadDecisions(project.root).decisions, assets: manifest.assets });
  return ok({ report: mdRel, json: jsonRel, runs: runs.length, sanitized: 'Reports contain project-relative paths, parameters, check results and hashes only. No environment variables, tokens or absolute paths.' });
}
