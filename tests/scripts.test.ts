import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, '.scratch');
mkdirSync(scratch, { recursive: true });
const tmp = mkdtempSync(path.join(scratch, 'scripts-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const run = (script: string, args: string[], cwd = root) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd, encoding: 'utf8' });

describe('copy-licenses.mjs', () => {
  it('writes the license text of the named packages', () => {
    const dist = path.join(tmp, 'dist');
    mkdirSync(dist, { recursive: true });
    expect(run('copy-licenses.mjs', [dist, 'phaser'], path.join(root, 'apps/gravity-shift')).status).toBe(0);
    const text = readFileSync(path.join(dist, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
    expect(text).toContain('phaser@3.90.0 (MIT)');
    expect(text).toContain('Permission is hereby granted');
  });
});

describe('check-docs.mjs', () => {
  it('passes every document in docs/', () => {
    const r = run('check-docs.mjs', []);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('reports formatting problems from the rules checklist', () => {
    const dir = path.join(tmp, 'docs-bad');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'BAD.md'),
      [
        '# Plain title',
        '## <span style="color:#B84D73">🦄 1. Unknown icon</span>',
        '> [!DANGER]',
        '> not a callout type',
        '| ID | Priority |',
        '|---|---|',
        '| GD-1 | P0 |',
        '```mermaid',
        'flowchart TD',
        '  A --> B',
        '```',
      ].join('\n'),
    );
    const r = run('check-docs.mjs', [path.relative(root, dir)]);
    expect(r.status).toBe(1);
    for (const msg of ['H1 must be burgundy', 'not in the rules.md section 2 table', 'callout type DANGER', 'priority cell', 'missing the rules.md section 7 classes', 'no reading key']) {
      expect(r.stderr).toContain(msg);
    }
  });
});
