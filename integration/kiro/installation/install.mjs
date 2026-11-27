#!/usr/bin/env node
// Installs GameDNA into a game project for Kiro: skills into .kiro/skills/, the Director and
// specialist agents into .kiro/agents/, one short steering file, and optionally the Kit source into src/kit/. Kiro Powers
// carry skills only, and custom agents can only reference skills by path, so agents need these
// workspace copies. Dependency-free; runs on Node 18 or later.
//
//   node install.mjs --target <project> [--dry-run] [--force] [--uninstall] [--no-agents] [--kit] [--json]
//
// Safety rules:
// - A file that exists and was not installed by GameDNA is never overwritten or removed.
// - A file GameDNA installed and you edited is kept unless --force is given.
// - Every installed file is recorded with its hash in .kiro/gamedna-install.json, so --uninstall
//   removes exactly what was installed and left unchanged.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MANIFEST = '.kiro/gamedna-install.json';
const SOURCE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(posix(path.relative(base, full)));
  }
  return out;
}

/** Files to install as { from, to } pairs, `to` relative to the target project. */
export function plan(sourceRoot = SOURCE_ROOT, { agents = true, kit = false } = {}) {
  const files = [];
  const skillsDir = path.join(sourceRoot, 'power', 'skills');
  for (const rel of walk(skillsDir)) files.push({ from: path.join(skillsDir, rel), to: `.kiro/skills/${rel}` });
  if (agents) {
    const agentsDir = path.join(sourceRoot, 'integration', 'kiro', 'agents');
    for (const rel of walk(agentsDir)) if (rel.endsWith('.md')) files.push({ from: path.join(agentsDir, rel), to: `.kiro/agents/${rel}` });
    // Kiro Web runs custom agents only as sub-agents; this always-on steering points the main agent at the Director skill.
    const steering = path.join(sourceRoot, 'integration', 'kiro', 'steering', 'gamedna.md');
    if (existsSync(steering)) files.push({ from: steering, to: '.kiro/steering/gamedna.md' });
  }
  if (kit) {
    const kitDir = path.join(sourceRoot, 'power', 'kit', 'src');
    for (const rel of walk(kitDir)) files.push({ from: path.join(kitDir, rel), to: `src/kit/${rel}` });
  }
  if (files.length === 0) throw new Error(`no GameDNA files found under ${sourceRoot}`);
  return files;
}

function readManifest(target) {
  const file = path.join(target, MANIFEST);
  if (!existsSync(file)) return { version: 1, files: {} };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { version: 1, files: j.files ?? {} };
}

function sourceVersion(sourceRoot) {
  try { return JSON.parse(readFileSync(path.join(sourceRoot, 'power', 'plugin.json'), 'utf8')).version ?? null; } catch { return null; }
}

/** Installs into `target`. Returns what happened to each file. */
export function install(target, { sourceRoot = SOURCE_ROOT, dryRun = false, force = false, agents = true, kit = false } = {}) {
  target = path.resolve(target);
  if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target ${target} is not a folder`);
  if (path.resolve(sourceRoot) === target && !force) throw new Error('refusing to install into the GameDNA source repository itself; pass --force to dogfood');
  const manifest = readManifest(target);
  const report = { created: [], updated: [], unchanged: [], keptUserEdits: [], conflicts: [] };
  const next = { ...manifest.files };
  for (const { from, to } of plan(sourceRoot, { agents, kit })) {
    const data = readFileSync(from);
    const hash = sha(data);
    const dest = path.join(target, to);
    const recorded = manifest.files[to];
    if (existsSync(dest)) {
      const current = sha(readFileSync(dest));
      if (current === hash) { report.unchanged.push(to); next[to] = hash; continue; }
      if (!recorded) { report.conflicts.push(to); continue; }
      if (current !== recorded && !force) { report.keptUserEdits.push(to); continue; }
      report.updated.push(to);
    } else report.created.push(to);
    next[to] = hash;
    if (!dryRun) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, data);
    }
  }
  if (!dryRun) {
    mkdirSync(path.join(target, '.kiro'), { recursive: true });
    writeFileSync(path.join(target, MANIFEST), `${JSON.stringify({ version: 1, gamedna: sourceVersion(sourceRoot), files: Object.fromEntries(Object.entries(next).sort()) }, null, 2)}\n`);
  }
  return report;
}

/** Removes installed files that are unchanged since installation. Edited and foreign files stay. */
export function uninstall(target, { dryRun = false, force = false } = {}) {
  target = path.resolve(target);
  const manifest = readManifest(target);
  const report = { removed: [], keptUserEdits: [], missing: [] };
  const remaining = {};
  for (const [rel, hash] of Object.entries(manifest.files)) {
    const dest = path.join(target, rel);
    if (!existsSync(dest)) { report.missing.push(rel); continue; }
    if (sha(readFileSync(dest)) !== hash && !force) { report.keptUserEdits.push(rel); remaining[rel] = hash; continue; }
    report.removed.push(rel);
    if (!dryRun) {
      rmSync(dest);
      let dir = path.dirname(dest);
      while (dir.startsWith(path.join(target, '.kiro')) || dir.startsWith(path.join(target, 'src', 'kit'))) {
        if (dir === path.join(target, '.kiro') || dir === path.join(target, 'src')) break;
        try { rmdirSync(dir); } catch { break; }
        dir = path.dirname(dir);
      }
    }
  }
  if (!dryRun) {
    const file = path.join(target, MANIFEST);
    if (Object.keys(remaining).length) writeFileSync(file, `${JSON.stringify({ version: 1, files: remaining }, null, 2)}\n`);
    else if (existsSync(file)) rmSync(file);
  }
  return report;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const has = (f) => argv.includes(f);
  const i = argv.indexOf('--target');
  const target = i >= 0 ? argv[i + 1] : undefined;
  if (!target || has('--help')) {
    log('usage: install.mjs --target <project> [--dry-run] [--force] [--uninstall] [--no-agents] [--kit] [--json]');
    return target ? 0 : 2;
  }
  const opts = { dryRun: has('--dry-run'), force: has('--force') };
  const report = has('--uninstall') ? uninstall(target, opts) : install(target, { ...opts, agents: !has('--no-agents'), kit: has('--kit') });
  if (has('--json')) log(JSON.stringify(report, null, 2));
  else {
    const prefix = opts.dryRun ? '[dry run] ' : '';
    log(`${prefix}${Object.entries(report).map(([k, v]) => `${k}: ${v.length}`).join(', ')}`);
    for (const f of report.conflicts ?? []) log(`  not overwritten (exists, not installed by GameDNA): ${f}`);
    for (const f of report.keptUserEdits ?? []) log(`  kept your edits: ${f}`);
  }
  return (report.conflicts?.length ?? 0) > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`gamedna install: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  }
}
