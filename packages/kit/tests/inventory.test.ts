import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInventory, type ItemDef } from '../src/inventory.js';

const items: ItemDef[] = [
  { id: 'arrow', maxStack: 20, weight: 0.1 },
  { id: 'potion', maxStack: 5, weight: 0.5 },
  { id: 'sword', weight: 3 },
];

describe('inventory', () => {
  it('tops up stacks first, then fills empty slots in order, and returns the leftover', () => {
    const inv = createInventory({ items, slots: 3 });
    expect(inv.add('arrow', 15)).toBe(0);
    expect(inv.add('sword')).toBe(0);
    expect(inv.add('arrow', 30)).toBe(5);
    expect(inv.toJSON().slots).toEqual([{ item: 'arrow', count: 20 }, { item: 'sword', count: 1 }, { item: 'arrow', count: 20 }]);
    expect(inv.add('potion', 2)).toBe(2);
    expect(inv.count('arrow')).toBe(40);
    expect(inv.has('arrow', 41)).toBe(false);
  });

  it('removes from the last matching slot and frees empty slots', () => {
    const inv = createInventory({ items, slots: 4 });
    inv.add('potion', 12);
    expect(inv.remove('potion', 3)).toBe(3);
    expect(inv.toJSON().slots).toEqual([{ item: 'potion', count: 5 }, { item: 'potion', count: 4 }, null, null]);
    expect(inv.remove('potion', 50)).toBe(9);
    expect(inv.slots.every((s) => s === null)).toBe(true);
    expect(() => inv.add('shield')).toThrow(/not declared/);
  });

  it('removes everything for Infinity and refuses add counts that are not whole numbers', () => {
    const inv = createInventory({ items, slots: 4 });
    inv.add('arrow', 30);
    inv.add('potion', 3);
    expect(inv.remove('arrow', Infinity)).toBe(30);
    expect(inv.count('arrow')).toBe(0);
    expect(inv.remove('arrow', Infinity)).toBe(0);
    expect(inv.remove('potion', 1.9)).toBe(1);
    expect(inv.remove('potion', NaN)).toBe(0);
    expect(inv.remove('potion', -2)).toBe(0);
    for (const bad of [Infinity, -Infinity, NaN, 1.5, -1]) expect(() => inv.add('potion', bad), String(bad)).toThrow(RangeError);
    expect(inv.toJSON().slots).toEqual([null, null, { item: 'potion', count: 2 }, null]);
    expect(inv.add('potion', 0)).toBe(0);
  });

  it('respects the weight limit, including float weights', () => {
    const inv = createInventory({ items, slots: 10, maxWeight: 5 });
    expect(inv.add('sword')).toBe(0);
    expect(inv.room('potion')).toBe(4);
    expect(inv.add('potion', 5)).toBe(1);
    expect(inv.add('arrow', 3)).toBe(3);
    inv.remove('potion', 1);
    expect(inv.add('arrow', 10)).toBe(5);
    expect(inv.weight()).toBeCloseTo(5, 9);
    expect(inv.room('arrow')).toBe(0);
  });

  it('moves, merges, swaps and splits stacks', () => {
    const inv = createInventory({ items, slots: 4 });
    inv.add('arrow', 25);
    inv.add('sword');
    expect(inv.move(1, 0)).toBe(0);
    expect(inv.toJSON().slots[1]).toEqual({ item: 'arrow', count: 5 });
    expect(inv.move(1, 1)).toBe(0);
    expect(inv.split(0, 8)).toBe(3);
    expect(inv.move(3, 1)).toBe(8);
    expect(inv.toJSON().slots).toEqual([{ item: 'arrow', count: 12 }, { item: 'arrow', count: 13 }, { item: 'sword', count: 1 }, null]);
    expect(inv.move(2, 0)).toBe(1);
    expect(inv.toJSON().slots.slice(0, 3)).toEqual([{ item: 'sword', count: 1 }, { item: 'arrow', count: 13 }, { item: 'arrow', count: 12 }]);
    expect(inv.move(1, 0, 2)).toBe(0);
    expect(inv.move(1, 3, 2)).toBe(2);
    expect(inv.split(0, 1)).toBe(-1);
  });

  it('round-trips through JSON and reports bad saved slots', () => {
    const inv = createInventory({ items, slots: 3 });
    inv.add('arrow', 7);
    inv.add('potion', 2);
    const copy = createInventory({ items, slots: 3 });
    expect(copy.load(JSON.parse(JSON.stringify(inv.toJSON())))).toEqual([]);
    expect(copy.toJSON()).toEqual(inv.toJSON());
    const problems = copy.load({ slots: [{ item: 'gem', count: 1 }, { item: 'potion', count: 9 }, { item: 'arrow', count: 0 }, null] });
    expect(problems).toHaveLength(4);
    expect(copy.toJSON().slots).toEqual([null, { item: 'potion', count: 5 }, null]);
  });

  it('never loses or invents items under random operations', () => {
    const op = fc.oneof(
      fc.record({ k: fc.constant('add' as const), item: fc.constantFrom('arrow', 'potion', 'sword'), n: fc.integer({ min: 0, max: 30 }) }),
      fc.record({ k: fc.constant('remove' as const), item: fc.constantFrom('arrow', 'potion', 'sword'), n: fc.integer({ min: 0, max: 30 }) }),
      fc.record({ k: fc.constant('move' as const), a: fc.integer({ min: 0, max: 5 }), b: fc.integer({ min: 0, max: 5 }), n: fc.option(fc.integer({ min: 0, max: 25 }), { nil: undefined }) }),
      fc.record({ k: fc.constant('split' as const), a: fc.integer({ min: 0, max: 5 }), n: fc.integer({ min: 0, max: 25 }) }),
    );
    fc.assert(fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
      const inv = createInventory({ items, slots: 5, maxWeight: 12 });
      const held: Record<string, number> = { arrow: 0, potion: 0, sword: 0 };
      for (const o of ops) {
        if (o.k === 'add') held[o.item] = (held[o.item] ?? 0) + o.n - inv.add(o.item, o.n);
        else if (o.k === 'remove') held[o.item] = (held[o.item] ?? 0) - inv.remove(o.item, o.n);
        else if (o.k === 'move') inv.move(o.a, o.b, o.n);
        else inv.split(o.a, o.n);
        for (const id of ['arrow', 'potion', 'sword']) expect(inv.count(id)).toBe(held[id]);
        expect(inv.weight()).toBeLessThanOrEqual(12 + 1e-9);
        for (const s of inv.slots) if (s) expect(s.count).toBeGreaterThan(0);
      }
    }), { numRuns: 200 });
  });
});
