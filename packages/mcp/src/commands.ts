import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { GameDNAError, ToolNameSchema, type Command, type ProjectRecord } from '@gamedna/core';
import { resolveInside, writeJsonAtomic } from '@gamedna/core/node';
import { unityVersion, unrealVersion, type EngineProfile } from './engines.js';
import { readPackage } from './project.js';

/** Command policy and engine tool resolution. Design: .kiro/specs/gamedna-engines/design.md section 4. */

const WIN = process.platform === 'win32';
const EXE = WIN ? '.exe' : '';

/** Shells and script interpreters never run, whatever a record or the user config says. */
const INTERPRETER = /^(cmd|powershell|powershell_ise|pwsh|bash|sh|zsh|python|python3|node|nodejs|deno|bun|perl|ruby|wscript|cscript)[0-9.]*$/i;
/** What cmd.exe receives for a .cmd or .bat file. The executable path is quoted, so it may also hold spaces, parentheses and ~. */
const CMD_SAFE_ARG = /^[A-Za-z0-9_./:\\=@+,-]*$/;
const CMD_SAFE_PATH = /^[A-Za-z0-9_./:\\=@+,() ~-]*$/;

export interface ToolSpec {
  name: string;
  /** Matched against the file name without .exe, .cmd or .bat. */
  pattern: RegExp;
  /** Environment variables that name the binary, or a folder when `join` is set. */
  env: ReadonlyArray<{ name: string; join?: string }>;
  pathNames: readonly string[];
  /** Project-relative files, e.g. the project's own gradlew. */
  projectLocal: readonly string[];
  /** Absolute install locations; `*` matches one folder level. */
  known: readonly string[];
  /** A path segment to prefer among known locations, e.g. the project's Unity version. */
  prefer?: (root: string) => string | null;
}

const home = os.homedir();
const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
const localAppData = process.env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local');

export const TOOLS: Readonly<Record<string, ToolSpec>> = {
  npm: { name: 'npm', pattern: /^npm$/i, env: [], pathNames: ['npm'], projectLocal: [], known: [path.join(path.dirname(process.execPath), WIN ? 'npm.cmd' : 'npm')] },
  godot: { name: 'godot', pattern: /^godot[\w.-]*$/i, env: [{ name: 'GODOT_BIN' }], pathNames: ['godot', 'godot4'], projectLocal: [], known: WIN ? [] : ['/Applications/Godot.app/Contents/MacOS/Godot'] },
  unity: {
    name: 'unity',
    pattern: /^unity$/i,
    env: [{ name: 'UNITY_EDITOR' }],
    pathNames: [],
    projectLocal: [],
    known: WIN ? [path.join(programFiles, 'Unity/Hub/Editor/*/Editor/Unity.exe')] : ['/Applications/Unity/Hub/Editor/*/Unity.app/Contents/MacOS/Unity', path.join(home, 'Unity/Hub/Editor/*/Editor/Unity')],
    prefer: (root) => unityVersion(root),
  },
  'unreal-editor': {
    name: 'unreal-editor',
    pattern: /^UnrealEditor(-Cmd)?$/i,
    env: [{ name: 'UNREAL_EDITOR' }],
    pathNames: ['UnrealEditor-Cmd'],
    projectLocal: [],
    known: WIN ? [path.join(programFiles, 'Epic Games/UE_*/Engine/Binaries/Win64/UnrealEditor-Cmd.exe')] : ['/Users/Shared/Epic Games/UE_*/Engine/Binaries/Mac/UnrealEditor-Cmd'],
    prefer: (root) => {
      const v = unrealVersion(root);
      return v && v !== 'unknown' ? `UE_${v}` : null;
    },
  },
  gradlew: { name: 'gradlew', pattern: /^gradlew$/i, env: [], pathNames: [], projectLocal: [WIN ? 'gradlew.bat' : 'gradlew'], known: [] },
  adb: {
    name: 'adb',
    pattern: /^adb$/i,
    env: [
      { name: 'ANDROID_HOME', join: 'platform-tools/adb' },
      { name: 'ANDROID_SDK_ROOT', join: 'platform-tools/adb' },
    ],
    pathNames: ['adb'],
    projectLocal: [],
    known: WIN ? [path.join(localAppData, 'Android/Sdk/platform-tools/adb.exe')] : [path.join(home, 'Library/Android/sdk/platform-tools/adb'), path.join(home, 'Android/Sdk/platform-tools/adb')],
  },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The spec for a tool name. A name outside `TOOLS` (a custom engine's tool) resolves only by exact name. */
export function toolSpec(name: string): ToolSpec {
  if (INTERPRETER.test(name)) throw new GameDNAError('PERMISSION_DENIED', `"${name}" is a shell or script interpreter; GameDNA never runs one`);
  return TOOLS[name] ?? { name, pattern: new RegExp(`^${escapeRe(name)}$`, 'i'), env: [], pathNames: [name], projectLocal: [], known: [] };
}

const stem = (file: string) => path.basename(file).replace(/\.(exe|cmd|bat)$/i, '');

/** Why `file` cannot be used for the tool, or null when it can. */
export function rejectToolPath(spec: ToolSpec, file: string): string | null {
  if (!path.isAbsolute(file)) return 'the path must be absolute';
  if (!existsSync(file) || !statSync(file).isFile()) return 'no file at that path';
  if (INTERPRETER.test(stem(file)) || INTERPRETER.test(stem(realpathSync(file)))) return 'it is a shell or script interpreter';
  if (!spec.pattern.test(stem(file))) return `its file name does not look like ${spec.name} (${spec.pattern.source})`;
  return null;
}

// ------------------------------------------------------------------ user config

const ToolConfigSchema = z.object({ schemaVersion: z.literal(1), tools: z.record(ToolNameSchema, z.string().max(1000)) });

/** Outside every repository: %APPDATA%\gamedna, $XDG_CONFIG_HOME/gamedna or ~/.config/gamedna. */
export function toolConfigFile(): string {
  const dir = process.env['GAMEDNA_CONFIG_DIR'] ?? (WIN ? path.join(process.env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'), 'gamedna') : path.join(process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config'), 'gamedna'));
  return path.join(dir, 'tools.json');
}

export function readToolConfig(): Record<string, string> {
  const file = toolConfigFile();
  if (!existsSync(file)) return {};
  let parsed: ReturnType<typeof ToolConfigSchema.safeParse> | null = null;
  try {
    parsed = ToolConfigSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    parsed = null;
  }
  if (parsed?.success) return parsed.data.tools;
  console.error(`[gamedna] ignoring unreadable tool config ${file}`);
  return {};
}

/** Store or remove (`file: null`) a tool path in the user config after checking it. */
export function setToolPath(name: string, file: string | null): { tool: string; path: string | null; configFile: string; removed?: boolean } {
  const spec = toolSpec(name);
  const tools = readToolConfig();
  const configFile = toolConfigFile();
  if (file === null) {
    const removed = name in tools;
    delete tools[name];
    writeJsonAtomic(configFile, { schemaVersion: 1, tools });
    return { tool: name, path: null, configFile, removed };
  }
  const reason = rejectToolPath(spec, file);
  if (reason) throw new GameDNAError(reason === 'no file at that path' ? 'NOT_FOUND' : 'PERMISSION_DENIED', `Cannot use ${file} as ${name}: ${reason}`);
  tools[name] = path.resolve(file);
  writeJsonAtomic(configFile, { schemaVersion: 1, tools });
  return { tool: name, path: tools[name] as string, configFile };
}

// ------------------------------------------------------------------ resolution

export type ToolSource = 'config' | 'env' | 'project' | 'path' | 'known';
export interface ResolvedTool {
  tool: string;
  path: string;
  source: ToolSource;
}

function expandGlob(pattern: string): string[] {
  const parts = pattern.split(/[\\/]+/);
  let found = [parts[0] === '' ? path.sep : `${parts[0]}${path.sep}`];
  for (const part of parts.slice(1)) {
    if (!part) continue;
    if (!part.includes('*')) {
      found = found.map((d) => path.join(d, part));
      continue;
    }
    const re = new RegExp(`^${part.split('*').map(escapeRe).join('.*')}$`, 'i');
    found = found.flatMap((d) => {
      try {
        return readdirSync(d).filter((n) => re.test(n)).map((n) => path.join(d, n));
      } catch {
        return [];
      }
    });
  }
  return found;
}

function* candidates(spec: ToolSpec, root: string): Generator<[ToolSource, string]> {
  const configured = readToolConfig()[spec.name];
  if (configured) yield ['config', configured];
  for (const e of spec.env) {
    const value = process.env[e.name];
    if (value) yield ['env', e.join ? path.join(value, `${e.join}${EXE}`) : value];
  }
  for (const rel of spec.projectLocal) yield ['project', resolveInside(root, rel)];
  const exts = WIN ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter).map((d) => d.replace(/^"|"$/g, '')).filter(Boolean)) {
    for (const name of spec.pathNames) for (const ext of exts) yield ['path', path.join(dir, `${name}${ext}`)];
  }
  const prefer = spec.prefer?.(root) ?? null;
  const rank = (p: string) => (prefer && p.split(/[\\/]/).includes(prefer) ? 1 : 0);
  const known = spec.known.flatMap(expandGlob).sort((a, b) => rank(b) - rank(a) || b.localeCompare(a, undefined, { numeric: true }));
  for (const file of known) yield ['known', file];
}

/** Find a tool: user config, environment, project-local, PATH, then known install folders. */
export function resolveTool(name: string, projectRoot: string): ResolvedTool | null {
  const spec = toolSpec(name);
  for (const [source, file] of candidates(spec, projectRoot)) {
    if (rejectToolPath(spec, file) === null) return { tool: name, path: path.resolve(file), source };
  }
  return null;
}

// ------------------------------------------------------------------ commands

export interface PreparedCommand {
  id: string;
  kind: Command['kind'];
  tool: string;
  file: string;
  args: string[];
  cwd: string;
  /** The command as declared, without the substituted project root. */
  display: string;
  url: string | undefined;
  readyTimeoutMs: number;
  timeoutMs: number;
}

/** Check a declared command against the engine profile and resolve its tool. Nothing runs here. */
export function prepareCommand(args: { root: string; record: ProjectRecord; profile: EngineProfile; commandId: string; kinds: ReadonlyArray<Command['kind']>; purpose: string }): PreparedCommand {
  const { root, record, profile, commandId } = args;
  const cmd = record.commands[commandId];
  if (!cmd) throw new GameDNAError('PERMISSION_DENIED', `Command "${commandId}" is not declared in .gamedna/project.json`, { details: { declared: Object.keys(record.commands) } });
  if (!args.kinds.includes(cmd.kind)) throw new GameDNAError('PERMISSION_DENIED', `Command "${commandId}" is a ${cmd.kind} command; ${args.purpose} needs a ${args.kinds.join(' or ')} command`);
  const argv = cmd.script !== undefined ? ['npm', 'run', cmd.script] : (cmd.argv ?? []);
  const tool = argv[0] ?? '';
  toolSpec(tool);
  if (cmd.argv && tool === 'npm') throw new GameDNAError('PERMISSION_DENIED', `Command "${commandId}" runs npm through argv; declare it as "script" so only package.json scripts run`);
  if (!profile.tools.includes(tool)) {
    throw new GameDNAError('PERMISSION_DENIED', `Tool "${tool}" is not allowed for ${profile.label} projects`, { details: { allowed: profile.tools }, ...(profile.id === 'custom' ? { fix: 'List it in engine.tools in .gamedna/project.json.' } : {}) });
  }
  if (cmd.script !== undefined && !readPackage(root).scripts[cmd.script]) throw new GameDNAError('PERMISSION_DENIED', `package.json has no "${cmd.script}" script`);
  const resolved = resolveTool(tool, root);
  if (!resolved) throw new GameDNAError('NOT_FOUND', `Could not find ${tool} on this machine`, { fix: `Call gd_configure_tool with tool "${tool}" and the absolute path of the executable.` });
  return {
    id: commandId,
    kind: cmd.kind,
    tool,
    file: resolved.path,
    args: argv.slice(1).map((a) => a.split('{project}').join(root)),
    cwd: cmd.cwd ? resolveInside(root, cmd.cwd) : root,
    display: argv.join(' '),
    url: cmd.url,
    readyTimeoutMs: cmd.readyTimeoutMs,
    timeoutMs: cmd.timeoutMs,
  };
}

const systemExe = (name: string) => path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', name);

/** The cmd.exe arguments that run a .cmd or .bat file, after checking every character cmd.exe could interpret. */
export function cmdShimArgs(file: string, args: readonly string[]): string[] {
  if (!CMD_SAFE_PATH.test(file)) throw new GameDNAError('PERMISSION_DENIED', `Refusing to run ${path.basename(file)} through cmd.exe: its path has characters cmd.exe would interpret`);
  const bad = args.filter((a) => !CMD_SAFE_ARG.test(a));
  if (bad.length) throw new GameDNAError('PERMISSION_DENIED', `Refusing to pass arguments with shell characters to ${path.basename(file)} through cmd.exe`, { details: { arguments: bad }, fix: 'Use only letters, digits and _ . / : \\ = @ + , - in arguments of .cmd and .bat tools.' });
  return ['/d', '/s', '/c', `""${file}"${args.map((a) => ` ${a}`).join('')}"`];
}

/** Start a prepared command without a shell. stdout and stderr are always piped. */
export function spawnCommand(cmd: Pick<PreparedCommand, 'file' | 'args' | 'cwd'>, env: Record<string, string> = {}): ChildProcess {
  const options = { cwd: cmd.cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false };
  if (WIN && /\.(cmd|bat)$/i.test(cmd.file)) return spawn(systemExe('cmd.exe'), cmdShimArgs(cmd.file, cmd.args), { ...options, windowsVerbatimArguments: true });
  // A process group on POSIX, so killTree can signal the whole tree.
  return spawn(cmd.file, cmd.args, { ...options, detached: !WIN });
}

/** Stop a process and everything it started. */
export function killTree(child: ChildProcess | null): Promise<void> {
  if (!child || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const pid = child.pid;
  if (WIN) {
    return new Promise((resolve) => {
      const killer = spawn(systemExe('taskkill.exe'), ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false });
      killer.on('error', () => {
        child.kill();
        resolve();
      });
      killer.on('exit', () => resolve());
    });
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  return Promise.resolve();
}

export interface CommandOutcome {
  code: number | null;
  output: string;
  timedOut: boolean;
  error: string | null;
}

/** Run a prepared command to completion and keep the last 4,000 characters of its output. */
export function runCommand(cmd: PreparedCommand, env: Record<string, string> = {}): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    const child = spawnCommand(cmd, env);
    let output = '';
    const add = (d: Buffer) => {
      // eslint-disable-next-line no-control-regex
      output = (output + d.toString().replace(/\u001b\[[0-9;]*m/g, '')).slice(-4000);
    };
    child.stdout?.on('data', add);
    child.stderr?.on('data', add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void killTree(child);
    }, cmd.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, output, timedOut: false, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut, error: null });
    });
  });
}
