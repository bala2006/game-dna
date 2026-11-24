import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeRevision, resolveInside, writeJsonAtomic } from '../src/node/index.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'gamedna-core-'));

describe('path guard', () => {
  it('allows paths inside the root', () => {
    const root = tmp();
    expect(resolveInside(root, 'a/b.json').endsWith(path.join('a', 'b.json'))).toBe(true);
  });
  it('rejects traversal and absolute paths outside the root', () => {
    const root = tmp();
    expect(() => resolveInside(root, '../escape.txt')).toThrow(/outside/);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(/outside/);
  });
  it('rejects symlinks that escape the root', () => {
    const root = tmp();
    const outside = tmp();
    symlinkSync(outside, path.join(root, 'link'));
    expect(() => resolveInside(root, 'link/file.txt')).toThrow(/symlink/);
  });
});

describe('revision and atomic store', () => {
  it('changes revision when a baseline file changes', () => {
    const root = tmp();
    writeFileSync(path.join(root, 't.json'), '{"a":1}');
    const r1 = computeRevision(root, ['t.json']);
    expect(computeRevision(root, ['t.json'])).toBe(r1);
    writeFileSync(path.join(root, 't.json'), '{"a":2}');
    expect(computeRevision(root, ['t.json'])).not.toBe(r1);
  });
  it('writes JSON atomically into new directories', () => {
    const root = tmp();
    mkdirSync(path.join(root, 'x'));
    const f = path.join(root, 'x', 'y', 'z.json');
    writeJsonAtomic(f, { ok: true });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ ok: true });
  });
});
