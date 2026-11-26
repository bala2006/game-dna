#!/usr/bin/env node
// Bounded regression hook (GD-042). Runs only the tests affected by uncommitted changes,
// skips if nothing changed since the last run (debounce), never calls the agent, and always
// exits 0 so it cannot trap Kiro in a loop. Results go to stderr and a cache file.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const quiet = process.argv.includes('--quiet');
const cacheDir = path.join(root, 'node_modules', '.cache');
const cacheFile = path.join(cacheDir, 'gamedna-regression.json');
const say = (msg) => process.stderr.write(`[gamedna regression] ${msg}\n`);

let changed = [];
try {
  changed = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .filter((f) => /\.(ts|tsx|json|mjs)$/.test(f) && !f.startsWith('power/kit/'));
} catch {
  say('git not available; skipping');
  process.exit(0);
}
if (changed.length === 0) {
  if (!quiet) say('no source changes; skipping');
  process.exit(0);
}

const fingerprint = createHash('sha256')
  .update(changed.map((f) => `${f}:${existsSync(path.join(root, f)) ? statSync(path.join(root, f)).mtimeMs : 'deleted'}`).join('|'))
  .digest('hex');
const last = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
if (last?.fingerprint === fingerprint) {
  if (!quiet) say(`unchanged since last run (${last.result}); skipping`);
  process.exit(0);
}

// Shared packages affect everything; an app change only needs that app's tests.
const shared = changed.some((f) => /^packages\/(core|starter|kit|assets)\//.test(f) || f === 'package.json' || f === 'vitest.config.ts');
const dirs = shared ? [] : [...new Set(changed.map((f) => f.match(/^(apps\/[^/]+|packages\/[^/]+)\//)?.[1]).filter(Boolean))];
if (!shared && dirs.length === 0) {
  if (!quiet) say('changes do not touch tested code; skipping');
  process.exit(0);
}
const args = ['vitest', '--run', '--reporter=dot', ...dirs];
say(`running ${shared ? 'all tests (shared package changed)' : dirs.join(', ')}`);
const r = spawnSync('npx', args, { cwd: root, encoding: 'utf8', timeout: 150_000, env: { ...process.env, CI: '1', NO_COLOR: '1' } });
const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n');
const result = r.error ? `not_tested (${r.error.message})` : r.status === 0 ? 'passed' : 'failed';
say(`${result}\n${tail}`);
mkdirSync(cacheDir, { recursive: true });
writeFileSync(cacheFile, JSON.stringify({ fingerprint, result, at: new Date().toISOString(), dirs: shared ? ['all'] : dirs }, null, 2));
process.exit(0);
