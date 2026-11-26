import { z } from 'zod';
import { InputTransitionSchema, LIMITS, ParameterValueSchema, PrimitiveSchema, type FlatState, type Primitive } from './schemas.js';
import type { GameHarness } from './scenario.js';

/**
 * GameDNA bridge protocol v1: the one contract every engine adapter implements.
 * Design: .kiro/specs/gamedna-engines/design.md section 3.
 */
export const BRIDGE_PROTOCOL = 1;

const MAX_SEED = 2_147_483_647;
const TickSchema = z.number().int().min(0);
const FlatStateSchema = z.record(z.string().max(120), PrimitiveSchema);
const DataSchema = z.record(z.string().max(60), PrimitiveSchema);
const ParamsSchema = z.record(z.string().max(80), ParameterValueSchema);

export const HelloSchema = z.object({
  type: z.literal('hello'),
  protocol: z.literal(BRIDGE_PROTOCOL),
  /** Present on socket transports; browser pages are reached through Playwright and carry none. */
  token: z.string().max(128).optional(),
  engine: z.string().min(1).max(40),
  engineVersion: z.string().max(60),
  game: z.string().max(80),
  tickRateHz: z.number().int().min(1).max(1000),
  capabilities: z.array(z.string().max(30)).max(20).default([]),
});
export type Hello = z.output<typeof HelloSchema>;

const StateResultSchema = z.object({ tick: TickSchema, state: FlatStateSchema });
const WireEventSchema = z.object({ tick: TickSchema, type: z.string().min(1).max(40), data: DataSchema.default({}) });

/** Method name to params and result schemas. The list of methods is derived from this table. */
export const BRIDGE = {
  reset: {
    params: z.object({ seed: z.number().int().min(0).max(MAX_SEED), params: ParamsSchema, setup: DataSchema }),
    result: StateResultSchema,
  },
  advance: {
    params: z.object({
      to: TickSchema.max(LIMITS.maxTicks),
      /** Sorted by tick. */
      inputs: z.array(InputTransitionSchema).max(LIMITS.maxInputs),
      sampleEvery: z.number().int().min(1),
      lastTick: TickSchema.max(LIMITS.maxTicks),
      maxEvents: z.number().int().min(0).max(LIMITS.maxEvents),
    }),
    result: z.object({
      tick: TickSchema,
      events: z.array(WireEventSchema).max(LIMITS.maxEvents),
      samples: z.array(StateResultSchema).max(LIMITS.maxSamples),
      truncated: z.boolean(),
    }),
  },
  snapshot: {
    params: z.object({ fields: z.array(z.string().max(120)).max(200).optional() }),
    result: StateResultSchema,
  },
  events: {
    params: z.object({ cursor: z.number().int().min(0), limit: z.number().int().min(1).max(1000) }),
    result: z.object({
      events: z.array(WireEventSchema.extend({ seq: z.number().int().min(0) })).max(1000),
      nextCursor: z.number().int().min(0),
      dropped: z.number().int().min(0),
    }),
  },
  parameters: { params: z.object({}), result: z.object({ values: ParamsSchema }) },
  control: {
    params: z.object({ mode: z.enum(['live', 'controlled']) }),
    result: z.object({ mode: z.enum(['live', 'controlled']) }),
  },
  screenshot: {
    params: z.object({}),
    result: z.object({ mime: z.literal('image/png'), data: z.string().max(16 * 1024 * 1024) }),
  },
} as const;

export type BridgeMethod = keyof typeof BRIDGE;
export const BRIDGE_METHODS = Object.keys(BRIDGE) as BridgeMethod[];
export type BridgeParams<M extends BridgeMethod> = z.input<(typeof BRIDGE)[M]['params']>;
export type BridgeResult<M extends BridgeMethod> = z.output<(typeof BRIDGE)[M]['result']>;
export type AdvanceRequest = z.output<(typeof BRIDGE)['advance']['params']>;
export type AdvanceResult = BridgeResult<'advance'>;
export type StateResult = BridgeResult<'reset'>;

/** Error codes an adapter may put in an error reply. */
export const ADAPTER_ERROR_CODES = ['BAD_REQUEST', 'UNKNOWN_METHOD', 'UNSUPPORTED', 'GAME_ERROR'] as const;

export const BridgeReplySchema = z.union([
  z.object({ id: z.number().int().min(1), result: z.unknown() }),
  z.object({ id: z.number().int().min(1), error: z.object({ code: z.string().max(40), message: z.string().max(2000) }) }),
]);

/** A connected adapter on any transport. Implementations validate every result against `BRIDGE`. */
export interface BridgeDriver {
  readonly hello: Hello;
  call<M extends BridgeMethod>(method: M, params: BridgeParams<M>): Promise<BridgeResult<M>>;
}

/**
 * Reference meaning of `advance`. Every adapter ports this loop line for line, and the
 * conformance test compares each port against it.
 */
export function advanceHarness(harness: GameHarness, req: AdvanceRequest): AdvanceResult {
  const events: Array<{ tick: number; type: string; data: Record<string, Primitive> }> = [];
  const samples: Array<{ tick: number; state: FlatState }> = [];
  let truncated = false;
  let next = 0;
  while (harness.currentTick() < req.to) {
    const tick = harness.currentTick();
    for (let input = req.inputs[next]; input && input.tick <= tick; input = req.inputs[++next]) {
      if (input.tick === tick) harness.setInput(input.key, input.down);
    }
    harness.step();
    const now = harness.currentTick();
    for (const raw of harness.drainEvents()) {
      if (events.length >= req.maxEvents) {
        truncated = true;
        break;
      }
      events.push({ tick: now, type: raw.type, data: raw.data ?? {} });
    }
    if (now % req.sampleEvery === 0 || now === req.lastTick) samples.push({ tick: now, state: harness.snapshot() });
  }
  return { tick: harness.currentTick(), events, samples, truncated };
}
