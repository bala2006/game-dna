import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE,
  BRIDGE_METHODS,
  HelloSchema,
  ScenarioSchema,
  advanceHarness,
  runScenario,
  runScenarioOn,
  type BridgeDriver,
  type BridgeMethod,
  type GameHarness,
  type RawEvent,
  type ScenarioInput,
} from '../src/index.js';
import { CounterHarness } from './helpers.js';

/** An adapter in memory: every message crosses a JSON round trip and both schemas, as on a socket. */
function memoryDriver(harness: GameHarness): BridgeDriver & { calls: BridgeMethod[] } {
  const calls: BridgeMethod[] = [];
  const wire = <T>(x: T): unknown => JSON.parse(JSON.stringify(x));
  return {
    calls,
    hello: HelloSchema.parse({ type: 'hello', protocol: 1, engine: 'memory', engineVersion: '0', game: 'counter', tickRateHz: harness.tickRateHz }),
    async call(method, params) {
      calls.push(method);
      let result: unknown;
      if (method === 'reset') {
        const p = BRIDGE.reset.params.parse(wire(params));
        harness.reset(p.seed, p.params, p.setup);
        harness.drainEvents();
        result = { tick: harness.currentTick(), state: harness.snapshot() };
      } else if (method === 'advance') {
        result = advanceHarness(harness, BRIDGE.advance.params.parse(wire(params)));
      } else if (method === 'snapshot') {
        result = { tick: harness.currentTick(), state: harness.snapshot() };
      } else {
        throw new Error(`memory driver does not implement ${method}`);
      }
      return BRIDGE[method].result.parse(wire(result)) as never;
    },
  };
}

const scenario = (over: Partial<ScenarioInput> = {}) =>
  ScenarioSchema.parse({
    id: 'counter-run',
    description: 'press inc a few times',
    seed: 7,
    maxTicks: 40,
    inputs: [
      { tick: 12, key: 'inc', down: true },
      { tick: 3, key: 'inc', down: true },
      { tick: 5, key: 'inc', down: false },
      { tick: 14, key: 'inc', down: false },
    ],
    assertions: [{ type: 'eventCount', checkId: 'INC-01', event: 'inc', op: 'eq', value: 2 }],
    ...over,
  });

describe('bridge protocol v1', () => {
  it('derives the method list from the schema table', () => {
    expect(BRIDGE_METHODS).toEqual(['reset', 'advance', 'snapshot', 'events', 'parameters', 'control', 'screenshot']);
  });

  it('rejects nested state and other protocol versions', () => {
    expect(BRIDGE.snapshot.result.safeParse({ tick: 1, state: { player: { x: 1 } } }).success).toBe(false);
    expect(HelloSchema.safeParse({ type: 'hello', protocol: 2, engine: 'x', engineVersion: '1', game: 'g', tickRateHz: 60 }).success).toBe(false);
  });

  it('runs a scenario remotely with the same result as in process', async () => {
    const s = scenario({ checkpoints: [20, 6, 6] });
    const local = runScenario(new CounterHarness(), s, { 'counter.step': 2 }, { revision: 'r1' });
    const driver = memoryDriver(new CounterHarness());
    const remote = await runScenarioOn(driver, s, { 'counter.step': 2 }, { revision: 'r1' });
    expect(remote).toEqual(local);
    expect(remote.status).toBe('passed');
    expect(driver.calls).toEqual(['reset', 'advance', 'advance', 'advance', 'snapshot']);
  });

  it('matches the in-process run for any inputs, checkpoints and sampling', async () => {
    const input = fc.record({ tick: fc.integer({ min: 0, max: 80 }), key: fc.constantFrom('inc', 'other'), down: fc.boolean() });
    await fc.assert(
      fc.asyncProperty(
        fc.array(input, { maxLength: 30 }),
        fc.array(fc.integer({ min: 0, max: 90 }), { maxLength: 8 }),
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 80 }),
        async (inputs, checkpoints, sampleEvery, maxTicks) => {
          const s = scenario({ inputs, checkpoints, sampleEvery, maxTicks });
          expect(await runScenarioOn(memoryDriver(new CounterHarness()), s)).toEqual(runScenario(new CounterHarness(), s));
        },
      ),
      { numRuns: 150 },
    );
  });

  it('caps events across segments and reports the truncation', async () => {
    class Flood extends CounterHarness {
      override drainEvents(): RawEvent[] {
        return Array.from({ length: 900 }, () => ({ type: 'spam' }));
      }
    }
    const s = scenario({ maxTicks: 30, checkpoints: [10], assertions: [] });
    const local = runScenario(new Flood(), s);
    const remote = await runScenarioOn(memoryDriver(new Flood()), s);
    expect(local.events).toHaveLength(20_000);
    expect(remote).toEqual(local);
    expect(remote.limitations.some((l) => l.includes('truncated'))).toBe(true);
  });
});
