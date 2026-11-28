import { describe, expect, it } from 'vitest';
import { defineContracts } from '../src/contracts.js';
import { createEventQueue } from '../src/events.js';

interface Ev {
  hit: { target: number; damage: number };
  killed: { target: number };
  wave: { n: number };
}

describe('events', () => {
  it('drains in emission order with tick stamps and sequence numbers', () => {
    const q = createEventQueue<Ev>();
    q.tick = 4;
    q.emit('hit', { target: 1, damage: 2 });
    q.emit('killed', { target: 1 });
    q.tick = 5;
    q.emit('wave', { n: 2 });
    expect(q.size).toBe(3);
    expect(q.drain()).toEqual([
      { type: 'hit', payload: { target: 1, damage: 2 }, tick: 4, seq: 0 },
      { type: 'killed', payload: { target: 1 }, tick: 4, seq: 1 },
      { type: 'wave', payload: { n: 2 }, tick: 5, seq: 2 },
    ]);
    expect(q.drain()).toEqual([]);
  });

  it('dispatches only at flush; events emitted by handlers wait for the next flush', () => {
    const q = createEventQueue<Ev>(), log: string[] = [];
    q.on('hit', (p) => { log.push(`hit ${p.target}`); if (p.damage >= 3) q.emit('killed', { target: p.target }); });
    q.on('killed', (p, e) => log.push(`killed ${p.target} @${e.tick}`));
    q.on('hit', () => log.push('second hit handler'));
    q.emit('hit', { target: 7, damage: 5 });
    expect(log).toEqual([]);
    expect(q.flush().map((e) => e.type)).toEqual(['hit']);
    expect(log).toEqual(['hit 7', 'second hit handler']);
    q.tick = 9;
    q.flush();
    expect(log).toEqual(['hit 7', 'second hit handler', 'killed 7 @0']);
  });

  it('keeps the rest of the batch when a handler throws, ahead of events emitted during the flush', () => {
    const q = createEventQueue<Ev>(), seen: string[] = [];
    q.on('hit', (p) => { seen.push(`hit ${p.target}`); q.emit('wave', { n: p.target }); if (p.target === 2) throw new Error('bad hit'); });
    q.on('killed', (p) => seen.push(`killed ${p.target}`));
    q.emit('hit', { target: 1, damage: 1 });
    q.emit('hit', { target: 2, damage: 1 });
    q.emit('killed', { target: 2 });
    q.emit('hit', { target: 3, damage: 1 });
    expect(() => q.flush()).toThrow('bad hit');
    expect(seen).toEqual(['hit 1', 'hit 2']);
    expect(q.size).toBe(4);
    const next = q.flush();
    expect(next.map((e) => [e.type, e.seq])).toEqual([['killed', 2], ['hit', 3], ['wave', 4], ['wave', 5]]);
    expect(seen).toEqual(['hit 1', 'hit 2', 'killed 2', 'hit 3']);
    expect(q.drain().map((e) => [e.type, e.seq])).toEqual([['wave', 6]]);
    expect(next.map((e) => e.seq)).toEqual([2, 3, 4, 5]);
  });

  it('unsubscribes, including from inside a handler', () => {
    const q = createEventQueue<Ev>();
    let n = 0;
    const off = q.on('wave', () => { n++; off(); });
    q.emit('wave', { n: 1 });
    q.emit('wave', { n: 2 });
    q.flush();
    expect(n).toBe(1);
    off();
    expect(q.on('wave', () => n++)).toBeTypeOf('function');
  });

  it('counts overflow instead of throwing', () => {
    const q = createEventQueue<Ev>({ capacity: 3 });
    const accepted = [1, 2, 3, 4, 5].map((n) => q.emit('wave', { n }));
    expect(accepted).toEqual([true, true, true, false, false]);
    expect(q.dropped).toBe(2);
    expect(q.drain().map((e) => (e.type === 'wave' ? e.payload.n : 0))).toEqual([1, 2, 3]);
    expect(q.emit('wave', { n: 6 })).toBe(true);
  });

  it('rejects names the contracts do not declare', () => {
    const contracts = defineContracts({
      name: 'test',
      spatial: { unit: 'pixel', up: '-y', ground: 'xy' },
      simulation: { hz: 60, deterministic: true, order: ['rules'] },
      events: ['hit', 'killed'],
    });
    const q = createEventQueue<Ev>({ allowed: contracts.events });
    expect(q.emit('wave', { n: 1 })).toBe(false);
    expect(q.emit('hit', { target: 1, damage: 1 })).toBe(true);
    expect(q.rejected).toBe(1);
    expect(() => q.on('wave', () => {})).toThrow(/not declared/);
    q.clear();
    expect([q.size, q.rejected, q.dropped]).toEqual([0, 0, 0]);
  });
});
