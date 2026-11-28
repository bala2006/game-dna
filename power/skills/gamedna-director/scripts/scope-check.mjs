#!/usr/bin/env node
// GameDNA write-scope check. After a delegated task, compares the files Git reports as changed with
// the paths the delegation packet gave the specialist, so a write outside scope is caught by a
// command instead of trusted to a prompt. Dependency-free; runs on Node 18 or later.
//
//   node scope-check.mjs --owned "src/vehicle/**,tests/vehicle/**" [--since <ref>] [--allow "<globs>"] [--json]
//
// --owned  Comma-separated globs the task may write (`*` within a segment, `**` across segments).
// --since  Compare against a commit (for example the commit before delegation). Default: the
//          working tree and index against HEAD, plus untracked files.
// --allow  Extra globs that anyone may touch, such as a lockfile. `.gamedna/profile.json` is always allowed.
// Exit codes: 0 in scope, 1 writes outside scope, 2 usage or Git error.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ALWAYS_ALLOWED = ['.gamedna/profile.json', '**/.gamedna/profile.json'];

/** Converts a glob to an anchored regular expression over forward-slash paths. */
export function globToRegExp(glob) {
  let re = '';
  const g = glob.trim().replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const slash = g[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  if (g.endsWith('/')) re += '.*';
  return new RegExp(`^${re}$`);
}

export const parseGlobs = (text) => (text ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Splits changed paths into those covered by `owned` or `allow` and those outside. */
export function classify(changed, owned, allow = []) {
  const ok = [...owned, ...allow, ...ALWAYS_ALLOWED].map(globToRegExp);
  const inScope = [], outOfScope = [];
  for (const f of changed) (ok.some((r) => r.test(f)) ? inScope : outOfScope).push(f);
  return { inScope, outOfScope };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Paths changed since `since`, or uncommitted plus untracked paths when `since` is omitted. */
export function changedFiles(cwd, since) {
  const lines = (t) => t.split('\n').map((s) => s.trim()).filter(Boolean);
  const files = new Set();
  if (since) for (const f of lines(git(['diff', '--name-only', since], cwd))) files.add(f);
  else {
    for (const f of lines(git(['diff', '--name-only', 'HEAD'], cwd))) files.add(f);
    for (const f of lines(git(['diff', '--name-only', '--cached'], cwd))) files.add(f);
  }
  for (const f of lines(git(['ls-files', '--others', '--exclude-standard'], cwd))) files.add(f);
  return [...files].sort();
}

export function main(argv = process.argv.slice(2), log = console.log, cwd = process.cwd()) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const owned = parseGlobs(get('--owned'));
  if (owned.length === 0) {
    log('usage: scope-check.mjs --owned "<glob>,<glob>" [--since <ref>] [--allow "<globs>"] [--json]');
    return 2;
  }
  let changed;
  try {
    const top = git(['rev-parse', '--show-toplevel'], cwd).trim();
    const prefix = git(['rev-parse', '--show-prefix'], cwd).trim();
    changed = changedFiles(top, get('--since')).map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f));
  } catch (err) {
    log(`scope-check: git failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    return 2;
  }
  const result = classify(changed, owned, parseGlobs(get('--allow')));
  if (argv.includes('--json')) log(JSON.stringify({ owned, ...result }, null, 2));
  else {
    log(`scope-check: ${result.inScope.length} file(s) in scope, ${result.outOfScope.length} outside`);
    for (const f of result.outOfScope) log(`  outside scope: ${f}`);
  }
  return result.outOfScope.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main();
