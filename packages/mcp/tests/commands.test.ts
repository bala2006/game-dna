import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CommandSchema, ProjectRecordSchema, type ProjectRecord } from '@gamedna/core';
import { cmdShimArgs, killTree, prepareCommand, resolveTool, setToolPath, spawnCommand, toolConfigFile } from '../src/commands.js';
import { ENGINES, type EngineId, type EngineProfile } from '../src/engines.js';

const WIN = process.platform === 'win32';
const exe = (name: string) => (WIN ? `${name}.exe` : name);
const ENV_KEYS = ['GAMEDNA_CONFIG_DIR', 'GODOT_BIN', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'PATH'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let dir: string;

function file(rel: string, text = ''): string {
  const p = path.join(dir, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}

const profile = (id: EngineId): EngineProfile => ENGINES.find((e) => e.id === id)!;

function record(commands: Record<string, unknown>, engine: Record<string, unknown> = { id: 'godot', version: '4.3' }): ProjectRecord {
  return ProjectRecordSchema.parse({
    schemaVersion: 1,
    projectId: 'cmd-test',
    name: 'Cmd test',
    engine,
    design: { genre: 'test', coreLoop: 'test', stylePack: 'layered-minimal', experienceGoals: [] },
    tuningFile: 'tuning.json',
    viewport: { width: 320, height: 240 },
    constraints: [],
    parameters: {},
    commands,
  });
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'gd-commands-'));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('tool resolution', () => {
  it('stores tool paths in the user config folder and resolves them first', () => {
    process.env['GAMEDNA_CONFIG_DIR'] = path.join(dir, 'config');
    const godot = file(`bin/${exe('godot')}`);
    process.env['GODOT_BIN'] = file(`env/${exe('Godot_v4.3-stable_win64')}`);
    expect(setToolPath('godot', godot)).toMatchObject({ tool: 'godot', path: godot, configFile: toolConfigFile() });
    expect(toolConfigFile().startsWith(path.join(dir, 'config'))).toBe(true);
    expect(resolveTool('godot', dir)).toEqual({ tool: 'godot', path: godot, source: 'config' });

    expect(setToolPath('godot', null).removed).toBe(true);
    expect(resolveTool('godot', dir)).toEqual({ tool: 'godot', path: process.env['GODOT_BIN'], source: 'env' });
  });

  it('skips a path whose file name does not match the tool', () => {
    process.env['GAMEDNA_CONFIG_DIR'] = path.join(dir, 'config-empty');
    process.env['PATH'] = '';
    process.env['GODOT_BIN'] = file(`bin/${exe('notgodot')}`);
    expect(resolveTool('godot', dir)?.source).not.toBe('env');
    expect(code(() => setToolPath('godot', process.env['GODOT_BIN']!))).toBe('PERMISSION_DENIED');
    expect(code(() => setToolPath('godot', path.join(dir, 'missing', exe('godot'))))).toBe('NOT_FOUND');
  });

  it('finds adb under ANDROID_HOME and gradlew in the project, and godot on PATH', () => {
    process.env['GAMEDNA_CONFIG_DIR'] = path.join(dir, 'config-empty');
    process.env['ANDROID_HOME'] = path.join(dir, 'sdk');
    const adb = file(`sdk/platform-tools/${exe('adb')}`);
    expect(resolveTool('adb', dir)).toEqual({ tool: 'adb', path: adb, source: 'env' });
    const project = path.join(dir, 'android');
    const gradlew = file(`android/${WIN ? 'gradlew.bat' : 'gradlew'}`);
    expect(resolveTool('gradlew', project)).toEqual({ tool: 'gradlew', path: gradlew, source: 'project' });
    delete process.env['GODOT_BIN'];
    process.env['PATH'] = path.join(dir, 'pathbin');
    const onPath = file(`pathbin/${exe('godot4')}`);
    expect(resolveTool('godot', dir)).toEqual({ tool: 'godot', path: onPath, source: 'path' });
  });

  it('refuses shells and interpreters by tool name and by file name', () => {
    process.env['GAMEDNA_CONFIG_DIR'] = path.join(dir, 'config-empty');
    for (const name of ['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'python3', 'node', 'deno', 'bun', 'perl', 'ruby', 'wscript', 'cscript']) {
      expect(code(() => resolveTool(name, dir))).toBe('PERMISSION_DENIED');
    }
    const shell = file(`bin/${exe('pwsh')}`);
    expect(code(() => setToolPath('pwsh', shell))).toBe('PERMISSION_DENIED');
    expect(code(() => setToolPath('mygame', shell))).toBe('PERMISSION_DENIED');
  });
});

describe('command policy', () => {
  it('only accepts tool names, never paths, as argv[0]', () => {
    for (const tool of ['C:\\Tools\\godot.exe', './godot', '/usr/bin/godot', 'godot.exe']) {
      expect(CommandSchema.safeParse({ argv: [tool, '--headless'], kind: 'run' }).success).toBe(false);
    }
    expect(CommandSchema.safeParse({ argv: ['godot'], script: 'dev', kind: 'run' }).success).toBe(false);
  });

  it('refuses interpreters, tools the engine does not allow, npm through argv and the wrong kind', () => {
    const custom = record({ run: { argv: ['node', 'game.js'], kind: 'run' } }, { id: 'custom', version: '1', runtime: 'process', tools: ['node'] });
    const customProfile = { ...profile('custom'), runtime: 'process' as const, tools: ['node'] };
    expect(code(() => prepareCommand({ root: dir, record: custom, profile: customProfile, commandId: 'run', kinds: ['run'], purpose: 'test' }))).toBe('PERMISSION_DENIED');

    const godot = record({ run: { argv: ['adb', 'devices'], kind: 'run' }, test: { argv: ['godot', '--headless'], kind: 'test' } });
    expect(() => prepareCommand({ root: dir, record: godot, profile: profile('godot'), commandId: 'run', kinds: ['run'], purpose: 'a process session' })).toThrow(/not allowed for Godot/);
    expect(() => prepareCommand({ root: dir, record: godot, profile: profile('godot'), commandId: 'test', kinds: ['run', 'headless'], purpose: 'a process session' })).toThrow(/needs a run or headless command/);
    expect(() => prepareCommand({ root: dir, record: godot, profile: profile('godot'), commandId: 'nope', kinds: ['run'], purpose: 'x' })).toThrow(/not declared/);

    const web = record({ dev: { argv: ['npm', 'exec', 'evil'], kind: 'dev' } }, { id: 'web', version: '1' });
    expect(() => prepareCommand({ root: dir, record: web, profile: profile('web'), commandId: 'dev', kinds: ['dev'], purpose: 'x' })).toThrow(/declare it as "script"/);
  });

  it('substitutes {project} and nothing else, and reports the command as declared', () => {
    process.env['GAMEDNA_CONFIG_DIR'] = path.join(dir, 'config-empty');
    process.env['GODOT_BIN'] = file(`bin/${exe('godot')}`);
    const godot = record({ headless: { argv: ['godot', '--headless', '--path', '{project}', '$HOME', '%PATH%'], kind: 'headless', cwd: 'sub' } });
    mkdirSync(path.join(dir, 'sub'), { recursive: true });
    const cmd = prepareCommand({ root: dir, record: godot, profile: profile('godot'), commandId: 'headless', kinds: ['headless'], purpose: 'x' });
    expect(cmd.file).toBe(process.env['GODOT_BIN']);
    expect(cmd.args).toEqual(['--headless', '--path', dir, '$HOME', '%PATH%']);
    expect(cmd.display).toBe('godot --headless --path {project} $HOME %PATH%');
    expect(cmd.cwd).toBe(path.join(dir, 'sub'));
  });

  it('builds the cmd.exe line for .cmd files and refuses arguments cmd.exe would interpret', () => {
    expect(cmdShimArgs('C:\\Program Files\\nodejs\\npm.cmd', ['run', 'dev'])).toEqual(['/d', '/s', '/c', '""C:\\Program Files\\nodejs\\npm.cmd" run dev"']);
    expect(cmdShimArgs('C:\\proj\\gradlew.bat', ['assembleDebug', '-Pa=b,c', 'C:\\proj\\x.txt'])[3]).toBe('""C:\\proj\\gradlew.bat" assembleDebug -Pa=b,c C:\\proj\\x.txt"');
    for (const bad of ['a&b', '%PATH%', 'a b', '"q"', 'x|y', '>out', '^', '!x!', '(a)']) {
      expect(code(() => cmdShimArgs('C:\\proj\\gradlew.bat', [bad]))).toBe('PERMISSION_DENIED');
    }
    expect(code(() => cmdShimArgs('C:\\100%\\npm.cmd', []))).toBe('PERMISSION_DENIED');
    expect(code(() => cmdShimArgs('C:\\a&b\\npm.cmd', []))).toBe('PERMISSION_DENIED');
  });
});

describe('spawning', () => {
  it.runIf(WIN)('runs npm.cmd through cmd.exe without a shell option (no spawn EINVAL)', async () => {
    const npm = resolveTool('npm', dir);
    expect(npm?.path).toMatch(/npm\.cmd$/i);
    const child = spawnCommand({ file: npm!.path, args: ['--version'], cwd: dir });
    let out = '';
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    const exitCode = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(exitCode).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('kills a running process tree', async () => {
    const child = spawnCommand({ file: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: dir });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    await new Promise((r) => setTimeout(r, 200));
    await killTree(child);
    await expect(exited).resolves.not.toBe(undefined);
  });
});
