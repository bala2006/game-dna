import net from 'node:net';
import { BRIDGE, advanceHarness, type GameHarness, type ParameterValues, type Primitive } from '@gamedna/core';
import { CounterHarness } from '../../core/tests/helpers.js';

/** A 1x1 PNG. */
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type Behavior = 'hang' | 'close' | 'bad-result' | 'GAME_ERROR';

export interface FakeAdapterOptions {
  address: string;
  token: string;
  harness?: GameHarness;
  capabilities?: string[];
  behave?: Partial<Record<string, Behavior>>;
  replyDelayMs?: number;
  /** The game's own tuning values, under any reset overrides. */
  baseline?: () => ParameterValues;
}

export interface FakeAdapter {
  welcome: Promise<{ type: string; sessionId: string }>;
  closed: Promise<void>;
  requests: Array<{ id: number; method: string }>;
  maxInFlight: number;
  close(): void;
}

/** A protocol v1 adapter over a Node socket, driving an in-process harness with the reference loop. */
export function connectFakeAdapter(options: FakeAdapterOptions): FakeAdapter {
  const harness = options.harness ?? new CounterHarness();
  const [host, port] = options.address.split(':');
  const socket = net.connect(Number(port), host);
  const ring: Array<{ seq: number; tick: number; type: string; data: Record<string, Primitive> }> = [];
  let overrides: ParameterValues = {};
  let mode: 'live' | 'controlled' = 'live';
  let inFlight = 0;
  let welcomed: (w: { type: string; sessionId: string }) => void = () => undefined;
  let refused: (e: Error) => void = () => undefined;
  const adapter: FakeAdapter = {
    welcome: new Promise((resolve, reject) => {
      welcomed = resolve;
      refused = reject;
    }),
    closed: new Promise((resolve) => socket.on('close', () => resolve())),
    requests: [],
    maxInFlight: 0,
    close: () => socket.destroy(),
  };
  adapter.welcome.catch(() => undefined);
  socket.on('error', () => undefined);
  socket.on('close', () => refused(new Error('closed before welcome')));
  socket.on('connect', () => {
    socket.write(`${JSON.stringify({ type: 'hello', protocol: 1, token: options.token, engine: 'fake', engineVersion: '0.0.1', game: 'counter', tickRateHz: harness.tickRateHz, capabilities: options.capabilities ?? [] })}\n`);
  });

  const handle = (method: string, params: unknown): unknown => {
    switch (method) {
      case 'reset': {
        const p = BRIDGE.reset.params.parse(params);
        mode = 'controlled';
        overrides = p.params;
        harness.reset(p.seed, { ...(options.baseline?.() ?? {}), ...p.params }, p.setup);
        harness.drainEvents();
        return { tick: harness.currentTick(), state: harness.snapshot() };
      }
      case 'advance': {
        const result = advanceHarness(harness, BRIDGE.advance.params.parse(params));
        for (const e of result.events) ring.push({ seq: ring.length, ...e });
        return result;
      }
      case 'snapshot': {
        const { fields } = BRIDGE.snapshot.params.parse(params);
        const state = harness.snapshot();
        return { tick: harness.currentTick(), state: fields ? Object.fromEntries(Object.entries(state).filter(([k]) => fields.includes(k))) : state };
      }
      case 'events': {
        const { cursor, limit } = BRIDGE.events.params.parse(params);
        const events = ring.slice(cursor, cursor + limit);
        return { events, nextCursor: cursor + events.length, dropped: 0 };
      }
      case 'parameters':
        return { values: { ...(options.baseline?.() ?? {}), ...overrides } };
      case 'control':
        mode = BRIDGE.control.params.parse(params).mode;
        return { mode };
      case 'screenshot':
        if (!(options.capabilities ?? []).includes('screenshot')) throw Object.assign(new Error('no screenshots'), { code: 'UNSUPPORTED' });
        return { mime: 'image/png', data: TINY_PNG };
      default:
        throw Object.assign(new Error(`unknown method ${method}`), { code: 'UNKNOWN_METHOD' });
    }
  };

  let buffer = '';
  let greeted = false;
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const msg = JSON.parse(line) as { type?: string; sessionId?: string; id?: number; method?: string; params?: unknown };
      if (!greeted) {
        greeted = true;
        welcomed(msg as { type: string; sessionId: string });
        continue;
      }
      const id = msg.id as number;
      const method = msg.method as string;
      adapter.requests.push({ id, method });
      const behavior = options.behave?.[method];
      if (behavior === 'hang') continue;
      if (behavior === 'close') {
        socket.destroy();
        return;
      }
      let reply: unknown;
      try {
        if (behavior === 'GAME_ERROR') throw Object.assign(new Error(`${method} blew up`), { code: 'GAME_ERROR' });
        reply = { id, result: behavior === 'bad-result' ? { tick: -1, state: { nested: { x: 1 } } } : handle(method, msg.params) };
      } catch (err) {
        reply = { id, error: { code: (err as { code?: string }).code ?? 'BAD_REQUEST', message: (err as Error).message } };
      }
      inFlight++;
      adapter.maxInFlight = Math.max(adapter.maxInFlight, inFlight);
      setTimeout(() => {
        inFlight--;
        socket.write(`${JSON.stringify(reply)}\n`);
      }, options.replyDelayMs ?? 0);
    }
  });
  return adapter;
}
