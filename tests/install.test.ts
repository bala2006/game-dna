import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { install, plan, uninstall } from '../integration/kiro/installation/install.mjs';
// @ts-expect-error plain ESM script without type declarations
import { validate } from '../scripts/validate-knowledge.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const script = path.join(repo, 'integration/kiro/installation/install.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gamedna-install-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const project = (name: string) => {
  const root = path.join(tmp, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, dependencies: { three: '0.170.0' } }));
  return root;
};

describe('install.mjs', () => {
  it('plans every skill file and agent, and the Kit only on request', () => {
    const files = plan(repo) as { to: string }[];
    expect(files.filter((f) => f.to.endsWith('/SKILL.md'))).toHaveLength(25);
    expect(files.filter((f) => f.to.startsWith('.kiro/agents/'))).toHaveLength(10);
    expect(files.some((f) => f.to.startsWith('src/kit/'))).toBe(false);
    expect((plan(repo, { kit: true }) as { to: string }[]).some((f) => f.to === 'src/kit/collision.ts')).toBe(true);
  });

  it('installs into a separate game project where every agent resource resolves', () => {
    const root = project('fresh');
    const r = install(root, { sourceRoot: repo });
    expect(r.conflicts).toEqual([]);
    expect(existsSync(path.join(root, '.kiro/agents/gamedna-director.md'))).toBe(true);
    expect(existsSync(path.join(root, '.kiro/skills/gamedna-director/scripts/fingerprint.mjs'))).toBe(true);
    expect(readFileSync(path.join(root, '.kiro/steering/gamedna.md'), 'utf8')).toMatch(/^---\ninclusion: always\n---/);
    for (const f of readdirSync(path.join(root, '.kiro/agents'))) {
      const text = readFileSync(path.join(root, '.kiro/agents', f), 'utf8');
      for (const m of text.matchAll(/(?:skill|file):\/\/(\.kiro\/skills\/[^\s]+)/g)) expect(existsSync(path.join(root, m[1]!)), `${f} -> ${m[1]}`).toBe(true);
    }
    const fp = spawnSync(process.execPath, [path.join(root, '.kiro/skills/gamedna-director/scripts/fingerprint.mjs')], { cwd: root, encoding: 'utf8' });
    expect(fp.status, fp.stderr).toBe(0);
    expect(fp.stdout).toContain('engine: three 0.170.0');
  });

  it('never overwrites files it did not install, keeps user edits and updates its own files', () => {
    const root = project('existing');
    mkdirSync(path.join(root, '.kiro/agents'), { recursive: true });
    writeFileSync(path.join(root, '.kiro/agents/gamedna-world.md'), 'my own agent\n');
    writeFileSync(path.join(root, '.kiro/agents/reviewer.md'), 'unrelated\n');
    const first = install(root, { sourceRoot: repo });
    expect(first.conflicts).toEqual(['.kiro/agents/gamedna-world.md']);
    expect(readFileSync(path.join(root, '.kiro/agents/gamedna-world.md'), 'utf8')).toBe('my own agent\n');

    const skill = path.join(root, '.kiro/skills/game-feel/SKILL.md');
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nTeam note.\n`);
    const second = install(root, { sourceRoot: repo });
    expect(second.keptUserEdits).toEqual(['.kiro/skills/game-feel/SKILL.md']);
    expect(second.created).toEqual([]);
    expect(readFileSync(skill, 'utf8')).toContain('Team note.');

    const forced = install(root, { sourceRoot: repo, force: true });
    expect(forced.updated).toContain('.kiro/skills/game-feel/SKILL.md');
    expect(forced.conflicts).toEqual(['.kiro/agents/gamedna-world.md']);
  });

  it('uninstalls only unchanged installed files', () => {
    const root = project('removal');
    install(root, { sourceRoot: repo, kit: true });
    const note = path.join(root, '.kiro/skills/enemy-ai/SKILL.md');
    writeFileSync(note, 'edited\n');
    writeFileSync(path.join(root, '.kiro/agents/mine.md'), 'keep\n');
    const r = uninstall(root);
    expect(r.keptUserEdits).toEqual(['.kiro/skills/enemy-ai/SKILL.md']);
    expect(existsSync(path.join(root, '.kiro/agents/gamedna-director.md'))).toBe(false);
    expect(existsSync(path.join(root, 'src/kit'))).toBe(false);
    expect(readFileSync(path.join(root, '.kiro/agents/mine.md'), 'utf8')).toBe('keep\n');
    expect(readFileSync(note, 'utf8')).toBe('edited\n');
  });

  it('dry runs change nothing and the CLI reports conflicts with exit 1', () => {
    const root = project('cli');
    const dry = spawnSync(process.execPath, [script, '--target', root, '--dry-run'], { encoding: 'utf8' });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/^\[dry run\] created: \d+/);
    expect(existsSync(path.join(root, '.kiro'))).toBe(false);
    mkdirSync(path.join(root, '.kiro/skills/game-feel'), { recursive: true });
    writeFileSync(path.join(root, '.kiro/skills/game-feel/SKILL.md'), 'mine\n');
    const real = spawnSync(process.execPath, [script, '--target', root], { encoding: 'utf8' });
    expect(real.status).toBe(1);
    expect(real.stdout).toContain('not overwritten (exists, not installed by GameDNA): .kiro/skills/game-feel/SKILL.md');
  });

  it('refuses to install into the source repository unless forced', () => {
    expect(() => install(repo, { sourceRoot: repo, dryRun: true })).toThrow(/source repository/);
  });

  it('produces agent and skill copies that pass the knowledge validator unchanged', () => {
    const root = project('validated');
    install(root, { sourceRoot: repo });
    // Mirror the installed layout back into a validator root: skills under power/skills, agents under integration.
    const mirror = path.join(tmp, 'mirror');
    for (const [from, to] of [['.kiro/skills', 'power/skills'], ['.kiro/agents', 'integration/kiro/agents'], ['.kiro/steering', 'integration/kiro/steering']] as const) {
      const walk = (d: string): string[] => readdirSync(path.join(root, from, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
      for (const rel of walk('')) {
        mkdirSync(path.dirname(path.join(mirror, to, rel)), { recursive: true });
        writeFileSync(path.join(mirror, to, rel), readFileSync(path.join(root, from, rel)));
      }
    }
    for (const dir of ['packages', 'node_modules/three', 'node_modules/phaser']) {
      const src = path.join(repo, dir), dest = path.join(mirror, dir);
      if (dir === 'packages') cpSync(src, dest, { recursive: true });
      else { mkdirSync(dest, { recursive: true }); writeFileSync(path.join(dest, 'package.json'), readFileSync(path.join(src, 'package.json'))); }
    }
    const problems = validate(mirror, { compile: false }).problems;
    expect(problems).toEqual([]);
  });
});
