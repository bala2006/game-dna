import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { GameDNAError, LoopbackUrlSchema, type ProjectRecord } from '@gamedna/core';
import { listenBridge, type BridgeListener, type SocketDriver } from './bridge-server.js';
import { killTree, prepareCommand, spawnCommand } from './commands.js';
import type { EngineProfile } from './engines.js';
import { resolveFromProject } from './project.js';

const MAX_SESSIONS = 2;
const MAX_LOG_LINES = 200;
/** How long a tool call on an attach session waits for the game to connect. */
const ATTACH_WAIT_MS = 30_000;

/** The subset of Playwright's API GameDNA uses. Playwright is loaded from the game project. */
export interface PageLike {
  goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
  reload(opts?: Record<string, unknown>): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  waitForFunction(fn: string | (() => unknown), arg?: unknown, opts?: Record<string, unknown>): Promise<unknown>;
  screenshot(opts?: Record<string, unknown>): Promise<Buffer>;
  on(event: string, cb: (x: unknown) => void): void;
}
interface BrowserLike {
  newPage(opts?: Record<string, unknown>): Promise<PageLike>;
  close(): Promise<void>;
  version(): string;
}

interface SessionBase {
  id: string;
  projectId: string;
  root: string;
  startedAt: string;
  /** The process this session started, if any. Only that process is stopped with the session. */
  process: ChildProcess | null;
  logs: string[];
  errors: string[];
}

export interface BrowserSession extends SessionBase {
  runtime: 'browser';
  url: string;
  spawned: boolean;
  browser: BrowserLike;
  page: PageLike;
  browserVersion: string;
}

/** A native game on the loopback bridge, either launched from a declared command or attached. */
export interface ProcessSession extends SessionBase {
  runtime: 'process';
  commandId: string | null;
  bridge: BridgeListener;
  token: string;
  launchEnv: { GAMEDNA_BRIDGE: string; GAMEDNA_TOKEN: string };
}

export type Session = BrowserSession | ProcessSession;

function pushBounded(list: string[], line: string): void {
  list.push(line.slice(0, 500));
  if (list.length > MAX_LOG_LINES) list.shift();
}

function capture(child: ChildProcess, logs: string[], errors: string[]): void {
  child.stdout?.on('data', (d: Buffer) => pushBounded(logs, d.toString()));
  child.stderr?.on('data', (d: Buffer) => pushBounded(errors, d.toString()));
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Resolves with the exit code when the child exits, and never when it keeps running. */
function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });
}

interface StartArgs {
  root: string;
  record: ProjectRecord;
  profile: EngineProfile;
  commandId?: string;
  url?: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  list(): Session[] {
    return [...this.sessions.values()];
  }

  get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new GameDNAError('SESSION_NOT_READY', `No running session "${id}"`, { fix: 'Start one with gd_start_session, or run headless by passing projectPath instead of sessionId.' });
    return s;
  }

  forProject(projectId: string): Session | undefined {
    return this.list().find((s) => s.projectId === projectId);
  }

  async start(args: StartArgs): Promise<Session> {
    if (this.sessions.size >= MAX_SESSIONS) throw new GameDNAError('LIMIT_EXCEEDED', `At most ${MAX_SESSIONS} sessions may run at once`, { fix: 'Stop a session with gd_stop_session.' });
    const id = `ses-${randomBytes(4).toString('hex')}`;
    let session: Session;
    if (args.profile.runtime === 'browser') session = await this.startBrowser(id, args);
    else if (args.profile.runtime === 'process') session = await this.startProcess(id, args);
    else throw new GameDNAError('UNSUPPORTED_ENGINE', `${args.profile.label} sessions are not implemented yet (phase 3: adb reverse and on-device launch)`);
    this.sessions.set(id, session);
    return session;
  }

  /** The adapter of a process session. An attach session waits (bounded) for the game to connect. */
  async driver(session: ProcessSession): Promise<SocketDriver> {
    let driver: SocketDriver;
    try {
      driver = await session.bridge.waitForHello(ATTACH_WAIT_MS);
    } catch (err) {
      throw new GameDNAError('SESSION_NOT_READY', `The game has not connected to session ${session.id} yet`, {
        fix: `Launch the game with GAMEDNA_BRIDGE=${session.launchEnv.GAMEDNA_BRIDGE} and GAMEDNA_TOKEN set (see gd_start_session's launchEnv), then retry.`,
        details: { cause: (err as Error).message },
      });
    }
    if (driver.closed) throw new GameDNAError('SESSION_NOT_READY', `The game of session ${session.id} disconnected`, { fix: 'Stop the session with gd_stop_session and start a new one.', details: { stderr: session.errors.slice(-10) } });
    return driver;
  }

  private async startProcess(id: string, args: StartArgs): Promise<ProcessSession> {
    if (args.url) throw new GameDNAError('INVALID_INPUT', `${args.profile.label} sessions do not take a url; pass commandId, or nothing to attach to a game you launch yourself`);
    const cmd = args.commandId ? prepareCommand({ ...args, commandId: args.commandId, kinds: ['run', 'headless'], purpose: 'a process session' }) : null;
    const token = randomBytes(16).toString('hex');
    const bridge = await listenBridge({ token, sessionId: id });
    const launchEnv = { GAMEDNA_BRIDGE: bridge.address, GAMEDNA_TOKEN: token };
    const session: ProcessSession = { id, runtime: 'process', projectId: args.record.projectId, root: args.root, startedAt: new Date().toISOString(), process: null, logs: [], errors: [], commandId: cmd?.id ?? null, bridge, token, launchEnv };
    if (!cmd) return session;
    try {
      session.process = spawnCommand(cmd, launchEnv);
    } catch (err) {
      await bridge.close();
      throw err;
    }
    capture(session.process, session.logs, session.errors);
    const outcome = await Promise.race([
      bridge.waitForHello(cmd.readyTimeoutMs).then(
        () => 'ready' as const,
        () => 'timeout' as const,
      ),
      exited(session.process).then((code) => ({ code })),
    ]);
    if (outcome === 'ready') return session;
    await killTree(session.process);
    await bridge.close();
    if (outcome === 'timeout') {
      throw new GameDNAError('ADAPTER_MISSING', `"${cmd.display}" started, but no GameDNA adapter said hello within ${cmd.readyTimeoutMs} ms`, {
        fix: 'Install the adapter with gd_install_adapter, add its wiring lines, and make sure the command starts a development build.',
        details: { stderr: session.errors.slice(-10) },
      });
    }
    throw new GameDNAError('SESSION_NOT_READY', `"${cmd.display}" exited with code ${outcome.code} before the adapter said hello`, { details: { stderr: session.errors.slice(-10), stdout: session.logs.slice(-5) } });
  }

  private async startBrowser(id: string, args: StartArgs): Promise<BrowserSession> {
    const { root, record } = args;
    let url: string;
    const cmd = args.commandId ? prepareCommand({ ...args, commandId: args.commandId, kinds: ['dev'], purpose: 'a browser session' }) : null;
    if (cmd) {
      if (!cmd.url) throw new GameDNAError('INVALID_INPUT', `Command "${cmd.id}" has no url to attach to`);
      url = cmd.url;
    } else if (args.url) {
      const parsed = LoopbackUrlSchema.safeParse(args.url);
      if (!parsed.success) throw new GameDNAError('PERMISSION_DENIED', 'Only http loopback URLs with a port are allowed (127.0.0.1, localhost, [::1])');
      url = parsed.data;
    } else {
      throw new GameDNAError('INVALID_INPUT', 'Pass commandId (from project.json "commands") or a loopback url');
    }

    const playwrightEntry = resolveFromProject(root, 'playwright');
    if (!playwrightEntry) {
      throw new GameDNAError('SESSION_NOT_READY', 'Playwright is not installed in this project', {
        fix: 'Run `npm i -D playwright@1.65.1 && npx playwright install chromium` in the game project, or use headless runs (projectPath without sessionId).',
      });
    }

    const logs: string[] = [];
    const errors: string[] = [];
    let child: ChildProcess | null = null;
    const already = await reachable(url);
    if (!already && cmd) {
      child = spawnCommand(cmd, { BROWSER: 'none' });
      capture(child, logs, errors);
      const deadline = Date.now() + cmd.readyTimeoutMs;
      while (!(await reachable(url))) {
        if (child.exitCode !== null) throw new GameDNAError('SESSION_NOT_READY', `Dev command exited with code ${child.exitCode}`, { details: { stderr: errors.slice(-10) } });
        if (Date.now() > deadline) {
          await killTree(child);
          throw new GameDNAError('TIMEOUT', `Dev server did not answer at ${url} within ${cmd.readyTimeoutMs} ms`, { details: { stderr: errors.slice(-10) } });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } else if (!already) {
      throw new GameDNAError('SESSION_NOT_READY', `Nothing is listening at ${url}`, { fix: 'Start the dev server or use commandId.' });
    }

    let browser: BrowserLike;
    try {
      const pw = (await import(pathToFileURL(playwrightEntry).href)) as { chromium?: { launch(o?: unknown): Promise<BrowserLike> }; default?: { chromium: { launch(o?: unknown): Promise<BrowserLike> } } };
      const chromium = pw.chromium ?? pw.default?.chromium;
      if (!chromium) throw new Error('playwright.chromium not found');
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      await killTree(child);
      throw new GameDNAError('SESSION_NOT_READY', `Could not launch Chromium: ${(err as Error).message.split('\n')[0]}`, { fix: 'Run `npx playwright install chromium` in the game project.' });
    }
    const page = await browser.newPage({ viewport: { width: record.viewport.width, height: record.viewport.height } });
    page.on('pageerror', (e) => pushBounded(errors, `pageerror: ${String(e)}`));
    page.on('console', (m) => {
      const msg = m as { type(): string; text(): string };
      if (msg.type() === 'error') pushBounded(errors, `console: ${msg.text()}`);
    });
    const session: BrowserSession = { id, runtime: 'browser', projectId: record.projectId, root, url, startedAt: new Date().toISOString(), spawned: child !== null, process: child, browser, page, browserVersion: browser.version(), logs, errors };
    try {
      await this.load(session);
    } catch (err) {
      await browser.close().catch(() => undefined);
      await killTree(child);
      throw err;
    }
    return session;
  }

  /** Navigate (or reload) and wait for the dev bridge. */
  async load(session: BrowserSession, reload = false): Promise<void> {
    const target = `${session.url}${session.url.includes('?') ? '&' : '?'}gamedna=1`;
    if (reload) await session.page.reload({ waitUntil: 'load' });
    else await session.page.goto(target, { waitUntil: 'load', timeout: 30_000 });
    try {
      await session.page.waitForFunction('Boolean(window.__GAMEDNA__ && window.__GAMEDNA__.ready)', undefined, { timeout: 15_000 });
    } catch {
      throw new GameDNAError('ADAPTER_MISSING', 'The page loaded but window.__GAMEDNA__ never became ready', {
        fix: 'Install the dev-only adapter (see power/skills/playtesting/SKILL.md) and run the dev build, not a production build.',
        details: { errors: session.errors.slice(-5) },
      });
    }
  }

  async stop(id: string): Promise<Record<string, unknown>> {
    const s = this.get(id);
    this.sessions.delete(id);
    if (s.runtime === 'process') {
      await s.bridge.close();
      await killTree(s.process);
      return { sessionId: id, runtime: 'process', socketClosed: true, processStopped: s.process !== null, attachedOnly: s.process === null };
    }
    let browserClosed = true;
    try {
      await s.browser.close();
    } catch {
      browserClosed = false;
    }
    await killTree(s.process);
    return { sessionId: id, runtime: 'browser', browserClosed, processStopped: s.process !== null, attachedOnly: !s.spawned };
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(this.list().map((s) => this.stop(s.id)));
  }
}
