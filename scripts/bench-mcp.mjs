#!/usr/bin/env node
// Measures cold start and warmed p50/p95 latency of the bundled MCP server over real stdio (PRD 10.2).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const N = Number(process.env.BENCH_N ?? 50);
const t0 = performance.now();
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'power/server/gamedna-mcp.mjs')], cwd: root, stderr: 'ignore' });
const client = new Client({ name: 'gamedna-bench', version: '0.1.0' });
await client.connect(transport);
const tools = await client.listTools();
const coldMs = performance.now() - t0;

async function measure(name, args) {
  const times = [];
  let last;
  for (let i = 0; i < N + 5; i++) {
    const s = performance.now();
    last = await client.callTool({ name, arguments: args });
    if (i >= 5) times.push(performance.now() - s); // first 5 are warm-up
  }
  if (last.isError) throw new Error(`${name} failed: ${last.content[0].text}`);
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  return { tool: name, n: N, p50Ms: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), maxMs: +times.at(-1).toFixed(2) };
}

const results = [
  await measure('gd_project_status', { projectPath: 'apps/gravity-shift' }),
  await measure('gd_validate_design', { projectPath: 'apps/gravity-shift' }),
  await measure('gd_get_style_pack', { packId: 'neon-arcade' }),
  await measure('gd_run_scenario', { projectPath: 'apps/gravity-shift', scenarioId: 'jump-arc' }),
];
await client.close();
const report = {
  machine: `${os.cpus()[0]?.model ?? 'cpu'} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GiB, ${os.platform()} ${os.release()}, node ${process.version}`,
  tools: tools.tools.length,
  coldStartToToolListMs: +coldMs.toFixed(1),
  results,
  target: 'p95 < 250 ms for warmed status/validation calls (PRD 10.2)',
  pass: results.slice(0, 2).every((r) => r.p95Ms < 250),
};
console.log(JSON.stringify(report, null, 2));
// Note: headless gd_run_scenario writes a trace file per call under apps/gravity-shift/.gamedna/evidence (git-ignored).
