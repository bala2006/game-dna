import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FlatState } from '@gamedna/core';
import { FixedStepClock, FixedStepSimulation, InputLatch, flag, msToTicks, num, type InputFrame } from '../src/index.js';

class Counter extends FixedStepSimulation {
  presses = 0;
  rolls: number[] = [];
  constructor() {
    super({ 'counter.step': 1 });
  }
  protected onReset(): void {
    this.presses = 0;
    this.rolls = [];
  }
  protected update(input: InputFrame): void {
    if (input.wasPressed('a')) {
      this.presses += num(this.params, 'counter.step', 1);
      this.emit('press', { n: this.presses });
    }
    this.rolls.push(this.rng.int(0, 9));
  }
  snapshot(): FlatState {
    return { presses: this.presses };
  }
}

describe('InputLatch', () => {
  it('reports one press edge per down transition and clears edges after take()', () => {
    const l = new InputLatch();
    l.set('jump', true);
    l.set('jump', true); // repeat while held is not a new press
    const f1 = l.take();
    expect(f1.wasPressed('jump')).toBe(true);
    expect(f1.isDown('jump')).toBe(true);
    const f2 = l.take();
    expect(f2.wasPressed('jump')).toBe(false);
    expect(f2.isDown('jump')).toBe(true);
    l.set('jump', false);
    const f3 = l.take();
    expect(f3.released.has('jump')).toBe(true);
    expect(f3.isDown('jump')).toBe(false);
  });

  it('held keys always equal the last state set per key (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom('a', 'b', 'c'), fc.boolean()), { maxLength: 50 }), (ops) => {
        const l = new InputLatch();
        const expected = new Map<string, boolean>();
        for (const [k, d] of ops) {
          l.set(k, d);
          expected.set(k, d);
        }
        const want = [...expected.entries()].filter(([, d]) => d).map(([k]) => k).sort();
        expect(l.heldKeys()).toEqual(want);
      }),
    );
  });
});

describe('FixedStepClock', () => {
  it('converts elapsed time into whole 60 Hz ticks and carries the remainder', () => {
    const c = new FixedStepClock(60, 5);
    expect(c.advance(10)).toBe(0);
    expect(c.advance(10)).toBe(1); // 20 ms accumulated
    expect(c.advance(1000 / 60)).toBe(1);
  });

  it('never runs more than the per-frame cap (no spiral of death)', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 10_000, noNaN: true }), (ms) => new FixedStepClock(60, 5).advance(ms) <= 5));
  });
});

describe('tuning helpers', () => {
  it('fall back on wrong types and round ms up to ticks', () => {
    expect(num({ a: true }, 'a', 3)).toBe(3);
    expect(num({ a: 7 }, 'a', 3)).toBe(7);
    expect(flag({ a: 1 }, 'a', false)).toBe(false);
    expect(msToTicks(80, 60)).toBe(5);
    expect(msToTicks(0, 60)).toBe(0);
  });
});

describe('FixedStepSimulation', () => {
  it('is deterministic per seed and resets cleanly', () => {
    const run = (seed: number) => {
      const s = new Counter();
      s.reset(seed, { 'counter.step': 2 }, {});
      s.setInput('a', true);
      s.step();
      s.setInput('a', false);
      for (let i = 0; i < 20; i++) s.step();
      return { snap: s.snapshot(), rolls: s.rolls, events: s.drainEvents(), tick: s.currentTick() };
    };
    const a = run(5);
    expect(run(5)).toEqual(a);
    expect(run(6).rolls).not.toEqual(a.rolls);
    expect(a.snap).toEqual({ presses: 2 });
    expect(a.events).toEqual([{ type: 'press', data: { n: 2 } }]);
    expect(a.tick).toBe(21);
  });

  it('drainEvents empties the queue', () => {
    const s = new Counter();
    s.reset(1, {}, {});
    s.setInput('a', true);
    s.step();
    expect(s.drainEvents()).toHaveLength(1);
    expect(s.drainEvents()).toHaveLength(0);
  });
});
