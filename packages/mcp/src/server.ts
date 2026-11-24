import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GAMEDNA_VERSION, isGameDNAError, LIMITS } from '@gamedna/core';
import { ASSET_TYPES, STYLE_PACK_IDS } from '@gamedna/assets';
import { closeAllHarnesses } from './headless.js';
import { SessionManager } from './session.js';
import {
  compareExperiment,
  createExperimentTool,
  exportReport,
  generateAssetTool,
  getSelection,
  getStylePackTool,
  observe,
  prepareChange,
  projectStatus,
  recordSelectionTool,
  runScenarioTool,
  startSession,
  stopSession,
  syncDecision,
  validateDesignTool,
  verify,
  type ToolContext,
  type ToolResult,
} from './tools.js';
import { WorkbenchServer } from './workbench-server.js';

const projectPath = z.string().max(300).default('.').describe('Game folder relative to the workspace root, e.g. "apps/gravity-shift"');
const paramValues = z.record(z.string().max(80), z.union([z.number(), z.boolean()]));

function log(...args: unknown[]): void {
  // stdout is reserved for MCP protocol messages.
  console.error('[gamedna]', ...args);
}

export function createContext(workspaceRoot: string, staticDir: string | null): ToolContext {
  const registry: ToolContext['registry'] = new Map();
  const sessions = new SessionManager();
  const ctx: ToolContext = {
    workspaceRoot,
    sessions,
    registry,
    now: () => new Date().toISOString(),
    workbench: null as unknown as WorkbenchServer,
  };
  ctx.workbench = new WorkbenchServer({
    staticDir,
    projects: () =>
      [...registry.entries()].map(([projectId, p]) => {
        const s = sessions.forProject(projectId);
        let gameUrl: string | null = s?.url ?? null;
        if (!gameUrl) {
          try {
            gameUrl = (JSON.parse(readFileSync(path.join(p.root, '.gamedna/project.json'), 'utf8')) as { commands?: { dev?: { url?: string } } }).commands?.dev?.url ?? null;
          } catch {
            gameUrl = null;
          }
        }
        return { projectId, name: p.name, root: p.root, relPath: p.relPath, gameUrl };
      }),
    onSelection: (projectId, exp) => {
      const p = registry.get(projectId);
      if (p) syncDecision(ctx, p.root, exp);
    },
  });
  return ctx;
}

function toContent(result: ToolResult) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(result.data, null, 2) },
      ...(result.images ?? []).map((i) => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType })),
    ],
  };
}

function wrap<A>(fn: (args: A) => ToolResult | Promise<ToolResult>) {
  return async (args: A) => {
    const t0 = performance.now();
    try {
      const r = await fn(args);
      r.data['elapsedMs'] = Math.round(performance.now() - t0);
      return toContent(r);
    } catch (err) {
      const error = isGameDNAError(err) ? err.toJSON() : { code: 'INTERNAL', message: (err as Error).message };
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error }, null, 2) }] };
    }
  };
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'gamedna', version: GAMEDNA_VERSION });

  server.registerTool(
    'gd_project_status',
    { title: 'Project status', description: 'Detect a Phaser project, its engine version, package manager, adapter, GameDNA record, scenarios, experiments, decisions and sessions. Returns UNSUPPORTED_ENGINE for non-Phaser projects.', inputSchema: { projectPath } },
    wrap((a: { projectPath?: string }) => projectStatus(ctx, a)),
  );
  server.registerTool(
    'gd_get_style_pack',
    { title: 'Style pack', description: `List style packs or return one pack (or one section): palette, typography, scale, camera, motion, feedback and recipes. Packs: ${STYLE_PACK_IDS.join(', ')}.`, inputSchema: { packId: z.string().max(40).optional(), section: z.string().max(40).optional() } },
    wrap((a: { packId?: string; section?: string }) => getStylePackTool(a)),
  );
  server.registerTool(
    'gd_validate_design',
    { title: 'Validate design record', description: 'Validate .gamedna/project.json (or a candidate object) against the schema, the Kiro requirements file and the tuning file. Conflicts are reported, never resolved.', inputSchema: { projectPath, candidate: z.unknown().optional() } },
    wrap((a: { projectPath?: string; candidate?: unknown }) => validateDesignTool(ctx, a)),
  );
  server.registerTool(
    'gd_generate_asset',
    {
      title: 'Generate procedural asset',
      description: `Generate a deterministic original asset (${ASSET_TYPES.join(', ')}) in a style pack, write it under the project and record provenance in .gamedna/assets-manifest.json. Same inputs and seed give identical bytes.`,
      inputSchema: {
        projectPath,
        id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).describe('File name without extension'),
        type: z.enum(ASSET_TYPES),
        styleId: z.enum(STYLE_PACK_IDS as [string, ...string[]]),
        seed: z.number().int().min(0).max(2_147_483_647),
        width: z.number().int().min(4).max(2048).optional(),
        height: z.number().int().min(4).max(2048).optional(),
        params: z.record(z.string().max(30), z.union([z.string().max(40), z.number(), z.boolean()])).optional().describe('kind (sprite: player|enemy|pickup; tile: solid|hazard|platform; icon: key|heart|star|exit; sfx: jump|land|hit|pickup|explosion|pulse|ui|death|win), frames, layers'),
        dir: z.string().max(120).optional(),
      },
    },
    wrap((a: { projectPath?: string; id: string; type: (typeof ASSET_TYPES)[number]; styleId: string; seed: number; width?: number; height?: number; params?: Record<string, string | number | boolean>; dir?: string }) =>
      generateAssetTool(ctx, { ...(a.projectPath ? { projectPath: a.projectPath } : {}), id: a.id, ...(a.dir ? { dir: a.dir } : {}), request: { type: a.type, styleId: a.styleId, seed: a.seed, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), ...(a.params ? { params: a.params } : {}) } }),
    ),
  );
  server.registerTool(
    'gd_start_session',
    { title: 'Start play session', description: 'Run an approved dev command from project.json (or attach to a loopback URL), open headless Chromium and wait for the dev-only adapter. No arbitrary shell commands.', inputSchema: { projectPath, commandId: z.string().max(31).optional(), url: z.string().max(200).optional() } },
    wrap((a: { projectPath?: string; commandId?: string; url?: string }) => startSession(ctx, a)),
  );
  server.registerTool(
    'gd_stop_session',
    { title: 'Stop play session', description: 'Close the browser and stop the dev server started for a session.', inputSchema: { sessionId: z.string().max(40) } },
    wrap((a: { sessionId: string }) => stopSession(ctx, a)),
  );
  server.registerTool(
    'gd_observe',
    { title: 'Observe running game', description: 'Read the sanitized state snapshot (optionally selected fields), events since a cursor, and optionally a screenshot saved as evidence. step advances N fixed ticks under bridge control first.', inputSchema: { sessionId: z.string().max(40), fields: z.array(z.string().max(80)).max(50).optional(), screenshot: z.boolean().optional(), eventCursor: z.number().int().min(0).optional(), step: z.number().int().min(0).max(3600).optional() } },
    wrap((a: { sessionId: string; fields?: string[]; screenshot?: boolean; eventCursor?: number; step?: number }) => observe(ctx, a)),
  );
  server.registerTool(
    'gd_run_scenario',
    { title: 'Run scenario', description: `Run a scenario from .gamedna/scenarios with fixed-step input playback, assertions and metrics. Use sessionId for the real browser (with screenshots) or projectPath alone for a fast headless run. repeat 2-${LIMITS.maxRepeat} measures reproducibility; params may enable labeled fault switches.`, inputSchema: { projectPath: projectPath.optional(), sessionId: z.string().max(40).optional(), scenarioId: z.string().max(63), seed: z.number().int().min(0).optional(), repeat: z.number().int().min(1).max(LIMITS.maxRepeat).optional(), params: paramValues.optional(), screenshots: z.boolean().optional() } },
    wrap((a: { projectPath?: string; sessionId?: string; scenarioId: string; seed?: number; repeat?: number; params?: Record<string, number | boolean>; screenshots?: boolean }) => runScenarioTool(ctx, a)),
  );
  server.registerTool(
    'gd_create_experiment',
    {
      title: 'Create experiment',
      description: 'Define a baseline plus 2-3 parameter variants (A, B, C) with labels and rationale. Validates the allowlist, ranges and protected parameters. Never edits project files other than the experiment record.',
      inputSchema: {
        projectPath,
        question: z.string().min(3).max(300),
        scenarioIds: z.array(z.string().max(63)).min(1).max(LIMITS.maxScenariosPerExperiment),
        protectedChecks: z.array(z.string().max(20)).max(20).optional(),
        expectedBaselineRevision: z.string().max(80).optional(),
        variants: z.array(z.object({ id: z.enum(['A', 'B', 'C']), label: z.string().max(40), rationale: z.string().max(400), changes: z.string().max(300).optional(), parameters: paramValues })).min(2).max(3),
      },
    },
    wrap((a: Parameters<typeof createExperimentTool>[1]) => createExperimentTool(ctx, a)),
  );
  server.registerTool(
    'gd_compare_experiment',
    { title: 'Compare experiment', description: 'Run every variant through the experiment scenarios under identical seeds, store evidence and metric deltas, and start the local workbench where the user plays the variants and chooses.', inputSchema: { projectPath, experimentId: z.string().max(80), sessionId: z.string().max(40).optional(), repeat: z.number().int().min(1).max(LIMITS.maxRepeat).optional() } },
    wrap((a: { projectPath?: string; experimentId: string; sessionId?: string; repeat?: number }) => compareExperiment(ctx, a)),
  );
  server.registerTool(
    'gd_get_selection',
    { title: 'Get user selection', description: 'Return pending, selected or rejected for an experiment, with the chosen variant, rationale and decision ID. Never infers a choice.', inputSchema: { projectPath, experimentId: z.string().max(80) } },
    wrap((a: { projectPath?: string; experimentId: string }) => getSelection(ctx, a)),
  );
  server.registerTool(
    'gd_record_selection',
    { title: 'Record a choice the user stated in chat', description: "Only when the user explicitly states their choice in chat. userStatement must quote the user's own words. variantId null records a rejection of all variants.", inputSchema: { projectPath, experimentId: z.string().max(80), variantId: z.enum(['baseline', 'A', 'B', 'C']).nullable(), userStatement: z.string().min(1).max(1000), rationale: z.string().max(1000).optional() } },
    wrap((a: Parameters<typeof recordSelectionTool>[1]) => recordSelectionTool(ctx, a)),
  );
  server.registerTool(
    'gd_prepare_change',
    { title: 'Prepare approved change', description: 'Return the parameter patch for the selected variant if the baseline revision still matches; otherwise mark the decision stale and return STALE_BASELINE. mode "revert" returns the patch that restores the baseline. Kiro applies the patch with normal edit tools.', inputSchema: { projectPath, experimentId: z.string().max(80), expectedBaselineRevision: z.string().max(80).optional(), mode: z.enum(['apply', 'revert']).optional() } },
    wrap((a: { projectPath?: string; experimentId: string; expectedBaselineRevision?: string; mode?: 'apply' | 'revert' }) => prepareChange(ctx, a)),
  );
  server.registerTool(
    'gd_verify',
    { title: 'Verify', description: 'Check that the tuning file (and running game, if a session is given) holds the selected values, rerun scenarios for protected checks, and run the project test command. Reports passed/failed/not_tested/unsupported/unstable per check; only all-passed marks a decision verified.', inputSchema: { projectPath, decisionId: z.string().max(80).optional(), checkIds: z.array(z.string().max(20)).max(30).optional(), sessionId: z.string().max(40).optional(), runTests: z.boolean().optional(), revert: z.boolean().optional() } },
    wrap((a: Parameters<typeof verify>[1]) => verify(ctx, a)),
  );
  server.registerTool(
    'gd_export_report',
    { title: 'Export evidence report', description: 'Write a local Markdown and JSON evidence report (runs, checks, experiments, decisions, asset provenance, limitations) under .gamedna/reports.', inputSchema: { projectPath, traceIds: z.array(z.string().max(80)).max(50).optional() } },
    wrap((a: { projectPath?: string; traceIds?: string[] }) => exportReport(ctx, a)),
  );
  return server;
}

function defaultStaticDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, 'workbench'), path.resolve(here, '../../workbench/dist')]) if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  return null;
}

export async function main(): Promise<void> {
  const workspaceRoot = path.resolve(process.env['GAMEDNA_WORKSPACE'] ?? process.cwd());
  const ctx = createContext(workspaceRoot, process.env['GAMEDNA_WORKBENCH_DIR'] ?? defaultStaticDir());
  const server = createServer(ctx);
  // Workspace resolution: GAMEDNA_WORKSPACE, then the client's first MCP root, then the cwd.
  server.server.oninitialized = () => {
    if (process.env['GAMEDNA_WORKSPACE'] || !server.server.getClientCapabilities()?.roots) return;
    server.server
      .listRoots()
      .then(({ roots }) => {
        const first = roots.find((r) => r.uri.startsWith('file://'));
        if (first) {
          ctx.workspaceRoot = fileURLToPath(first.uri);
          log(`workspace from MCP roots: ${ctx.workspaceRoot}`);
        }
      })
      .catch(() => undefined);
  };
  const shutdown = async () => {
    await ctx.sessions.stopAll();
    await ctx.workbench.stop();
    await closeAllHarnesses();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.stdin.on('close', () => void shutdown());
  await server.connect(new StdioServerTransport());
  log(`ready (v${GAMEDNA_VERSION}), workspace ${workspaceRoot}`);
}
