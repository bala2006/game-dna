#!/usr/bin/env node
// GameDNA project fingerprint. Reads manifests, lockfiles, installed packages, source imports and
// entry points (never file extensions alone) and writes a compact profile with evidence for each
// fact to <app>/.gamedna/profile.json. Dependency-free; runs on Node 18 or later.
//
//   node fingerprint.mjs [--app <dir>] [--root <dir>] [--out <file>] [--check] [--print] [--force]
//
// --app    Application folder to fingerprint (default: --root). In a monorepo, point it at one app.
// --root   Repository root used to find hoisted lockfiles and node_modules (default: cwd).
// --check  Do not scan. Exit 0 if the stored profile matches the current manifests, 3 if stale,
//          4 if missing.
// --print  Print the profile JSON instead of the short summary.
// --force  Rescan even if the stored profile is fresh.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROFILE_VERSION = 1;

/** JavaScript engines GameDNA recognizes. Only `tested` versions have GameDNA skills and Kit support. */
export const JS_ENGINES = [
  { id: 'phaser', pkg: 'phaser', dimension: '2d', supported: true, tested: ['3.90'] },
  { id: 'three', pkg: 'three', dimension: '3d', supported: true, tested: ['0.170'] },
  { id: 'pixi', pkg: 'pixi.js', dimension: '2d', supported: false, tested: [] },
  { id: 'babylon', pkg: '@babylonjs/core', dimension: '3d', supported: false, tested: [] },
  { id: 'playcanvas', pkg: 'playcanvas', dimension: '3d', supported: false, tested: [] },
  { id: 'excalibur', pkg: 'excalibur', dimension: '2d', supported: false, tested: [] },
  { id: 'kaplay', pkg: 'kaplay', dimension: '2d', supported: false, tested: [] },
  { id: 'kaboom', pkg: 'kaboom', dimension: '2d', supported: false, tested: [] },
];

const PHYSICS_PKGS = {
  'matter-js': 'matter', 'cannon-es': 'cannon-es', 'cannon': 'cannon', '@dimforge/rapier3d': 'rapier3d',
  '@dimforge/rapier3d-compat': 'rapier3d', '@dimforge/rapier2d': 'rapier2d', '@dimforge/rapier2d-compat': 'rapier2d',
  'ammo.js': 'ammo', 'planck': 'planck', 'planck-js': 'planck', 'oimo': 'oimo',
};
const BUILD_TOOLS = ['vite', 'webpack', 'esbuild', 'parcel', 'rollup', '@rspack/core', 'rsbuild'];
const PACKAGING = { electron: 'desktop', '@tauri-apps/api': 'desktop', '@capacitor/core': 'mobile', 'cordova': 'mobile' };
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.gamedna', '.kiro', 'coverage', '.scratch', 'public']);
const MAX_SOURCE_FILES = 600;
const MAX_FILE_BYTES = 400_000;

const readText = (file) => {
  try { return readFileSync(file, 'utf8'); } catch { return null; }
};
const readJson = (file) => {
  const t = readText(file);
  if (t === null) return null;
  try { return JSON.parse(t); } catch { return null; }
};
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/') || '.';
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Folders from `dir` up to and including `root`. */
function upward(dir, root) {
  const out = [];
  let cur = path.resolve(dir);
  const stop = path.resolve(root);
  for (;;) {
    out.push(cur);
    if (cur === stop) break;
    const parent = path.dirname(cur);
    if (parent === cur || !cur.startsWith(stop)) break;
    cur = parent;
  }
  return out;
}

function findLockfile(appDir, root) {
  for (const dir of upward(appDir, root)) {
    for (const name of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) {
      const file = path.join(dir, name);
      if (existsSync(file)) return { file, kind: name };
    }
  }
  return null;
}

/** Version of `pkg` from node_modules, then the lockfile, then the manifest range. */
export function resolveVersion(pkg, appDir, root, lock, manifestRange) {
  for (const dir of upward(appDir, root)) {
    const file = path.join(dir, 'node_modules', pkg, 'package.json');
    const j = readJson(file);
    if (j?.version) return { version: j.version, source: 'installed', evidence: rel(root, file) };
  }
  if (lock) {
    const text = readText(lock.file) ?? '';
    if (lock.kind === 'package-lock.json') {
      const j = readJson(lock.file);
      const appRel = rel(root, appDir);
      const keys = [appRel === '.' ? null : `${appRel}/node_modules/${pkg}`, `node_modules/${pkg}`].filter(Boolean);
      for (const k of keys) {
        const v = j?.packages?.[k]?.version;
        if (v) return { version: v, source: 'lockfile', evidence: `${rel(root, lock.file)} packages["${k}"]` };
      }
      const v1 = j?.dependencies?.[pkg]?.version;
      if (v1) return { version: v1, source: 'lockfile', evidence: rel(root, lock.file) };
    } else {
      const esc = pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const patterns = lock.kind === 'pnpm-lock.yaml'
        ? [new RegExp(`^\\s+/?${esc}@(\\d[^:(\\s'"]*)`, 'm'), new RegExp(`^\\s+'?${esc}'?:\\s*\\n\\s+specifier:[^\\n]*\\n\\s+version:\\s*'?(\\d[^\\s'(]*)`, 'm')]
        : [new RegExp(`^"?${esc}@[^\\n]*:\\s*\\n\\s+version:? "?(\\d[^"\\s]*)`, 'm')];
      for (const re of patterns) {
        const m = text.match(re);
        if (m?.[1]) return { version: m[1], source: 'lockfile', evidence: `${rel(root, lock.file)}:${lineOf(text, m.index ?? 0)}` };
      }
    }
  }
  if (manifestRange) return { version: manifestRange, source: 'manifest-range', evidence: null };
  return { version: null, source: 'unknown', evidence: null };
}

function listSource(dir, out = [], depth = 0) {
  if (out.length >= MAX_SOURCE_FILES || depth > 8) return out;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= MAX_SOURCE_FILES) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) listSource(full, out, depth + 1);
    } else if (SOURCE_EXT.has(path.extname(e.name)) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"\n]+)['"]/g;

/** Every import specifier in the app's source, with the first file and line that uses it. */
function scanImports(appDir, root) {
  const files = listSource(appDir);
  const imports = new Map();
  const texts = [];
  for (const file of files) {
    let size = 0;
    try { size = statSync(file).size; } catch { continue; }
    if (size > MAX_FILE_BYTES) continue;
    const text = readText(file);
    if (text === null) continue;
    texts.push({ file, text });
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (!imports.has(spec)) imports.set(spec, `${rel(root, file)}:${lineOf(text, m.index ?? 0)}`);
    }
  }
  return { files, imports, texts };
}

const pkgOfSpecifier = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

function firstMatch(texts, root, re) {
  for (const { file, text } of texts) {
    const m = re.exec(text);
    re.lastIndex = 0;
    if (m) return { match: m, evidence: `${rel(root, file)}:${lineOf(text, m.index)}` };
  }
  return null;
}

function nativeEngine(appDir, root) {
  const godot = path.join(appDir, 'project.godot');
  if (existsSync(godot)) {
    const t = readText(godot) ?? '';
    const m = t.match(/config\/features=PackedStringArray\("(\d+\.\d+)/);
    return { id: 'godot', version: m?.[1] ?? null, dimension: null, supported: false, evidence: rel(root, godot) };
  }
  const unity = path.join(appDir, 'ProjectSettings', 'ProjectVersion.txt');
  if (existsSync(unity)) {
    const m = (readText(unity) ?? '').match(/m_EditorVersion:\s*(\S+)/);
    return { id: 'unity', version: m?.[1] ?? null, dimension: null, supported: false, evidence: rel(root, unity) };
  }
  let entries = [];
  try { entries = readdirSync(appDir); } catch { /* empty */ }
  const uproject = entries.find((f) => f.endsWith('.uproject'));
  if (uproject) {
    const j = readJson(path.join(appDir, uproject));
    return { id: 'unreal', version: j?.EngineAssociation ?? null, dimension: '3d', supported: false, evidence: rel(root, path.join(appDir, uproject)) };
  }
  return null;
}

function supportLevel(engine, version) {
  if (!engine.supported) return 'unsupported';
  if (!version) return 'untested-version';
  const mm = version.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');
  return engine.tested.includes(mm) ? 'tested' : 'untested-version';
}

/** Hash of the manifests that decide the stable profile facts. Cheap to recompute for --check. */
export function inputsHash(appDir, root) {
  const h = createHash('sha256');
  const lock = findLockfile(appDir, root);
  const files = [path.join(appDir, 'package.json'), path.join(appDir, 'tsconfig.json'), path.join(appDir, 'index.html'), lock?.file,
    ...['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'webpack.config.js', 'project.godot'].map((f) => path.join(appDir, f))];
  for (const f of files) {
    if (!f || !existsSync(f)) continue;
    h.update(rel(root, f)).update('\0').update(readFileSync(f)).update('\0');
  }
  return `sha256:${h.digest('hex').slice(0, 32)}`;
}

function workspaceApps(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  const globs = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages ?? [];
  const apps = [];
  for (const g of globs) {
    if (!g.endsWith('/*')) continue;
    const base = path.join(root, g.slice(0, -2));
    let dirs = [];
    try { dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { continue; }
    for (const d of dirs) {
      const j = readJson(path.join(base, d, 'package.json'));
      if (!j) continue;
      const deps = { ...j.peerDependencies, ...j.devDependencies, ...j.dependencies };
      const engine = JS_ENGINES.find((e) => deps[e.pkg] && j.dependencies?.[e.pkg]);
      if (engine) apps.push({ path: rel(root, path.join(base, d)), engine: engine.id });
    }
  }
  return apps;
}

/** Scans the project and returns the profile object. Pure apart from file reads. */
export function fingerprint({ root = process.cwd(), app } = {}) {
  root = path.resolve(root);
  const appDir = path.resolve(root, app ?? '.');
  // At the root of a workspace repository, do not guess one engine for every app.
  const apps = app === undefined || rel(root, appDir) === '.' ? workspaceApps(root) : [];
  if (apps.length > 0) {
    return { profileVersion: PROFILE_VERSION, kind: 'monorepo', app: '.', inputsHash: inputsHash(appDir, root), engine: null, workspaceApps: apps };
  }
  const pkgFile = path.join(appDir, 'package.json');
  const pkg = readJson(pkgFile);
  const deps = { ...pkg?.peerDependencies, ...pkg?.devDependencies, ...pkg?.optionalDependencies, ...pkg?.dependencies };
  const runtimeDeps = { ...pkg?.dependencies };
  const lock = findLockfile(appDir, root);
  const { files, imports, texts } = scanImports(appDir, root);
  const importedPkgs = new Map();
  for (const [spec, ev] of imports) if (!spec.startsWith('.') && !spec.startsWith('/')) {
    const p = pkgOfSpecifier(spec);
    if (!importedPkgs.has(p)) importedPkgs.set(p, ev);
  }

  // Engines: declared in the manifest and imported from source. A manifest entry alone is reported
  // as `declared-only`; extensions such as .glb or .tscn are never used.
  const engines = [];
  for (const e of JS_ENGINES) {
    const declared = deps[e.pkg] !== undefined;
    const importedAt = importedPkgs.get(e.pkg) ?? null;
    if (!declared && !importedAt) continue;
    const v = resolveVersion(e.pkg, appDir, root, lock, deps[e.pkg]);
    engines.push({
      id: e.id, package: e.pkg, version: v.version, versionSource: v.source, dimension: e.dimension,
      support: supportLevel(e, v.version), usage: importedAt ? 'imported' : 'declared-only',
      evidence: [declared ? `${rel(root, pkgFile)} ${runtimeDeps[e.pkg] ? 'dependencies' : 'devDependencies'}.${e.pkg}` : null, v.evidence, importedAt].filter(Boolean),
    });
  }
  const native = nativeEngine(appDir, root);
  if (native) engines.push({ id: native.id, package: null, version: native.version, versionSource: 'project-file', dimension: native.dimension, support: 'unsupported', usage: 'project-file', evidence: [native.evidence] });
  const primary = engines.find((e) => e.usage !== 'declared-only') ?? engines[0] ?? null;

  const hasTs = existsSync(path.join(appDir, 'tsconfig.json')) || files.some((f) => /\.tsx?$/.test(f));
  const language = files.length === 0 && !pkg ? null : hasTs ? 'typescript' : 'javascript';
  const typescriptVersion = hasTs ? resolveVersion('typescript', appDir, root, lock, deps.typescript).version : null;

  const buildTools = BUILD_TOOLS.filter((t) => deps[t] !== undefined).map((t) => ({ tool: t, version: resolveVersion(t, appDir, root, lock, deps[t]).version }));
  for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) if (existsSync(path.join(appDir, f)) && !buildTools.some((b) => b.tool === 'vite')) buildTools.push({ tool: 'vite', version: resolveVersion('vite', appDir, root, lock, undefined).version });

  // Rendering and physics, from configuration and imports.
  const rendering = [];
  if (primary?.id === 'phaser') {
    const r = firstMatch(texts, root, /type:\s*Phaser\.(AUTO|WEBGL|CANVAS)/);
    rendering.push(r ? `phaser-${r.match[1].toLowerCase()}` : 'phaser-default');
  }
  if (primary?.id === 'three') {
    if (firstMatch(texts, root, /WebGPURenderer/)) rendering.push('three-webgpu');
    if (firstMatch(texts, root, /WebGLRenderer|createStage\s*\(/)) rendering.push('three-webgl');
    if (firstMatch(texts, root, /EffectComposer|createStage\s*\(/)) rendering.push('post-processing');
    if (firstMatch(texts, root, /\.shadowMap\.enabled\s*=\s*true|createStage\s*\(/)) rendering.push('shadows');
  }
  const physics = [];
  for (const [p, name] of Object.entries(PHYSICS_PKGS)) if (deps[p] !== undefined || importedPkgs.has(p)) physics.push(name);
  const arcade = firstMatch(texts, root, /default:\s*['"](arcade|matter)['"]/);
  if (arcade) physics.push(`phaser-${arcade.match[1]}`);
  const gamednaSim = [...imports.keys()].some((s) => /^@gamedna\/(starter|kit\/(collision|controller|handling|loop))/.test(s));
  if (gamednaSim) physics.push('fixed-step-simulation');

  const inputDevices = [];
  const kitInput = [...imports.keys()].some((s) => s === '@gamedna/kit/input');
  const probe = (re) => Boolean(firstMatch(texts, root, re));
  if (kitInput || probe(/keydown|keyup|addKey\(|createCursorKeys|\.keyboard\b/)) inputDevices.push('keyboard');
  if (kitInput || probe(/mousemove|pointermove|requestPointerLock|pointerdown|activePointer/)) inputDevices.push('mouse');
  if (kitInput || probe(/getGamepads|gamepadconnected|input\.gamepad/)) inputDevices.push('gamepad');
  if (kitInput || probe(/touchstart|TouchEvent|pointerType\s*===\s*['"]touch|addPointer\(/)) inputDevices.push('touch');

  const gamednaModules = [...new Set([...imports.keys()].filter((s) => s.startsWith('@gamedna/')))].sort();
  const vendored = texts.filter(({ text }) => /export class FixedStepClock/.test(text)).map(({ file }) => rel(root, path.dirname(file)));
  if (vendored.length && !gamednaModules.includes('@gamedna/kit/loop')) gamednaModules.push(...vendored.map((d) => `vendored-kit:${d}`));

  const entryPoints = [];
  const html = readText(path.join(appDir, 'index.html'));
  if (html) for (const m of html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)) entryPoints.push(`index.html -> ${m[1]}`);
  if (pkg?.main) entryPoints.push(`package.json main -> ${pkg.main}`);

  const platforms = [];
  if (html) platforms.push('web');
  if (html && /name=["']viewport["']/.test(html) && inputDevices.includes('touch')) platforms.push('mobile-web');
  for (const [p, kind] of Object.entries(PACKAGING)) if (deps[p] !== undefined && !platforms.includes(kind)) platforms.push(kind);

  const contracts = ['.gamedna/contract.md', 'src/contracts.ts'].filter((f) => existsSync(path.join(appDir, f)));
  const dimension = primary?.dimension ?? null;
  const architecture = [];
  if (gamednaModules.some((m) => m.startsWith('@gamedna/starter'))) architecture.push('gamedna-starter: FixedStepSimulation + SimScene');
  if (gamednaModules.some((m) => m.startsWith('@gamedna/kit'))) architecture.push('gamedna-kit modules');
  if (firstMatch(texts, root, /extends\s+Phaser\.Scene/)) architecture.push('phaser-scenes');
  if (firstMatch(texts, root, /runFixedStep\s*\(|FixedStepClock/)) architecture.push('fixed-step-loop');

  return {
    profileVersion: PROFILE_VERSION,
    kind: 'app',
    app: rel(root, appDir),
    inputsHash: inputsHash(appDir, root),
    engine: primary ? { id: primary.id, version: primary.version, support: primary.support } : null,
    engines,
    language: language ? { id: language, typescript: typescriptVersion } : null,
    buildTools,
    dimension,
    rendering,
    physics: [...new Set(physics)],
    inputDevices,
    platforms,
    architecture,
    gamednaModules,
    contracts,
    entryPoints,
    sourceFiles: files.length,
    lockfile: lock ? rel(root, lock.file) : null,
  };
}

/** Facts the user or the Director declared. Kept across rescans because source cannot reveal them. */
function declaredOf(existing) {
  const d = existing?.declared;
  return d && typeof d === 'object' ? d : { genre: null, targetFps: null, targetHardware: null };
}

function summary(p) {
  if (p.kind === 'monorepo') {
    return [`monorepo: ${p.workspaceApps.length} game app(s)`, ...p.workspaceApps.map((a) => `  ${a.path} [${a.engine}]`), 'rerun with --app <dir> for the app you are changing'].join('\n');
  }
  const e = p.engine ? `${p.engine.id} ${p.engine.version ?? '?'} (${p.engine.support})` : 'none detected';
  const lines = [
    `app: ${p.app}`,
    `engine: ${e}`,
    `language: ${p.language ? `${p.language.id}${p.language.typescript ? ` ${p.language.typescript}` : ''}` : 'unknown'}; build: ${p.buildTools.map((b) => `${b.tool} ${b.version ?? '?'}`).join(', ') || 'none'}`,
    `dimension: ${p.dimension ?? 'unknown'}; rendering: ${p.rendering.join(', ') || 'unknown'}; physics: ${p.physics.join(', ') || 'none found'}`,
    `input: ${p.inputDevices.join(', ') || 'none found'}; platforms: ${p.platforms.join(', ') || 'unknown'}`,
    `gamedna: ${p.gamednaModules.join(', ') || 'none'}; contracts: ${p.contracts.join(', ') || 'none'}`,
  ];
  if (p.engines.length > 1) lines.push(`other engines: ${p.engines.slice(1).map((x) => `${x.id} ${x.version ?? '?'} (${x.usage})`).join(', ')}`);
  if (p.declared?.genre) lines.push(`declared genre: ${p.declared.genre}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { root: process.cwd(), app: undefined, out: undefined, check: false, print: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--app') args.app = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--check') args.check = true;
    else if (a === '--print') args.print = true;
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const args = parseArgs(argv);
  if (args.help) {
    log('usage: fingerprint.mjs [--app <dir>] [--root <dir>] [--out <file>] [--check] [--print] [--force]');
    return 0;
  }
  const root = path.resolve(args.root);
  const appDir = path.resolve(root, args.app ?? '.');
  const out = path.resolve(root, args.out ?? path.join(appDir, '.gamedna', 'profile.json'));
  const existing = readJson(out);
  const hash = inputsHash(appDir, root);
  if (args.check) {
    if (!existing) { log(`missing: ${rel(root, out)}`); return 4; }
    if (existing.inputsHash !== hash || existing.profileVersion !== PROFILE_VERSION) { log(`stale: ${rel(root, out)}`); return 3; }
    log(`fresh: ${rel(root, out)}`);
    return 0;
  }
  if (existing && existing.inputsHash === hash && existing.profileVersion === PROFILE_VERSION && !args.force) {
    log(args.print ? JSON.stringify(existing, null, 2) : `${summary(existing)}\nprofile: ${rel(root, out)} (unchanged)`);
    return 0;
  }
  const profile = { ...fingerprint({ root, app: args.app }), declared: declaredOf(existing) };
  const text = `${JSON.stringify(profile, null, 2)}\n`;
  if (readText(out) !== text) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  log(args.print ? text.trimEnd() : `${summary(profile)}\nprofile: ${rel(root, out)}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`fingerprint: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  }
}
