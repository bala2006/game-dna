import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { GameDNAError, LoopbackUrlSchema, type ProjectRecord } from '@gamedna/core';
import { readPackage, resolveFromProject } from './project.js';

const MAX_SESSIONS = 2;
const MAX_LOG_LINES = 200;

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

export interface Session {
  id: string;
  projectId: string;
  root: string;
  url: string;
  startedAt: string;
  spawned: boolean;
  process: ChildProcess | null;
  browser: BrowserLike;
  page: PageLike;
  browserVersion: string;
  logs: string[];
  errors: string[];
}

function pushBounded(list: string[], line: string): void {
  list.push(line.slice(0, 500));
  if (list.length > MAX_LOG_LINES) list.shift();
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function killTree(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  try {
    // Negative PID signals the whole process group created with detached: true.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
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

  async start(args: { root: string; record: ProjectRecord; commandId?: string; url?: string }): Promise<Session> {
    if (this.sessions.size >= MAX_SESSIONS) throw new GameDNAError('LIMIT_EXCEEDED', `At most ${MAX_SESSIONS} sessions may run at once`, { fix: 'Stop a session with gd_stop_session.' });
    const { root, record } = args;
    let url: string;
    let script: string | null = null;
    let readyTimeoutMs = 30_000;
    if (args.commandId) {
      const cmd = record.commands[args.commandId];
      if (!cmd) throw new GameDNAError('PERMISSION_DENIED', `Command "${args.commandId}" is not declared in .gamedna/project.json`, { details: { declared: Object.keys(record.commands) } });
      if (cmd.kind !== 'dev') throw new GameDNAError('PERMISSION_DENIED', `Command "${args.commandId}" is a ${cmd.kind} command; sessions need a dev command`);
      if (!cmd.url) throw new GameDNAError('INVALID_INPUT', `Command "${args.commandId}" has no url to attach to`);
      const pkg = readPackage(root);
      if (!pkg.scripts[cmd.script]) throw new GameDNAError('PERMISSION_DENIED', `package.json has no "${cmd.script}" script`);
      script = cmd.script;
      url = cmd.url;
      readyTimeoutMs = cmd.readyTimeoutMs;
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

    const id = `ses-${randomBytes(4).toString('hex')}`;
    const logs: string[] = [];
    const errors: string[] = [];
    let child: ChildProcess | null = null;
    const already = await reachable(url);
    if (!already && script) {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      // Argument array, no shell: only the declared package.json script can run.
      child = spawn(npm, ['run', script], { cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' } });
      child.stdout?.on('data', (d: Buffer) => pushBounded(logs, d.toString()));
      child.stderr?.on('data', (d: Buffer) => pushBounded(errors, d.toString()));
      const deadline = Date.now() + readyTimeoutMs;
      while (!(await reachable(url))) {
        if (child.exitCode !== null) throw new GameDNAError('SESSION_NOT_READY', `Dev command exited with code ${child.exitCode}`, { details: { stderr: errors.slice(-10) } });
        if (Date.now() > deadline) {
          killTree(child);
          throw new GameDNAError('TIMEOUT', `Dev server did not answer at ${url} within ${readyTimeoutMs} ms`, { details: { stderr: errors.slice(-10) } });
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
      killTree(child);
      throw new GameDNAError('SESSION_NOT_READY', `Could not launch Chromium: ${(err as Error).message.split('\n')[0]}`, { fix: 'Run `npx playwright install chromium` in the game project.' });
    }
    const page = await browser.newPage({ viewport: { width: record.viewport.width, height: record.viewport.height } });
    page.on('pageerror', (e) => pushBounded(errors, `pageerror: ${String(e)}`));
    page.on('console', (m) => {
      const msg = m as { type(): string; text(): string };
      if (msg.type() === 'error') pushBounded(errors, `console: ${msg.text()}`);
    });
    const session: Session = { id, projectId: record.projectId, root, url, startedAt: new Date().toISOString(), spawned: child !== null, process: child, browser, page, browserVersion: browser.version(), logs, errors };
    try {
      await this.load(session);
    } catch (err) {
      await browser.close().catch(() => undefined);
      killTree(child);
      throw err;
    }
    this.sessions.set(id, session);
    return session;
  }

  /** Navigate (or reload) and wait for the dev bridge. */
  async load(session: Session, reload = false): Promise<void> {
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

  async stop(id: string): Promise<{ sessionId: string; browserClosed: boolean; processStopped: boolean; attachedOnly: boolean }> {
    const s = this.get(id);
    this.sessions.delete(id);
    let browserClosed = true;
    try {
      await s.browser.close();
    } catch {
      browserClosed = false;
    }
    killTree(s.process);
    return { sessionId: id, browserClosed, processStopped: s.process ? true : false, attachedOnly: !s.spawned };
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(this.list().map((s) => this.stop(s.id)));
  }
}
