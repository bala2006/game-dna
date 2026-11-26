import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import net, { type AddressInfo } from 'node:net';
import {
  BRIDGE,
  BridgeReplySchema,
  GameDNAError,
  HelloSchema,
  formatIssues,
  type BridgeDriver,
  type BridgeMethod,
  type BridgeParams,
  type BridgeResult,
  type Hello,
} from '@gamedna/core';

/** Loopback listener for native and Android adapters. Design: .kiro/specs/gamedna-engines/design.md section 3. */

const MAX_LINE_BYTES = 16 * 1024 * 1024;
const MAX_HELLO_BYTES = 64 * 1024;
const HELLO_DEADLINE_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const ADVANCE_MS_PER_TICK = 2;
const RECONNECT_FIX = 'Restart the session with gd_stop_session and gd_start_session.';

/** Splits a byte stream into UTF-8 lines and enforces a per-line size limit. */
class LineReader {
  private parts: Buffer[] = [];
  private size = 0;

  constructor(
    public limit: number,
    public onLine: (line: string) => void,
    public onOverflow: () => void,
  ) {}

  push(chunk: Buffer): void {
    let start = 0;
    for (let nl = chunk.indexOf(10, start); nl !== -1; nl = chunk.indexOf(10, start)) {
      if (!this.add(chunk.subarray(start, nl))) return;
      const line = Buffer.concat(this.parts).toString('utf8');
      this.parts = [];
      this.size = 0;
      this.onLine(line);
      start = nl + 1;
    }
    this.add(chunk.subarray(start));
  }

  private add(part: Buffer): boolean {
    this.size += part.length;
    if (this.size > this.limit) {
      this.parts = [];
      this.onOverflow();
      return false;
    }
    if (part.length) this.parts.push(part);
    return true;
  }
}

interface Pending {
  id: number;
  method: BridgeMethod;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/** A connected adapter: one request in flight at a time, every reply checked against `BRIDGE`. */
export class SocketDriver implements BridgeDriver {
  readonly hello: Hello;
  private readonly socket: net.Socket;
  private readonly timeoutMs: number;
  private nextId = 1;
  private tail: Promise<unknown> = Promise.resolve();
  private pending: Pending | null = null;
  private lastTick = 0;
  private closedReason: string | null = null;

  constructor(socket: net.Socket, hello: Hello, reader: LineReader, timeoutMs: number) {
    this.socket = socket;
    this.hello = hello;
    this.timeoutMs = timeoutMs;
    reader.limit = MAX_LINE_BYTES;
    reader.onLine = (line) => this.onLine(line);
    reader.onOverflow = () => {
      this.shutdown('The adapter sent a message over 16 MiB', new GameDNAError('LIMIT_EXCEEDED', 'An adapter reply exceeded 16 MiB'));
      socket.destroy();
    };
    socket.on('close', () => this.shutdown('The game disconnected from the bridge'));
  }

  get closed(): boolean {
    return this.closedReason !== null;
  }

  call<M extends BridgeMethod>(method: M, params: BridgeParams<M>): Promise<BridgeResult<M>> {
    const run = () => this.send(method, params);
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  close(): void {
    this.shutdown('The session was stopped');
    this.socket.destroy();
  }

  private send<M extends BridgeMethod>(method: M, params: BridgeParams<M>): Promise<BridgeResult<M>> {
    if (this.closedReason) return Promise.reject(new GameDNAError('SESSION_NOT_READY', this.closedReason, { fix: RECONNECT_FIX }));
    const id = this.nextId++;
    const ticks = method === 'advance' ? Math.max(0, (params as BridgeParams<'advance'>).to - this.lastTick) : 0;
    const timeoutMs = this.timeoutMs + ADVANCE_MS_PER_TICK * ticks;
    return new Promise<BridgeResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        this.pending = null;
        reject(new GameDNAError('TIMEOUT', `The adapter did not answer "${method}" within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending = { id, method, resolve: resolve as (v: unknown) => void, reject, timer };
      this.socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private settle(error: Error | null, value?: unknown): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    if (error) p.reject(error);
    else p.resolve(value);
  }

  private onLine(line: string): void {
    const p = this.pending;
    if (!p) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return this.settle(new GameDNAError('ADAPTER_ERROR', `The adapter sent a line that is not JSON in reply to "${p.method}"`));
    }
    const reply = BridgeReplySchema.safeParse(raw);
    if (!reply.success) return this.settle(new GameDNAError('ADAPTER_ERROR', `The adapter's reply to "${p.method}" is not a protocol v1 reply`, { details: { issues: formatIssues(reply.error) } }));
    // A late reply to a request that already timed out.
    if (reply.data.id !== p.id) return;
    if ('error' in reply.data) {
      return this.settle(new GameDNAError('ADAPTER_ERROR', reply.data.error.message, { details: { adapterCode: reply.data.error.code, method: p.method } }));
    }
    const result = BRIDGE[p.method].result.safeParse(reply.data.result);
    if (!result.success) return this.settle(new GameDNAError('ADAPTER_ERROR', `The adapter's "${p.method}" result failed validation`, { details: { issues: formatIssues(result.error) } }));
    const tick = (result.data as { tick?: unknown }).tick;
    if (typeof tick === 'number') this.lastTick = tick;
    this.settle(null, result.data);
  }

  private shutdown(reason: string, error?: GameDNAError): void {
    if (this.closedReason) return;
    this.closedReason = reason;
    this.settle(error ?? new GameDNAError('SESSION_NOT_READY', reason, { fix: RECONNECT_FIX }));
  }
}

export interface BridgeListener {
  readonly port: number;
  /** `127.0.0.1:<port>`, the value of GAMEDNA_BRIDGE. */
  readonly address: string;
  /** The connected adapter, or null until a valid hello arrives. */
  readonly driver: SocketDriver | null;
  /** Resolves with the adapter once it said hello; rejects with TIMEOUT after `timeoutMs`. */
  waitForHello(timeoutMs: number): Promise<SocketDriver>;
  close(): Promise<void>;
}

const digest = (token: string) => createHash('sha256').update(token, 'utf8').digest();

function parseHello(line: string): Hello | null {
  try {
    const parsed = HelloSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Listen on 127.0.0.1 on a free port and accept one adapter whose hello carries `token`. */
export async function listenBridge(options: { token: string; sessionId?: string; timeoutMs?: number }): Promise<BridgeListener> {
  const expected = digest(options.token);
  const sessionId = options.sessionId ?? `ses-${randomBytes(4).toString('hex')}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let driver: SocketDriver | null = null;
  let closed = false;
  const unauthenticated = new Set<net.Socket>();
  const waiters = new Set<{ resolve(d: SocketDriver): void; reject(e: Error): void }>();

  const server = net.createServer((socket) => {
    socket.on('error', () => undefined);
    if (driver || closed) return void socket.destroy();
    unauthenticated.add(socket);
    const deadline = setTimeout(() => socket.destroy(), HELLO_DEADLINE_MS);
    socket.on('close', () => {
      clearTimeout(deadline);
      unauthenticated.delete(socket);
    });
    const reader = new LineReader(
      MAX_HELLO_BYTES,
      (line) => {
        reader.onLine = () => undefined;
        const hello = parseHello(line);
        if (!hello?.token || !timingSafeEqual(digest(hello.token), expected) || driver || closed) return void socket.destroy();
        clearTimeout(deadline);
        unauthenticated.delete(socket);
        socket.write(`${JSON.stringify({ type: 'welcome', sessionId })}\n`);
        const connected = new SocketDriver(socket, hello, reader, timeoutMs);
        driver = connected;
        server.close();
        for (const s of unauthenticated) s.destroy();
        for (const w of waiters) w.resolve(connected);
        waiters.clear();
      },
      () => socket.destroy(),
    );
    socket.on('data', (chunk: Buffer) => reader.push(chunk));
  });
  server.on('error', () => undefined);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const address = `127.0.0.1:${port}`;

  return {
    port,
    address,
    get driver() {
      return driver;
    },
    waitForHello(waitMs: number): Promise<SocketDriver> {
      if (driver) return Promise.resolve(driver);
      if (closed) return Promise.reject(new GameDNAError('SESSION_NOT_READY', 'The bridge listener is closed', { fix: RECONNECT_FIX }));
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve: (d: SocketDriver) => {
            clearTimeout(timer);
            resolve(d);
          },
          reject: (e: Error) => {
            clearTimeout(timer);
            reject(e);
          },
        };
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new GameDNAError('TIMEOUT', `No adapter said hello on ${address} within ${waitMs} ms`));
        }, waitMs);
        waiters.add(waiter);
      });
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      driver?.close();
      for (const s of unauthenticated) s.destroy();
      for (const w of waiters) w.reject(new GameDNAError('SESSION_NOT_READY', 'The session was stopped before the game connected'));
      waiters.clear();
      server.close();
    },
  };
}
