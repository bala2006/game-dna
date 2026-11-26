import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameDNAError, type ProjectRecord } from '@gamedna/core';
import { resolveInside } from '@gamedna/core/node';
import { readPackage, type PackageInfo } from './project.js';

/** Engine table and detection. Design: .kiro/specs/gamedna-engines/design.md section 2. */
export type EngineId = 'custom' | 'unreal' | 'unity' | 'godot' | 'android-cpp' | 'android-kotlin' | 'phaser' | 'three' | 'web';
export type EngineRuntime = 'browser' | 'process' | 'android';

/** A line Kiro adds to the game. `file` is null when Kiro picks the file (e.g. the harness script). */
export interface Wiring {
  file: string | null;
  where: string;
  line: string;
}

export type AdapterSpec =
  /** Files copied from `power/adapters/<source>` to `<target>` in the project. */
  | { kind: 'files'; source: string; target: string; marker: string; wiring: readonly Wiring[] }
  /** An npm package the game depends on; nothing to copy. */
  | { kind: 'package'; package: string; marker: string; wiring: readonly Wiring[] };

export interface EngineProfile {
  readonly id: EngineId;
  readonly label: string;
  readonly runtime: EngineRuntime;
  /** True only after the conformance test passed against the real engine. */
  readonly verified: boolean;
  readonly assetDir: string;
  readonly tools: readonly string[];
  readonly adapter: AdapterSpec | null;
}

export interface DetectedEngine {
  profile: EngineProfile;
  version: string;
}

type EngineRecord = Pick<ProjectRecord, 'engine'>;

interface Probe {
  root: string;
  pkg: PackageInfo | null;
  record: EngineRecord | undefined;
}

interface EngineEntry extends EngineProfile {
  /** The engine version when the folder is this engine, otherwise null. */
  detect(probe: Probe): string | null;
}

const GODOT_ADAPTER: AdapterSpec = {
  kind: 'files',
  source: 'godot/addons/gamedna',
  target: 'addons/gamedna',
  marker: 'addons/gamedna/gamedna.gd',
  wiring: [
    { file: 'project.godot', where: 'in the [autoload] section', line: 'GameDNA="*res://addons/gamedna/gamedna.gd"' },
    { file: null, where: 'in _ready() of the node that owns the simulation (the harness)', line: 'GameDNA.register(self)' },
  ],
};

const PHASER_ADAPTER: AdapterSpec = {
  kind: 'package',
  package: '@gamedna/phaser-adapter',
  marker: 'src/dev/gamedna-adapter.ts',
  wiring: [
    {
      file: 'src/main.ts',
      where: 'inside an import.meta.env.DEV guard, after the game and scene exist',
      line: "void import('./dev/gamedna-adapter.js').then((m) => m.installGameDNA(game, scene));",
    },
  ],
};

function readText(root: string, rel: string): string | null {
  try {
    return readFileSync(resolveInside(root, rel), 'utf8');
  } catch {
    return null;
  }
}

function has(root: string, rel: string): boolean {
  return existsSync(resolveInside(root, rel));
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function godotVersion(root: string): string {
  const text = readText(root, 'project.godot') ?? '';
  const features = /^config\/features\s*=\s*PackedStringArray\(([^)]*)\)/m.exec(text)?.[1] ?? '';
  return /"(\d+(?:\.\d+)+)"/.exec(features)?.[1] ?? 'unknown';
}

export function unityVersion(root: string): string | null {
  const text = readText(root, 'ProjectSettings/ProjectVersion.txt');
  return text === null ? null : (/^m_EditorVersion:\s*(\S+)/m.exec(text)?.[1] ?? 'unknown');
}

export function unrealVersion(root: string): string | null {
  const project = entries(root).find((f) => f.endsWith('.uproject'));
  if (!project) return null;
  try {
    const association = (JSON.parse(readText(root, project) ?? '') as { EngineAssociation?: unknown }).EngineAssociation;
    return typeof association === 'string' && association ? association : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The Android app module: settings.gradle(.kts) plus a module build file applying com.android.application. */
function androidApp(root: string): { module: string; native: boolean } | null {
  const settings = readText(root, 'settings.gradle.kts') ?? readText(root, 'settings.gradle');
  if (settings === null) return null;
  const modules = new Set<string>();
  for (const line of settings.split('\n').filter((l) => /^\s*include\b/.test(l))) {
    for (const m of line.matchAll(/["']:?([A-Za-z0-9_\-:]+)["']/g)) if (m[1]) modules.add(m[1].replace(/:/g, '/'));
  }
  if (modules.size === 0) modules.add('app');
  for (const module of modules) {
    const build = readText(root, `${module}/build.gradle.kts`) ?? readText(root, `${module}/build.gradle`);
    if (build === null || !/com\.android\.application|plugins\.android\.application/.test(build)) continue;
    return { module, native: build.includes('externalNativeBuild') || has(root, `${module}/src/main/cpp`) };
  }
  return null;
}

function installedVersion(root: string, name: string): string {
  const req = createRequire(path.join(root, 'package.json'));
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
  try {
    return read(req.resolve(`${name}/package.json`)).version ?? 'unresolved';
  } catch {
    // Packages whose "exports" hide package.json: walk up from the entry point.
  }
  try {
    for (let dir = path.dirname(req.resolve(name)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const file = path.join(dir, 'package.json');
      if (existsSync(file) && read(file).name === name) return read(file).version ?? 'unresolved';
    }
  } catch {
    // Not installed yet.
  }
  return 'unresolved';
}

const PROCESS_ASSETS = 'assets/generated';
const ANDROID_ASSETS = 'app/src/main/assets/generated';
const WEB_ASSETS = 'public/assets/generated';

/** Every engine GameDNA knows, in detection order. The first match wins. */
export const ENGINES: readonly EngineEntry[] = [
  {
    id: 'custom',
    label: 'Custom engine',
    runtime: 'process',
    verified: false,
    assetDir: PROCESS_ASSETS,
    tools: [],
    adapter: null,
    detect: (p) => (p.record?.engine.id === 'custom' ? p.record.engine.version : null),
  },
  { id: 'unreal', label: 'Unreal Engine', runtime: 'process', verified: false, assetDir: 'Content/GameDNA/Generated', tools: ['unreal-editor'], adapter: null, detect: (p) => unrealVersion(p.root) },
  { id: 'unity', label: 'Unity', runtime: 'process', verified: false, assetDir: 'Assets/GameDNA/Generated', tools: ['unity'], adapter: null, detect: (p) => unityVersion(p.root) },
  // verified: tests/e2e/godot.e2e.test.ts compares Godot 4.7.2 headless with the TypeScript twin.
  { id: 'godot', label: 'Godot', runtime: 'process', verified: true, assetDir: PROCESS_ASSETS, tools: ['godot'], adapter: GODOT_ADAPTER, detect: (p) => (has(p.root, 'project.godot') ? godotVersion(p.root) : null) },
  { id: 'android-cpp', label: 'Android (C++)', runtime: 'android', verified: false, assetDir: ANDROID_ASSETS, tools: ['gradlew', 'adb'], adapter: null, detect: (p) => (androidApp(p.root)?.native ? 'unknown' : null) },
  { id: 'android-kotlin', label: 'Android (Kotlin)', runtime: 'android', verified: false, assetDir: ANDROID_ASSETS, tools: ['gradlew', 'adb'], adapter: null, detect: (p) => (androidApp(p.root) ? 'unknown' : null) },
  { id: 'phaser', label: 'Phaser', runtime: 'browser', verified: true, assetDir: WEB_ASSETS, tools: ['npm'], adapter: PHASER_ADAPTER, detect: (p) => (p.pkg?.deps['phaser'] ? installedVersion(p.root, 'phaser') : null) },
  { id: 'three', label: 'three.js', runtime: 'browser', verified: false, assetDir: WEB_ASSETS, tools: ['npm'], adapter: null, detect: (p) => (p.pkg?.deps['three'] ? installedVersion(p.root, 'three') : null) },
  { id: 'web', label: 'HTML and JavaScript', runtime: 'browser', verified: false, assetDir: 'assets/generated', tools: ['npm'], adapter: null, detect: (p) => (has(p.root, 'index.html') ? 'unknown' : null) },
];

function profileOf(entry: EngineEntry, record: EngineRecord | undefined): EngineProfile {
  const { detect: _detect, ...profile } = entry;
  if (entry.id !== 'custom') return profile;
  const runtime = record?.engine.runtime;
  if (!runtime) {
    throw new GameDNAError('INVALID_INPUT', 'A custom engine must declare engine.runtime in .gamedna/project.json', { fix: 'Set "engine": { "id": "custom", "version": "...", "runtime": "process", "tools": ["your-game"] }.' });
  }
  return { ...profile, runtime, tools: record?.engine.tools ?? [] };
}

/** Detect the engine of a project folder from its files, plus `engine.id: "custom"` in the record. */
export function detectProject(root: string, record?: EngineRecord): DetectedEngine {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new GameDNAError('NOT_FOUND', 'The project folder does not exist', { fix: 'projectPath is relative to the workspace root, e.g. "apps/gravity-shift".' });
  const probe: Probe = { root, pkg: has(root, 'package.json') ? readPackage(root) : null, record };
  for (const entry of ENGINES) {
    const version = entry.detect(probe);
    if (version !== null) return { profile: profileOf(entry, record), version };
  }
  if (entries(root).some((f) => /\.(xcodeproj|xcworkspace)$/.test(f))) {
    throw new GameDNAError('UNSUPPORTED_ENGINE', 'This is an Xcode project. iOS and macOS targets are out of scope for GameDNA.', { details: { detected: 'xcode' } });
  }
  throw new GameDNAError('UNSUPPORTED_ENGINE', 'No supported engine found in the project folder', {
    details: { checked: ENGINES.map((e) => e.id) },
    fix: 'GameDNA supports Godot, Unity, Unreal, Android (Kotlin, C++), Phaser, three.js and HTML/JavaScript games, or "engine": { "id": "custom" } in .gamedna/project.json.',
  });
}

export interface AdapterStatus {
  shipped: boolean;
  installed: boolean;
  marker: string | null;
  /** Lines Kiro adds. `present` is null when GameDNA cannot tell which file holds the line. */
  wiring: Array<Wiring & { present: boolean | null }>;
}

/**
 * The shipped adapter sources: `power/adapters/`, found next to the bundled server (`../adapters`)
 * or from this source file in the repository. `GAMEDNA_ADAPTERS` overrides both.
 */
export function adaptersRoot(): string | null {
  const override = process.env['GAMEDNA_ADAPTERS'];
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [path.resolve(here, '../adapters'), path.resolve(here, '../../../power/adapters')].find((dir) => existsSync(dir)) ?? null;
}

export function adapterStatus(root: string, profile: EngineProfile): AdapterStatus {
  const spec = profile.adapter;
  if (!spec) return { shipped: false, installed: false, marker: null, wiring: [] };
  const pkg = has(root, 'package.json') ? readPackage(root) : null;
  const installed = has(root, spec.marker) || (spec.kind === 'package' && Boolean(pkg?.deps[spec.package]));
  const wiring = spec.wiring.map((w) => ({ ...w, present: w.file === null ? null : (readText(root, w.file)?.includes(w.line) ?? false) }));
  return { shipped: true, installed, marker: spec.marker, wiring };
}
