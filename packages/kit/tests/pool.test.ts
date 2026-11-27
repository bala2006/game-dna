import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RingBuffer, createPool } from '../src/pool.js';

type Item = { id: number; v: number };
const make = (max: number, whenFull: 'null' | 'recycle-oldest' = 'null', initial = 0) => {
  let made = 0;
  const pool = createPool<Item>({ create: () => ({ id: made++, v: 0 }), reset: (i) => { i.v = 0; }, initial, max, whenFull });
  return { pool, made: () => made };
};

describe('pool', () => {
  it('never creates or hands out more than max, under any acquire/release sequence', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 20 }), fc.constantFrom('null' as const, 'recycle-oldest' as const), fc.array(fc.nat(30), { maxLength: 200 }), (max, initial, whenFull, ops) => {
      const { pool, made } = make(max, whenFull, initial);
      const held: Item[] = [];
      for (const op of ops) {
        if (op % 3 === 0 && held.length > 0) {
          const [item] = held.splice(op % held.length, 1);
          expect(pool.release(item as Item)).toBe(true);
        } else {
          const item = pool.acquire();
          if (item === null) expect(whenFull === 'null' && pool.inUse === max).toBe(true);
          else if (!held.includes(item)) held.push(item);
        }
        expect(made()).toBeLessThanOrEqual(max);
        expect(pool.size).toBe(made());
        expect(pool.inUse).toBeLessThanOrEqual(max);
        expect(pool.inUse).toBe(held.length);
      }
    }));
  });

  it('creates items up front and lazily, then returns null when full', () => {
    const { pool, made } = make(3, 'null', 2);
    expect(made()).toBe(2);
    const items = [pool.acquire(), pool.acquire(), pool.acquire()];
    expect(made()).toBe(3);
    expect(new Set(items).size).toBe(3);
    expect(pool.acquire()).toBeNull();
    expect(pool.inUse).toBe(3);
  });

  it('resets on release and hands the same object back', () => {
    const { pool } = make(2);
    const a = pool.acquire() as Item;
    a.v = 42;
    expect(pool.release(a)).toBe(true);
    expect(a.v).toBe(0);
    expect(pool.release(a)).toBe(false);
    expect(pool.release({ id: -1, v: 0 })).toBe(false);
    const b = pool.acquire() as Item;
    expect(b).toBe(a);
    expect(b.v).toBe(0);
  });

  it('recycles the oldest active item first, reset, when full', () => {
    const { pool } = make(3, 'recycle-oldest');
    const [a, b, c] = [pool.acquire(), pool.acquire(), pool.acquire()] as Item[];
    for (const i of [a, b, c]) (i as Item).v = 7;
    const r1 = pool.acquire() as Item;
    expect(r1).toBe(a);
    expect(r1.v).toBe(0);
    expect(pool.acquire()).toBe(b);
    pool.release(c as Item);
    expect(pool.acquire()).toBe(c);
    expect(pool.acquire()).toBe(a);
    const order: number[] = [];
    pool.forEachActive((i) => order.push(i.id));
    expect(order).toEqual([(b as Item).id, (c as Item).id, (a as Item).id]);
  });

  it('visits active items oldest first and tolerates releasing the visited item', () => {
    const { pool } = make(6);
    const items = Array.from({ length: 6 }, () => pool.acquire() as Item);
    const seen: number[] = [];
    pool.forEachActive((i) => { seen.push(i.id); if (i.id % 2 === 0) pool.release(i); });
    expect(seen).toEqual(items.map((i) => i.id));
    expect(pool.inUse).toBe(3);
    pool.releaseAll();
    expect(pool.inUse).toBe(0);
    expect(pool.size).toBe(6);
  });

  it('rejects a max below 1', () => {
    expect(() => createPool({ create: () => 0, max: 0 })).toThrow();
  });
});

describe('RingBuffer', () => {
  it('hands out slots in order and wraps onto the oldest', () => {
    const ring = new RingBuffer(3, (i) => ({ i }));
    expect(ring.capacity).toBe(3);
    const got = Array.from({ length: 7 }, () => ring.next().i);
    expect(got).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(ring.cursor).toBe(1);
    expect(ring.written).toBe(7);
    expect(ring.at(-1)).toBe(ring.items[2]);
    expect(ring.at(4)).toBe(ring.items[1]);
    ring.rewind();
    expect(ring.next()).toBe(ring.items[0]);
  });

  it('matches the modulo-index ring it replaces', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 200 }), fc.nat(1000), (capacity, writes) => {
      const ring = new RingBuffer(capacity, (i) => i);
      let next = 0, last = -1;
      for (let k = 0; k < writes; k++) { last = ring.next(); expect(last).toBe(next++ % capacity); }
      expect(ring.cursor).toBe(writes % capacity);
    }));
  });

  it('creates every slot once, up front', () => {
    let made = 0;
    const ring = new RingBuffer(110, () => ({ n: made++ }));
    for (let k = 0; k < 500; k++) ring.next();
    expect(made).toBe(110);
    expect(() => new RingBuffer(0, () => 0)).toThrow();
  });
});
