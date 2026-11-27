import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, restoreRng, shuffle, weightedPick } from '../src/random.js';

describe('random: restore and helpers', () => {
  it('restoreRng continues the exact sequence from any point, including before the first draw', () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 0, max: 50 }), (seed, skip) => {
      const a = createRng(seed);
      for (let i = 0; i < skip; i++) a.next();
      const b = restoreRng(a.state());
      expect(b.state()).toBe(a.state());
      for (let i = 0; i < 20; i++) expect(b.next()).toBe(a.next());
      expect(b.int(0, 1000)).toBe(a.int(0, 1000));
    }));
  });

  it('keeps createRng output unchanged (values pinned from the original implementation)', () => {
    const r = createRng(42);
    expect([r.next(), r.next(), r.int(1, 6), r.state()]).toEqual([0.4813160905614495, 0.9852536325342953, 5, 3854165874]);
    const q = createRng(-7);
    expect([q.state(), q.next(), q.range(2, 5)]).toEqual([1640531520, 0.7811260817106813, 3.402188646607101]);
    expect(createRng(42).state()).toBeLessThan(0);
  });

  it('shuffle returns a seeded permutation and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(createRng(3), items), b = shuffle(createRng(3), items);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('weightedPick follows the weights and never picks zero weight', () => {
    const rng = createRng(9), counts = [0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[weightedPick(rng, [1, 0, 3], (w) => w)]! += 1;
    expect(counts[1]).toBe(0);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeGreaterThan(2.5);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeLessThan(3.5);
    expect(weightedPick(rng, [0, 0], (w) => w)).toBe(-1);
  });
});
