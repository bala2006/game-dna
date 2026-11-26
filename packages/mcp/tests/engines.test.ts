import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAllHarnesses } from '../src/headless.js';
import { ENGINES, detectProject } from '../src/engines.js';
import { createContext } from '../src/server.js';
import { generateAssetTool, installAdapter, projectStatus, type ToolContext } from '../src/tools.js';

let workspace: string;
let ctx: ToolContext;
const saved = { adapters: process.env['GAMEDNA_ADAPTERS'] };

function folder(name: string, files: Record<string, string>): string {
  const root = path.join(workspace, name);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  mkdirSync(root, { recursive: true });
  return root;
}

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: 'g', dependencies: deps });
const GODOT = '[application]\nconfig/name="Mini"\nconfig/features=PackedStringArray("4.3", "Forward Plus")\n';

beforeAll(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), 'gd-engines-'));
  ctx = createContext(workspace, null);
});

afterAll(async () => {
  process.env['GAMEDNA_ADAPTERS'] = saved.adapters;
  if (saved.adapters === undefined) delete process.env['GAMEDNA_ADAPTERS'];
  await ctx.workbench.stop();
  await closeAllHarnesses();
  rmSync(workspace, { recursive: true, force: true });
});

describe('engine detection', () => {
  const cases: Array<[string, Record<string, string>, string, string]> = [
    ['unreal', { 'Racer.uproject': JSON.stringify({ FileVersion: 3, EngineAssociation: '5.4' }), 'package.json': pkg({ three: '0.170.0' }) }, 'unreal', '5.4'],
    ['unity', { 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (ff3792e53c62)\n' }, 'unity', '2022.3.10f1'],
    ['godot', { 'project.godot': GODOT, 'index.html': '<!doctype html>' }, 'godot', '4.3'],
    ['android-cpp', { 'settings.gradle.kts': 'include(":app")\n', 'app/build.gradle.kts': 'plugins { id("com.android.application") }\nandroid { externalNativeBuild { cmake { path = file("CMakeLists.txt") } } }\n' }, 'android-cpp', 'unknown'],
    ['android-cpp-folder', { 'settings.gradle': "include ':game'\n", 'game/build.gradle': "plugins { alias(libs.plugins.android.application) }\n", 'game/src/main/cpp/main.cpp': '' }, 'android-cpp', 'unknown'],
    ['android-kotlin', { 'settings.gradle': "include ':app'\n", 'app/build.gradle': "plugins { id 'com.android.application' }\n" }, 'android-kotlin', 'unknown'],
    ['phaser', { 'package.json': pkg({ phaser: '3.90.0', three: '0.170.0' }) }, 'phaser', 'unresolved'],
    ['three', { 'package.json': pkg({ three: '0.170.0' }), 'index.html': '' }, 'three', 'unresolved'],
    ['web', { 'index.html': '<!doctype html><script src="game.js"></script>' }, 'web', 'unknown'],
  ];
  for (const [name, files, id, version] of cases) {
    it(`detects ${name}`, () => {
      const detected = detectProject(folder(`detect-${name}`, files));
      expect([detected.profile.id, detected.version]).toEqual([id, version]);
    });
  }

  it('uses the declared runtime and tools of a custom engine, ahead of file detection', () => {
    const root = folder('detect-custom', { 'project.godot': GODOT });
    const detected = detectProject(root, { engine: { id: 'custom', version: '2.1', runtime: 'process', tools: ['mygame'] } });
    expect(detected.profile).toMatchObject({ id: 'custom', runtime: 'process', tools: ['mygame'], verified: false });
    expect(detected.version).toBe('2.1');
    expect(() => detectProject(root, { engine: { id: 'custom', version: '2.1' } })).toThrow(/engine\.runtime/);
  });

  it('marks only engines with a passing conformance test as verified', () => {
    expect(ENGINES.filter((e) => e.verified).map((e) => e.id).sort()).toEqual(['godot', 'phaser']);
    expect(detectProject(folder('detect-phaser', {})).profile.verified).toBe(true);
  });

  it('refuses Xcode projects as out of scope and reports folders with no engine', () => {
    const xcode = folder('detect-xcode', { 'Game.xcodeproj/project.pbxproj': '// !$*UTF8*$!' });
    expect(() => detectProject(xcode)).toThrow(/iOS and macOS .*out of scope/);
    const workspaceOnly = folder('detect-xcworkspace', { 'Game.xcworkspace/contents.xcworkspacedata': '<Workspace/>' });
    expect(() => detectProject(workspaceOnly)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ENGINE' }));
    expect(() => detectProject(folder('detect-empty', { 'README.md': 'hi' }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ENGINE', message: expect.stringMatching(/No supported engine/) }));
  });
});

describe('a Godot folder without package.json', () => {
  it('reports engine, adapter state, wiring and allowed tools', () => {
    folder('godot-game', { 'project.godot': GODOT });
    const r = projectStatus(ctx, { projectPath: 'godot-game' }).data as Record<string, any>;
    expect(r.engine).toEqual({ id: 'godot', label: 'Godot', version: '4.3', runtime: 'process', verified: true });
    expect(r.adapter).toMatchObject({ shipped: true, installed: false, marker: 'addons/gamedna/gamedna.gd' });
    expect(r.adapter.wiring[0]).toMatchObject({ file: 'project.godot', present: false });
    expect(r.tools.map((t: { name: string }) => t.name)).toEqual(['godot']);
    expect(r.tools[0]).toHaveProperty('path');
    expect(r).not.toHaveProperty('packageName');
    expect(r.record.state).toBe('missing');
  });

  it('writes generated assets to the engine asset folder by default', () => {
    const r = generateAssetTool(ctx, { projectPath: 'godot-game', id: 'hero', request: { type: 'sprite', styleId: 'pixel-adventure', seed: 3, params: { kind: 'player' } } });
    expect(String(r.data['file'])).toMatch(/^assets\/generated\/hero\./);
  });

  it('installs the adapter files, never overwrites changed files silently, and leaves game files alone', () => {
    const adapters = folder('fake-power-adapters', { 'godot/addons/gamedna/gamedna.gd': 'extends Node\n', 'godot/addons/gamedna/plugin.cfg': '[plugin]\nname="GameDNA"\n' });
    process.env['GAMEDNA_ADAPTERS'] = adapters;
    const project = path.join(workspace, 'godot-game');
    const first = installAdapter(ctx, { projectPath: 'godot-game' }).data as Record<string, any>;
    expect(first.filesWritten.sort()).toEqual(['addons/gamedna/gamedna.gd', 'addons/gamedna/plugin.cfg']);
    expect(first.wiring.map((w: { line: string }) => w.line)).toEqual(['GameDNA="*res://addons/gamedna/gamedna.gd"', 'GameDNA.register(self)']);
    expect(first.note).toMatch(/never edits game code/);
    expect(readFileSync(path.join(project, 'project.godot'), 'utf8')).toBe(GODOT);

    const again = installAdapter(ctx, { projectPath: 'godot-game' }).data as Record<string, any>;
    expect(again.filesWritten).toEqual([]);
    expect(again.unchanged).toHaveLength(2);

    writeFileSync(path.join(project, 'addons/gamedna/gamedna.gd'), 'extends Node # edited\n');
    expect(() => installAdapter(ctx, { projectPath: 'godot-game' })).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    const forced = installAdapter(ctx, { projectPath: 'godot-game', overwrite: true }).data as Record<string, any>;
    expect(forced.overwritten).toEqual(['addons/gamedna/gamedna.gd']);
    expect(readFileSync(path.join(project, 'addons/gamedna/gamedna.gd'), 'utf8')).toBe('extends Node\n');
    expect((projectStatus(ctx, { projectPath: 'godot-game' }).data as Record<string, any>).adapter.installed).toBe(true);
  });

  it('says plainly when an engine adapter is not shipped yet', () => {
    folder('unity-game', { 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 6000.0.1f1\n' });
    expect(() => installAdapter(ctx, { projectPath: 'unity-game' })).toThrow(expect.objectContaining({ code: 'ADAPTER_MISSING' }));
  });
});
