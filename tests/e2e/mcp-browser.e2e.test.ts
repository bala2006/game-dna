/**
 * Browser end-to-end test of the bundled Power server over real stdio (needs `npm run build`
 * and `npx playwright install chromium`). Run with `npm run test:e2e`.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium, type Browser } from 'playwright';
import { preview } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
mkdirSync(path.join(root, '.scratch'), { recursive: true }); // git-ignored; absent on fresh clones
const work = mkdtempSync(path.join(root, '.scratch', 'e2e-'));
const game = path.join(work, 'gravity-shift');
const rel = path.relative(root, game);
const PORT = 5183; // not the normal dev port, so a running dev server is never picked up by mistake

let client: Client;
let browser: Browser;
let sessionId: string | undefined;

type Json = Record<string, any>;
async function call(name: string, args: Json): Promise<{ data: Json; images: number; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  return { data: JSON.parse(r.content[0]!.text!), images: r.content.filter((c) => c.type === 'image').length, isError: Boolean(r.isError) };
}

beforeAll(async () => {
  cpSync(path.join(root, 'apps/gravity-shift'), game, { recursive: true, filter: (src) => !/node_modules|[\\/]dist([\\/]|$)|\.gamedna[\\/](evidence|experiments|reports)[\\/]./.test(src) });
  const pkg = JSON.parse(readFileSync(path.join(game, 'package.json'), 'utf8'));
  pkg.scripts.dev = `vite --host 127.0.0.1 --port ${PORT} --strictPort`;
  writeFileSync(path.join(game, 'package.json'), JSON.stringify(pkg, null, 2));
  const record = JSON.parse(readFileSync(path.join(game, '.gamedna/project.json'), 'utf8'));
  record.commands.dev.url = `http://127.0.0.1:${PORT}/`;
  writeFileSync(path.join(game, '.gamedna/project.json'), JSON.stringify(record, null, 2));
  writeFileSync(path.join(game, 'vite.config.ts'), "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './' });\n");

  client = new Client({ name: 'gamedna-e2e', version: '0.1.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'power/server/gamedna-mcp.mjs')], cwd: root, stderr: 'ignore' }));
  browser = await chromium.launch();
});

afterAll(async () => {
  if (sessionId) await call('gd_stop_session', { sessionId }).catch(() => undefined);
  await client?.close();
  await browser?.close();
  rmSync(work, { recursive: true, force: true });
});

describe('Power bundle over stdio with a real browser', () => {
  it('lists all 15 tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      ['gd_compare_experiment', 'gd_create_experiment', 'gd_export_report', 'gd_generate_asset', 'gd_get_selection', 'gd_get_style_pack', 'gd_observe', 'gd_prepare_change', 'gd_project_status', 'gd_record_selection', 'gd_run_scenario', 'gd_start_session', 'gd_stop_session', 'gd_validate_design', 'gd_verify'].sort(),
    );
  });

  it('starts a session, observes state and captures a screenshot', async () => {
    const s = await call('gd_start_session', { projectPath: rel, commandId: 'dev' });
    expect(s.isError, JSON.stringify(s.data)).toBe(false);
    sessionId = s.data.sessionId;
    expect(s.data.adapter.engine.version).toBe('3.90.0');
    const o = await call('gd_observe', { sessionId, fields: ['player.x', 'player.alive', 'nope'], screenshot: true });
    expect(o.data.snapshot.state['player.alive']).toBe(true);
    expect(o.data.snapshot.missing).toEqual(['nope']);
    expect(o.images).toBe(1);
  });

  it('runs a browser scenario reproducibly and detects the seeded fault', async () => {
    const r = await call('gd_run_scenario', { sessionId, scenarioId: 'jump-arc', repeat: 5, screenshots: true });
    expect(r.data.status).toBe('passed');
    expect(r.data.runtime).toBe('browser');
    expect(r.data.reproducibility.status).toBe('stable');
    expect(r.data.screenshotIds).toHaveLength(3);
    const f = await call('gd_run_scenario', { sessionId, scenarioId: 'double-jump-coyote', params: { 'fault.coyoteAfterJump': true } });
    expect(f.data.status).toBe('failed');
    expect(f.data.firstFailure.checkId).toBe('MOVE-01');
  });

  it('completes experiment → workbench choice → apply → verify', async () => {
    const e = await call('gd_create_experiment', {
      projectPath: rel,
      question: 'Which jump feel suits Gravity Shift?',
      scenarioIds: ['jump-arc'],
      protectedChecks: ['MOVE-01'],
      variants: [
        { id: 'A', label: 'Snappy', rationale: 'Short fast arc', parameters: { 'movement.jumpVelocity': 600, 'movement.gravity': 2000 } },
        { id: 'B', label: 'Floaty', rationale: 'Long hang time', parameters: { 'movement.jumpVelocity': 460, 'movement.gravity': 1000 } },
      ],
    });
    const experimentId = e.data.experimentId;
    const c = await call('gd_compare_experiment', { projectPath: rel, experimentId, sessionId, repeat: 2 });
    expect(c.data.protectedChecks).toEqual({ baseline: 'passed', A: 'passed', B: 'passed' });

    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(c.data.workbenchUrl);
    await page.getByRole('heading', { name: 'Which jump feel suits Gravity Shift?' }).waitFor();
    expect(await page.locator('iframe').count()).toBe(3);
    await page.getByRole('button', { name: 'Choose B', exact: true }).click();
    await page.getByText('Recorded: you chose variant B').waitFor();
    expect(page.url()).not.toContain('token='); // token is scrubbed from the address bar
    expect(errors).toEqual([]);
    await page.close();

    const sel = await call('gd_get_selection', { projectPath: rel, experimentId });
    expect(sel.data.status).toBe('selected');
    const prep = await call('gd_prepare_change', { projectPath: rel, experimentId });
    const tuningFile = path.join(game, 'src/game/tuning.json');
    writeFileSync(tuningFile, `${JSON.stringify({ ...JSON.parse(readFileSync(tuningFile, 'utf8')), ...prep.data.patch.set }, null, 2)}\n`);
    await new Promise((r) => setTimeout(r, 1000));
    const v = await call('gd_verify', { projectPath: rel, decisionId: prep.data.decisionId, sessionId, runTests: false });
    const byId = Object.fromEntries((v.data.checks as Array<{ id: string; status: string }>).map((x) => [x.id, x.status]));
    expect(byId).toMatchObject({ 'PARAMS-APPLIED': 'passed', 'RUNTIME-PARAMS': 'passed', 'MOVE-01': 'passed' });
    expect(v.data.decisionStatus).toBe('verified');
  });

  it('stops the session and its dev server', async () => {
    const s = await call('gd_stop_session', { sessionId });
    sessionId = undefined;
    expect(s.data.browserClosed).toBe(true);
    expect(s.data.processStopped).toBe(true);
  });
});

describe('production builds', () => {
  for (const app of ['gravity-shift', 'neon-survivor']) {
    it(`${app} loads without errors and without the dev bridge`, async () => {
      const server = await preview({ root: path.join(root, 'apps', app), configFile: false, preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
      try {
        const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(String(err)));
        await page.goto(`${server.resolvedUrls!.local[0]}?gamedna=1`);
        await page.waitForSelector('canvas');
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => typeof (window as unknown as { __GAMEDNA__?: unknown }).__GAMEDNA__)).toBe('undefined');
        expect(errors).toEqual([]);
        await page.close();
      } finally {
        await new Promise<void>((r) => server.httpServer.close(() => r()));
      }
    });
  }
});
