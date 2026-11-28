import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { classify, globToRegExp } from '../power/skills/gamedna-director/scripts/scope-check.mjs';

const script = path.resolve(import.meta.dirname, '../power/skills/gamedna-director/scripts/scope-check.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gamedna-scope-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const write = (root: string, rel: string, text = 'x\n') => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

describe('scope-check globs', () => {
  it('matches single and multi-segment wildcards', () => {
    expect(globToRegExp('src/vehicle/**').test('src/vehicle/physics.ts')).toBe(true);
    expect(globToRegExp('src/vehicle/**').test('src/vehicle/a/b.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('**/*.test.ts').test('tests/x.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.ts').test('x.test.ts')).toBe(true);
    expect(globToRegExp('src/a.ts').test('src/a.tsx')).toBe(false);
  });
  it('classifies owned, allowed and outside paths', () => {
    const r = classify(['src/vehicle/a.ts', 'src/main.ts', 'package-lock.json', '.gamedna/profile.json'], ['src/vehicle/**'], ['package-lock.json']);
    expect(r.outOfScope).toEqual(['src/main.ts']);
    expect(r.inScope).toHaveLength(3);
  });
});

describe('scope-check.mjs in a Git repository', () => {
  const repo = path.join(tmp, 'game');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  write(repo, 'src/main.ts');
  write(repo, 'src/vehicle/physics.ts');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });

  it('passes when only owned files changed, including untracked ones', () => {
    write(repo, 'src/vehicle/physics.ts', 'changed\n');
    write(repo, 'src/vehicle/state.ts');
    const r = run('--owned', 'src/vehicle/**');
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('2 file(s) in scope, 0 outside');
  });
  it('fails and lists files written outside scope', () => {
    write(repo, 'src/main.ts', 'changed\n');
    const r = run('--owned', 'src/vehicle/**');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('outside scope: src/main.ts');
  });
  it('compares against a commit with --since', () => {
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'task');
    const r = run('--owned', 'src/vehicle/**', '--since', base, '--json');
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).outOfScope).toEqual(['src/main.ts']);
  });
  it('rejects a call without owned globs', () => {
    expect(run().status).toBe(2);
  });
});
