import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '..');
const script = path.join(repo, 'power/skills/gamedna-director/scripts/fingerprint.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gamedna-fingerprint-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

type Profile = Record<string, any>;
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
const write = (root: string, files: Record<string, string | object>) => {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
};
const project = (name: string, files: Record<string, string | object>) => {
  const root = path.join(tmp, name);
  write(root, files);
  return root;
};
const profileAt = (file: string): Profile => JSON.parse(readFileSync(file, 'utf8'));

describe('fingerprint.mjs', () => {
  it('reads a standalone Phaser game: version from the lockfile, renderer and physics from config, devices from source', () => {
    const root = project('phaser-game', {
      'package.json': { name: 'g', dependencies: { phaser: '^3.90.0' }, devDependencies: { vite: '7.3.8', typescript: '5.9.3' } },
      'package-lock.json': { lockfileVersion: 3, packages: { '': {}, 'node_modules/phaser': { version: '3.90.0' }, 'node_modules/vite': { version: '7.3.8' }, 'node_modules/typescript': { version: '5.9.3' } } },
      'tsconfig.json': '{}',
      'index.html': '<meta name="viewport" content="width=device-width"><script type="module" src="/src/main.ts"></script>',
      'src/main.ts': "import Phaser from 'phaser';\nnew Phaser.Game({ type: Phaser.WEBGL, physics: { default: 'arcade' } });\nwindow.addEventListener('keydown', () => {});\nwindow.addEventListener('touchstart', () => {});\n",
    });
    const r = run([], root);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('engine: phaser 3.90.0 (tested)');
    const p = profileAt(path.join(root, '.gamedna/profile.json'));
    expect(p.kind).toBe('app');
    expect(p.engine).toEqual({ id: 'phaser', version: '3.90.0', support: 'tested' });
    expect(p.engines[0].versionSource).toBe('lockfile');
    expect(p.engines[0].evidence).toContain('src/main.ts:1');
    expect(p.rendering).toEqual(['phaser-webgl']);
    expect(p.physics).toContain('phaser-arcade');
    expect(p.inputDevices).toEqual(['keyboard', 'touch']);
    expect(p.platforms).toEqual(['web', 'mobile-web']);
    expect(p.language).toEqual({ id: 'typescript', typescript: '5.9.3' });
    expect(p.entryPoints).toEqual(['index.html -> /src/main.ts']);
  });

  it('never infers an engine from file extensions alone', () => {
    const root = project('extensions-only', {
      'package.json': { name: 'assets-only' },
      'models/car.glb': 'binary',
      'scenes/level.tscn': '[gd_scene]',
      'src/util.js': 'export const x = 1;\n',
    });
    expect(run([], root).status).toBe(0);
    expect(profileAt(path.join(root, '.gamedna/profile.json')).engine).toBeNull();
  });

  it('marks a declared but unimported, unsupported engine honestly', () => {
    const root = project('pixi-declared', {
      'package.json': { name: 'p', dependencies: { 'pixi.js': '8.6.0' } },
      'src/main.js': 'console.log(1);\n',
    });
    run([], root);
    const p = profileAt(path.join(root, '.gamedna/profile.json'));
    expect(p.engine).toEqual({ id: 'pixi', version: '8.6.0', support: 'unsupported' });
    expect(p.engines[0].usage).toBe('declared-only');
    expect(p.engines[0].versionSource).toBe('manifest-range');
  });

  it('recognizes native engine project files as unsupported', () => {
    const root = project('godot', { 'project.godot': 'config_version=5\n[application]\nconfig/features=PackedStringArray("4.3", "Forward Plus")\n' });
    run([], root);
    expect(profileAt(path.join(root, '.gamedna/profile.json')).engine).toEqual({ id: 'godot', version: '4.3', support: 'unsupported' });
  });

  it('in a monorepo, lists apps at the root and fingerprints the targeted app with its own nested version', () => {
    const root = project('mono', {
      'package.json': { name: 'mono', private: true, workspaces: ['apps/*'] },
      'package-lock.json': { lockfileVersion: 3, packages: { '': {}, 'node_modules/phaser': { version: '3.90.0' }, 'node_modules/three': { version: '0.170.0' }, 'apps/old3d/node_modules/three': { version: '0.160.1' } } },
      'apps/flat/package.json': { name: 'flat', dependencies: { phaser: '3.90.0' } },
      'apps/flat/src/main.ts': "import Phaser from 'phaser';\n",
      'apps/old3d/package.json': { name: 'old3d', dependencies: { three: '0.160.1' } },
      'apps/old3d/src/main.ts': "import * as THREE from 'three';\nnew THREE.WebGLRenderer();\n",
    });
    const top = run([], root);
    expect(top.stdout).toContain('monorepo: 2 game app(s)');
    expect(profileAt(path.join(root, '.gamedna/profile.json')).workspaceApps).toEqual([{ path: 'apps/flat', engine: 'phaser' }, { path: 'apps/old3d', engine: 'three' }]);
    run(['--app', 'apps/old3d'], root);
    const p = profileAt(path.join(root, 'apps/old3d/.gamedna/profile.json'));
    expect(p.engine).toEqual({ id: 'three', version: '0.160.1', support: 'untested-version' });
    expect(p.dimension).toBe('3d');
    expect(p.rendering).toContain('three-webgl');
  });

  it('parses pnpm and yarn lockfiles', () => {
    const pnpm = project('pnpm', {
      'package.json': { name: 'a', dependencies: { three: '^0.170.0' } },
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      three:\n        specifier: ^0.170.0\n        version: 0.170.0\npackages:\n  three@0.170.0:\n    resolution: {integrity: sha512-x}\n",
      'src/a.ts': "import { Scene } from 'three';\n",
    });
    run([], pnpm);
    expect(profileAt(path.join(pnpm, '.gamedna/profile.json')).engine.version).toBe('0.170.0');
    const yarn = project('yarn', {
      'package.json': { name: 'b', dependencies: { phaser: '^3.88.0' } },
      'yarn.lock': '"phaser@^3.88.0":\n  version "3.88.2"\n  resolved "https://x"\n',
      'src/b.ts': "import Phaser from 'phaser';\n",
    });
    run([], yarn);
    expect(profileAt(path.join(yarn, '.gamedna/profile.json')).engine).toEqual({ id: 'phaser', version: '3.88.2', support: 'untested-version' });
  });

  it('--check reports missing, fresh and stale without rescanning, and rescans keep declared facts', () => {
    const root = project('check', {
      'package.json': { name: 'c', dependencies: { phaser: '3.90.0' } },
      'src/main.ts': "import Phaser from 'phaser';\n",
    });
    expect(run(['--check'], root).status).toBe(4);
    run([], root);
    expect(run(['--check'], root).status).toBe(0);
    const file = path.join(root, '.gamedna/profile.json');
    const p = profileAt(file);
    writeFileSync(file, JSON.stringify({ ...p, declared: { genre: 'platformer', targetFps: 60, targetHardware: 'phone' } }));
    expect(run([], root).stdout).toContain('(unchanged)');
    write(root, { 'package.json': { name: 'c', dependencies: { phaser: '3.90.0', 'matter-js': '0.20.0' } } });
    expect(run(['--check'], root).status).toBe(3);
    run([], root);
    const next = profileAt(file);
    expect(next.physics).toContain('matter');
    expect(next.declared.genre).toBe('platformer');
  });

  it('fingerprints the real demo apps of this repository', () => {
    const out = path.join(tmp, 'real');
    run(['--app', 'apps/gravity-shift', '--root', repo, '--out', path.join(out, 'gs.json')], repo);
    run(['--app', 'apps/ridgeline-racer', '--root', repo, '--out', path.join(out, 'rr.json')], repo);
    const gs = profileAt(path.join(out, 'gs.json'));
    const rr = profileAt(path.join(out, 'rr.json'));
    expect(gs.engine).toEqual({ id: 'phaser', version: '3.90.0', support: 'tested' });
    expect(gs.gamednaModules).toContain('@gamedna/starter/phaser');
    expect(rr.engine).toEqual({ id: 'three', version: '0.170.0', support: 'tested' });
    expect(rr.gamednaModules).toContain('@gamedna/kit/contracts');
    expect(rr.contracts).toEqual(['.gamedna/contract.md', 'src/contracts.ts']);
    expect(rr.inputDevices).toEqual(['keyboard', 'mouse', 'gamepad', 'touch']);
  });
});
