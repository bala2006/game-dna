import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GameDNAError } from '@gamedna/core';
import { listenBridge, type BridgeListener } from '../src/bridge-server.js';
import { connectFakeAdapter } from './fake-adapter.js';

const token = randomBytes(16).toString('hex');
let listener: BridgeListener | undefined;

afterEach(async () => {
  await listener?.close();
  listener = undefined;
});

async function codeOf(p: Promise<unknown>): Promise<{ code: string; details: Record<string, unknown> | undefined }> {
  try {
    await p;
  } catch (err) {
    if (err instanceof GameDNAError) return { code: err.code, details: err.details };
    throw err;
  }
  throw new Error('expected a rejection');
}

describe('bridge listener', () => {
  it('listens on loopback and closes a socket whose hello has the wrong token, then accepts the right one', async () => {
    listener = await listenBridge({ token });
    expect(listener.address).toMatch(/^127\.0\.0\.1:\d+$/);
    const intruder = connectFakeAdapter({ address: listener.address, token: 'not-the-token' });
    await expect(intruder.welcome).rejects.toThrow(/closed/);
    expect(listener.driver).toBeNull();

    const adapter = connectFakeAdapter({ address: listener.address, token });
    expect((await adapter.welcome).type).toBe('welcome');
    const driver = await listener.waitForHello(2000);
    expect(driver.hello.engine).toBe('fake');
    expect((await driver.call('snapshot', {})).state).toEqual({ count: 0, tick: 0 });
  });

  it('accepts one adapter per listener', async () => {
    listener = await listenBridge({ token });
    await connectFakeAdapter({ address: listener.address, token }).welcome;
    const second = connectFakeAdapter({ address: listener.address, token });
    await expect(second.welcome).rejects.toThrow();
  });

  it('times out waiting for a hello', async () => {
    listener = await listenBridge({ token });
    expect((await codeOf(listener.waitForHello(50))).code).toBe('TIMEOUT');
  });

  it('keeps one request in flight and numbers requests in order', async () => {
    listener = await listenBridge({ token });
    const adapter = connectFakeAdapter({ address: listener.address, token, replyDelayMs: 15 });
    const driver = await listener.waitForHello(2000);
    const results = await Promise.all([driver.call('snapshot', {}), driver.call('parameters', {}), driver.call('snapshot', { fields: ['count'] })]);
    expect(results[2]).toEqual({ tick: 0, state: { count: 0 } });
    expect(adapter.maxInFlight).toBe(1);
    expect(adapter.requests.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('maps an adapter error reply to ADAPTER_ERROR and rejects results that fail the schema', async () => {
    listener = await listenBridge({ token });
    connectFakeAdapter({ address: listener.address, token, behave: { parameters: 'GAME_ERROR', snapshot: 'bad-result' } });
    const driver = await listener.waitForHello(2000);
    const failed = await codeOf(driver.call('parameters', {}));
    expect(failed).toEqual({ code: 'ADAPTER_ERROR', details: { adapterCode: 'GAME_ERROR', method: 'parameters' } });
    expect((await codeOf(driver.call('snapshot', {}))).code).toBe('ADAPTER_ERROR');
    expect((await codeOf(driver.call('screenshot', {}))).details?.['adapterCode']).toBe('UNSUPPORTED');
  });

  it('times out a request the adapter never answers and keeps working', async () => {
    listener = await listenBridge({ token, timeoutMs: 150 });
    connectFakeAdapter({ address: listener.address, token, behave: { snapshot: 'hang' } });
    const driver = await listener.waitForHello(2000);
    expect((await codeOf(driver.call('snapshot', {}))).code).toBe('TIMEOUT');
    expect((await driver.call('parameters', {})).values).toEqual({});
  });

  it('rejects the pending call and every later call when the socket closes', async () => {
    listener = await listenBridge({ token });
    connectFakeAdapter({ address: listener.address, token, behave: { snapshot: 'close' } });
    const driver = await listener.waitForHello(2000);
    expect((await codeOf(driver.call('snapshot', {}))).code).toBe('SESSION_NOT_READY');
    expect(driver.closed).toBe(true);
    expect((await codeOf(driver.call('parameters', {}))).code).toBe('SESSION_NOT_READY');
  });
});
