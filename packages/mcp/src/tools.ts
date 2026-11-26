import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  GameDNAError,
  GAMEDNA_VERSION,
  LIMITS,
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
import { prepareCommand, resolveTool, runCommand, setToolPath } from './commands.js';
import { adapterStatus, adaptersRoot, detectProject, type DetectedEngine } from './engines.js';
import { invalidateHarness } from './headless.js';
import {
  EVIDENCE_DIR,
  RECORD_FILE,
  baselineRevision,
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
import { adapterScreenshot, canScreenshot, executeScenario, saveScreenshot, type ScenarioTarget } from './runner.js';
import type { ProcessSession, Session, SessionManager } from './session.js';
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
  const record = existsSync(resolveInside(root, RECORD_FILE)) ? loadRecord(root) : undefined;
  const engine = detectProject(root, record);
  if (!record) throw new GameDNAError('NOT_FOUND', `${RECORD_FILE} not found in ${projectPath}`, { fix: `Create ${RECORD_FILE}; see power/skills/game-direction/SKILL.md for the schema.` });
  const tuning = loadTuning(root, record);
  const relPath = path.relative(ctx.workspaceRoot, root) || '.';
  ctx.registry.set(record.projectId, { root, relPath, name: record.name });
  return { root, relPath, record, tuning, engine };
}

/** The engine of a folder, using the record when it is valid (it decides custom engines). */
function engineAt(root: string): DetectedEngine {
  let record;
  try {
    record = loadRecord(root);
  } catch {
    record = undefined;
  }
  return detectProject(root, record);
}

const RUNTIME_CAPABILITIES: Record<DetectedEngine['profile']['runtime'], string[]> = {
  browser: ['headless_scenarios', 'browser_sessions', 'screenshots'],
  process: ['process_sessions', 'attach_sessions', 'adapter_screenshots'],
  android: [],
};

function sessionSummary(s: Session): Record<string, unknown> {
  if (s.runtime === 'browser') return { sessionId: s.id, runtime: s.runtime, url: s.url };
  return { sessionId: s.id, runtime: s.runtime, bridge: s.bridge.address, status: s.bridge.driver && !s.bridge.driver.closed ? 'ready' : s.bridge.driver ? 'disconnected' : 'waiting', launched: s.process !== null };
}

// ------------------------------------------------------------------ gd_project_status

export function projectStatus(ctx: ToolContext, args: { projectPath?: string }): ToolResult {
  const root = resolveInside(ctx.workspaceRoot, args.projectPath ?? '.');
  const recordFile = resolveInside(root, RECORD_FILE);
  const v = existsSync(recordFile) ? validateDesign(JSON.parse(readFileSync(recordFile, 'utf8'))) : null;
  const { profile, version } = detectProject(root, v?.record ?? undefined);
  const hasPackage = existsSync(resolveInside(root, 'package.json'));
  const out: Record<string, unknown> = {
    gamednaVersion: GAMEDNA_VERSION,
    projectPath: path.relative(ctx.workspaceRoot, root) || '.',
    engine: { id: profile.id, label: profile.label, version, runtime: profile.runtime, verified: profile.verified },
    adapter: adapterStatus(root, profile),
    tools: profile.tools.map((name) => {
      try {
        const r = resolveTool(name, root);
        return { name, path: r?.path ?? null, source: r?.source ?? null };
      } catch (err) {
        return { name, path: null, source: null, error: (err as Error).message };
      }
    }),
    assetDir: profile.assetDir,
    ...(hasPackage ? { packageName: readPackage(root).name, packageManager: detectPackageManager(root, ctx.workspaceRoot) } : {}),
    ...(profile.runtime === 'browser' ? { browserRunner: resolveFromProject(root, 'playwright') ? 'playwright available' : 'playwright not installed (headless runs still work)' } : {}),
    capabilities: ['project_status', 'style_packs', 'design_validation', 'asset_generation', ...RUNTIME_CAPABILITIES[profile.runtime], 'experiments', 'workbench', 'decisions', 'verification', 'reports'],
  };
  if (!v) {
    out['record'] = { state: 'missing', fix: `Create ${RECORD_FILE}; see power/skills/game-direction/SKILL.md for the schema.` };
    return ok(out);
  }
  if (!v.record) {
    out['record'] = { state: 'invalid', errors: v.errors };
    return ok(out);
  }
  const project = openProject(ctx, args.projectPath);
  const scen = listScenarios(root);
  const decisions = loadDecisions(root).decisions;
  const byStatus: Record<string, number> = {};
  for (const d of decisions) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  const headlessCommand = Object.entries(project.record.commands).find(([, c]) => c.kind === 'headless')?.[0];
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
    headless:
      profile.runtime === 'browser'
        ? project.record.harness
          ? `available (${project.record.harness.module}#${project.record.harness.export})`
          : 'not configured'
        : headlessCommand
          ? `available (command "${headlessCommand}")`
          : 'not configured',
  };
  out['scenarios'] = scen.scenarios.map((s) => ({ id: s.id, description: s.description, checks: [...new Set(s.assertions.map((a) => a.checkId))], tags: s.tags, ...(s.detectsFault ? { detectsFault: s.detectsFault } : {}) }));
  if (scen.invalid.length) out['invalidScenarios'] = scen.invalid;
  out['experiments'] = listExperiments(root).map((e) => ({ experimentId: e.experimentId, question: e.question, status: e.status }));
  out['decisions'] = byStatus;
  out['sessions'] = ctx.sessions.list().filter((s) => s.projectId === project.record.projectId).map(sessionSummary);
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
  const dir = args.dir ?? engineAt(root).profile.assetDir;
  if (!/^[a-zA-Z0-9_./-]{1,120}$/.test(dir) || dir.includes('..')) throw new GameDNAError('PERMISSION_DENIED', 'dir must be a simple relative path inside the project');
  const m = materializeAsset(root, args.id, args.request, { dir, createdWith: 'gd_generate_asset', now: ctx.now() });
  const images: ImageOut[] = m.asset.payload.format === 'rgba' ? [{ data: m.bytes.toString('base64'), mimeType: 'image/png' }] : [];
  const preview = m.asset.payload.format === 'svg' || m.asset.payload.format === 'json' ? m.bytes.toString('utf8').slice(0, 1500) : undefined;
  return ok({ artifactId: m.entry.id, file: m.entry.file, mimeType: mimeType(m.asset), manifest: m.entry, diagnostics: m.diagnostics, valid: m.diagnostics.every((d) => d.status !== 'failed'), replacedExisting: m.replaced, ...(preview ? { preview } : {}) }, images);
}

// ------------------------------------------------------------------ sessions

function processSessionInfo(s: ProcessSession): Record<string, unknown> {
  const driver = s.bridge.driver;
  if (driver) {
    const { token: _token, ...adapter } = driver.hello;
    return { sessionId: s.id, runtime: 'process', status: driver.closed ? 'disconnected' : 'ready', ready: !driver.closed, launched: s.process !== null, commandId: s.commandId, adapter, diagnostics: s.errors.slice(-5) };
  }
  return {
    sessionId: s.id,
    runtime: 'process',
    status: 'waiting',
    ready: false,
    bridge: s.bridge.address,
    token: s.token,
    launchEnv: s.launchEnv,
    next: 'Launch a development build of the game with launchEnv set, for example from the editor. The next call on this session waits up to 30 s for the game to connect.',
  };
}

export async function startSession(ctx: ToolContext, args: { projectPath?: string; commandId?: string; url?: string }): Promise<ToolResult> {
  const project = openProject(ctx, args.projectPath);
  const existing = ctx.sessions.forProject(project.record.projectId);
  if (existing) return ok(existing.runtime === 'browser' ? { sessionId: existing.id, url: existing.url, reused: true } : { ...processSessionInfo(existing), reused: true });
  const s = await ctx.sessions.start({ root: project.root, record: project.record, profile: project.engine.profile, ...(args.commandId ? { commandId: args.commandId } : {}), ...(args.url ? { url: args.url } : {}) });
  if (s.runtime === 'process') return ok(processSessionInfo(s));
  const info = await s.page.evaluate(() => (window as unknown as { __GAMEDNA__: { info(): unknown } }).__GAMEDNA__.info(), undefined);
  return ok({ sessionId: s.id, url: s.url, ready: true, spawnedDevServer: s.spawned, browser: `chromium ${s.browserVersion}`, adapter: info, diagnostics: s.errors.slice(-5) });
}

export async function stopSession(ctx: ToolContext, args: { sessionId: string }): Promise<ToolResult> {
  return ok({ ...(await ctx.sessions.stop(args.sessionId)) });
}

interface AcquiredTarget {
  target: ScenarioTarget;
  sessionId: string | null;
  release(): Promise<void>;
}

/**
 * Where scenarios run: the given session, the harness module for browser engines, or a temporary
 * session from the record's headless command for every other engine. `release` stops a temporary session.
 */
async function acquireTarget(ctx: ToolContext, project: LoadedProject, session: Session | undefined): Promise<AcquiredTarget> {
  const keep = async () => undefined;
  if (session?.runtime === 'browser') return { target: { runtime: 'browser', session }, sessionId: session.id, release: keep };
  if (session) return { target: { runtime: 'process', driver: await ctx.sessions.driver(session) }, sessionId: session.id, release: keep };
  const { profile } = project.engine;
  if (profile.runtime === 'browser') return { target: { runtime: 'headless-node' }, sessionId: null, release: keep };
  const headless = Object.entries(project.record.commands).find(([, c]) => c.kind === 'headless')?.[0];
  if (!headless) {
    throw new GameDNAError('SESSION_NOT_READY', `${profile.label} scenarios need a running game`, {
      fix: 'Start a session with gd_start_session, or declare a "headless" command (argv) in .gamedna/project.json that launches the game with the adapter.',
    });
  }
  const temp = await ctx.sessions.start({ root: project.root, record: project.record, profile, commandId: headless });
  const release = async () => {
    await ctx.sessions.stop(temp.id);
  };
  if (temp.runtime !== 'process') {
    await release();
    throw new GameDNAError('INVALID_INPUT', `Command "${headless}" did not start a process session`);
  }
  try {
    return { target: { runtime: 'process', driver: await ctx.sessions.driver(temp) }, sessionId: temp.id, release };
  } catch (err) {
    await release();
    throw err;
  }
}

async function observeProcess(ctx: ToolContext, s: ProcessSession, args: { fields?: string[]; screenshot?: boolean; eventCursor?: number; step?: number }): Promise<ToolResult> {
  const driver = await ctx.sessions.driver(s);
  let stepped: Record<string, unknown> | null = null;
  if (args.step) {
    await driver.call('control', { mode: 'controlled' });
    const from = (await driver.call('snapshot', {})).tick;
    const to = from + args.step;
    const r = await driver.call('advance', { to, inputs: [], sampleEvery: to + 1, lastTick: to, maxEvents: LIMITS.maxEvents });
    stepped = { mode: 'controlled', from, to: r.tick, events: r.events.length };
  }
  const snap = await driver.call('snapshot', args.fields?.length ? { fields: args.fields } : {});
  const events = await driver.call('events', { cursor: args.eventCursor ?? 0, limit: 100 });
  const images: ImageOut[] = [];
  const limitations: string[] = [];
  let screenshotId: string | null = null;
  if (args.screenshot && canScreenshot(driver)) {
    const png = await adapterScreenshot(driver);
    screenshotId = await saveScreenshot(openProject(ctx, path.relative(ctx.workspaceRoot, s.root) || '.'), png);
    images.push({ data: png.toString('base64'), mimeType: 'image/png' });
  } else if (args.screenshot) {
    limitations.push(`The ${driver.hello.engine} adapter does not offer screenshots (hello.capabilities).`);
  }
  const missing = (args.fields ?? []).filter((f) => !(f in snap.state));
  return ok({ sessionId: s.id, runtime: 'process', snapshot: { tick: snap.tick, state: snap.state, missing }, events, stepped, screenshotId, limitations, runtimeErrors: s.errors.slice(-10) }, images);
}

export async function observe(ctx: ToolContext, args: { sessionId: string; fields?: string[]; screenshot?: boolean; eventCursor?: number; step?: number }): Promise<ToolResult> {
  const s = ctx.sessions.get(args.sessionId);
  if (s.runtime === 'process') return observeProcess(ctx, s, args);
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
  const acquired = await acquireTarget(ctx, project, session);
  let ex;
  try {
    ex = await executeScenario({ project, scenario, overrides: args.params ?? {}, ...(args.seed !== undefined ? { seed: args.seed } : {}), repeat: args.repeat ?? 1, target: acquired.target, screenshots: args.screenshots ?? false, revision });
  } finally {
    await acquired.release();
  }
  const run = ex.runs[0]!;
  const status: CheckStatus = run.status === 'failed' ? 'failed' : ex.reproducibility.status === 'unstable' ? 'unstable' : run.status;
  return ok({
    status,
    scenarioId: run.scenarioId,
    runtime: ex.runtime,
    sessionId: acquired.sessionId,
    ...(acquired.sessionId && !session ? { temporarySession: true } : {}),
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
  const acquired = await acquireTarget(ctx, project, session);
  const { target } = acquired;
  try {
    for (const v of exp.variants) {
      results[v.id] = [];
      for (const scenarioId of exp.scenarioIds) {
        const scenario = getScenario(project.root, scenarioId);
        const ex = await executeScenario({ project, scenario, overrides: v.parameters, repeat: args.repeat ?? 3, target, screenshots: target.runtime !== 'headless-node', revision });
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
  } finally {
    await acquired.release();
  }
  exp = { ...exp, evidence: { generatedAt: ctx.now(), sessionId: session?.id ?? null, seedNote: 'Each scenario uses its own fixed seed for every variant.', results, notTestedReason: null } };
  saveExperiment(project.root, exp);
  await ctx.workbench.start();
  const deltas = Object.fromEntries(exp.variants.filter((v) => v.id !== 'baseline').map((v) => [v.id, metricDeltas(exp, v.id).filter((d) => d.delta !== 0 && d.delta !== null)]));
  const protectedSummary = Object.fromEntries(Object.entries(results).map(([vid, evs]) => [vid, worstStatus(evs.map((e) => e.status))]));
  return ok({
    experimentId: exp.experimentId,
    runtime: target.runtime,
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

/** What the running game reports for the decision's parameters. A failure to ask is not_tested, never passed. */
async function runtimeParamsCheck(ctx: ToolContext, target: ScenarioTarget | null, targetError: string | null, decision: DecisionRecord, revert: boolean): Promise<VerifyCheck> {
  const id = 'RUNTIME-PARAMS';
  if (!target) return { id, status: 'not_tested', evidence: `Could not reach the game: ${targetError}` };
  if (target.runtime === 'headless-node') return { id, status: 'not_tested', evidence: 'No browser session; the tuning file was checked directly.' };
  const want = (k: { from?: unknown; to: unknown }) => (revert ? k.from : k.to);
  let runtime: Record<string, unknown>;
  try {
    if (target.runtime === 'browser') {
      // Reload so the dev server serves the edited tuning file.
      await ctx.sessions.load(target.session, true);
      runtime = await target.session.page.evaluate(() => (window as unknown as { __GAMEDNA__: { getParameters(): Record<string, unknown> } }).__GAMEDNA__.getParameters(), undefined);
    } else {
      // Clear overrides left by earlier scenario runs before reading the game's own values.
      await target.driver.call('reset', { seed: 0, params: {}, setup: {} });
      runtime = (await target.driver.call('parameters', {})).values;
    }
  } catch (err) {
    return { id, status: 'not_tested', evidence: `Could not read the running game's parameters: ${(err as Error).message}` };
  }
  const off = decision.parameterDiff.filter((d) => runtime[d.key] !== want(d));
  return { id, status: off.length ? 'failed' : 'passed', evidence: off.length ? `Running game uses ${off.map((d) => `${d.key}=${String(runtime[d.key])}`).join(', ')}` : 'Running game reports the expected effective parameters' };
}

async function projectTestsCheck(project: LoadedProject): Promise<VerifyCheck> {
  const id = 'PROJECT-TESTS';
  const commandId = Object.entries(project.record.commands).find(([, c]) => c.kind === 'test')?.[0];
  if (!commandId) return { id, status: 'not_tested', evidence: 'No test command declared in project.json' };
  let cmd;
  try {
    cmd = prepareCommand({ root: project.root, record: project.record, profile: project.engine.profile, commandId, kinds: ['test'], purpose: 'PROJECT-TESTS' });
  } catch (err) {
    return { id, status: 'not_tested', evidence: `Could not run "${commandId}": ${(err as Error).message}` };
  }
  const r = await runCommand(cmd, { CI: '1' });
  if (r.error) return { id, status: 'not_tested', evidence: `${cmd.display} could not start: ${r.error}` };
  if (r.timedOut) return { id, status: 'not_tested', evidence: `Timed out after ${cmd.timeoutMs} ms` };
  return { id, status: r.code === 0 ? 'passed' : 'failed', evidence: `${cmd.display} exited ${r.code}: ${r.output.trim().split('\n').slice(-4).join(' / ')}` };
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
  }
  const wanted = args.checkIds?.length ? args.checkIds : decision?.protectedChecks.length ? decision.protectedChecks : project.record.constraints.map((c) => c.id);
  const unknown = wanted.filter((id) => !project.record.constraints.some((c) => c.id === id));
  if (unknown.length) throw new GameDNAError('NOT_FOUND', `Unknown check(s): ${unknown.join(', ')}`);
  const revision = baselineRevision(project.root, project.record);

  let acquired: AcquiredTarget | null = null;
  let targetError: string | null = null;
  try {
    acquired = await acquireTarget(ctx, project, session);
  } catch (err) {
    targetError = (err as Error).message;
  }
  const target = acquired?.target ?? null;
  try {
    if (decision) {
      const expected = (k: { from?: unknown; to: unknown }) => (args.revert ? k.from : k.to);
      const mismatched = decision.parameterDiff.filter((d) => project.tuning[d.key] !== expected(d));
      checks.push({
        id: args.revert ? 'PARAMS-REVERTED' : 'PARAMS-APPLIED',
        status: mismatched.length ? 'failed' : 'passed',
        evidence: mismatched.length ? `${project.record.tuningFile} differs: ${mismatched.map((d) => `${d.key}=${String(project.tuning[d.key])} (expected ${String(expected(d))})`).join(', ')}` : `${project.record.tuningFile} holds every ${args.revert ? 'baseline' : 'selected'} value`,
      });
      checks.push(await runtimeParamsCheck(ctx, target, targetError, decision, Boolean(args.revert)));
    }

    const scenarios = listScenarios(project.root).scenarios.filter((s) => s.assertions.some((a) => wanted.includes(a.checkId)));
    const perCheck = new Map<string, VerifyCheck[]>();
    for (const s of scenarios) {
      try {
        if (!target) throw new Error(targetError ?? 'no target');
        const ex = await executeScenario({ project, scenario: s, repeat: 2, target, revision });
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
  } finally {
    await acquired?.release();
  }

  if (args.runTests !== false) checks.push(await projectTestsCheck(project));

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
  return ok({ status: overall, verified: overall === 'passed', decisionId: decision?.decisionId ?? null, decisionStatus, revision, runtime: target?.runtime ?? null, checks });
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
  const md = renderReport({
    projectId: project.record.projectId,
    projectName: project.record.name,
    generatedAt: ctx.now(),
    revision: baselineRevision(project.root, project.record),
    engine: `${project.engine.profile.id} ${project.engine.version}`,
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

// ------------------------------------------------------------------ gd_install_adapter

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) return listFiles(path.join(dir, e.name), rel);
    return e.isFile() ? [rel] : [];
  });
}

export function installAdapter(ctx: ToolContext, args: { projectPath?: string; overwrite?: boolean }): ToolResult {
  const root = resolveInside(ctx.workspaceRoot, args.projectPath ?? '.');
  const { profile } = engineAt(root);
  const spec = profile.adapter;
  if (!spec) {
    throw new GameDNAError('ADAPTER_MISSING', `No ${profile.label} adapter ships with this GameDNA version yet`, {
      ...(profile.id === 'custom' ? { fix: 'A custom engine implements bridge protocol v1 itself (.kiro/specs/gamedna-engines/design.md section 3).' } : {}),
    });
  }
  const note = 'GameDNA never edits game code. Add each wiring line yourself, then start a session.';
  if (spec.kind === 'package') {
    return ok({ engine: profile.id, filesWritten: [], unchanged: [], package: spec.package, marker: spec.marker, installed: adapterStatus(root, profile).installed, wiring: adapterStatus(root, profile).wiring, note: `Add "${spec.package}" as a devDependency and create ${spec.marker} (see power/skills/playtesting/SKILL.md). ${note}` });
  }
  const adapters = adaptersRoot();
  const source = adapters ? path.join(adapters, ...spec.source.split('/')) : null;
  if (!source || !existsSync(source) || !statSync(source).isDirectory()) {
    throw new GameDNAError('ADAPTER_MISSING', `The ${profile.label} adapter sources are not in this GameDNA install`, { details: { expected: `power/adapters/${spec.source}` }, fix: 'Reinstall the GameDNA Power, or set GAMEDNA_ADAPTERS to the power/adapters folder.' });
  }
  const plan = listFiles(source).map((rel) => {
    const file = path.posix.join(spec.target, rel);
    const dest = resolveInside(root, file);
    const bytes = readFileSync(path.join(source, ...rel.split('/')));
    const current = existsSync(dest) ? readFileSync(dest) : null;
    return { file, dest, bytes, state: current === null ? 'new' : current.equals(bytes) ? 'same' : 'differs' };
  });
  const conflicts = plan.filter((p) => p.state === 'differs').map((p) => p.file);
  if (conflicts.length && !args.overwrite) {
    throw new GameDNAError('PERMISSION_DENIED', `${conflicts.length} adapter file(s) already exist with different content`, { details: { files: conflicts }, fix: 'Pass overwrite: true to replace them with the shipped adapter.' });
  }
  for (const p of plan) if (p.state !== 'same') writeFileAtomic(p.dest, p.bytes);
  return ok({
    engine: profile.id,
    target: spec.target,
    filesWritten: plan.filter((p) => p.state !== 'same').map((p) => p.file),
    overwritten: conflicts,
    unchanged: plan.filter((p) => p.state === 'same').map((p) => p.file),
    marker: spec.marker,
    wiring: adapterStatus(root, profile).wiring,
    note,
  });
}

// ------------------------------------------------------------------ gd_configure_tool

export function configureTool(args: { tool: string; path: string | null }): ToolResult {
  return ok({ ...setToolPath(args.tool, args.path), note: 'Stored in the user config folder, never in a game repository.' });
}
