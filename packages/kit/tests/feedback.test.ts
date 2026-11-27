import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EASINGS, Flash, HitStop, Tween, backOut, createShake, elasticOut, flashLevel, linear } from '../src/feedback.js';

const run = (seed: number, frames: number, dt = 1 / 60) => {
  const s = createShake({ seed, maxOffset: 2, maxAngle: 0.1 });
  s.add(0.8);
  return Array.from({ length: frames }, () => ({ ...s.update(dt) }));
};

describe('shake', () => {
  it('is zero under reduced motion, while trauma still decays', () => {
    const s = createShake({ reducedMotion: true, decay: 2 });
    s.add(1);
    for (let i = 0; i < 15; i++) expect(s.update(1 / 60)).toEqual({ x: 0, y: 0, angle: 0 });
    expect(s.trauma).toBeCloseTo(0.5, 9);
    s.reducedMotion = false;
    const o = s.update(1 / 60);
    expect(Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.angle)).toBeGreaterThan(0);
  });

  it('decays to exactly zero and stays bounded by trauma squared', () => {
    fc.assert(fc.property(fc.integer(), fc.double({ min: 0.05, max: 1, noNaN: true }), (seed, hit) => {
      const s = createShake({ seed, maxOffset: 3, maxAngle: 0.2, decay: 1.5 });
      s.add(hit);
      let before = s.trauma;
      for (let i = 0; i < 90; i++) {
        const o = s.update(1 / 60), k = s.trauma ** 2;
        expect(s.trauma).toBeLessThanOrEqual(before);
        before = s.trauma;
        expect(Math.abs(o.x)).toBeLessThanOrEqual(k * 3 + 1e-12);
        expect(Math.abs(o.y)).toBeLessThanOrEqual(k * 3 + 1e-12);
        expect(Math.abs(o.angle)).toBeLessThanOrEqual(k * 0.2 + 1e-12);
      }
      expect(s.trauma).toBe(0);
      expect(s.update(1 / 60)).toEqual({ x: 0, y: 0, angle: 0 });
    }));
  });

  it('repeats exactly for a seed and differs between seeds', () => {
    expect(run(7, 40)).toEqual(run(7, 40));
    expect(run(7, 40)).not.toEqual(run(8, 40));
  });

  it('moves smoothly from frame to frame', () => {
    const frames = run(3, 30, 1 / 240);
    for (let i = 1; i < frames.length; i++) expect(Math.abs((frames[i]?.x ?? 0) - (frames[i - 1]?.x ?? 0))).toBeLessThan(0.5);
  });

  it('clamps trauma to [0, 1]', () => {
    const s = createShake();
    s.add(3);
    expect(s.trauma).toBe(1);
    s.add(-5);
    expect(s.trauma).toBe(0);
  });
});

describe('hit stop', () => {
  it('lets the longest request win without stacking', () => {
    const h = new HitStop(10);
    h.request(3);
    h.request(5);
    h.request(2);
    expect(h.remaining).toBe(5);
    let frozen = 0;
    while (h.consume()) frozen++;
    expect(frozen).toBe(5);
    expect(h.active).toBe(false);
  });

  it('caps one request and any run of frozen ticks at cap', () => {
    const h = new HitStop(6);
    h.request(100);
    expect(h.remaining).toBe(6);
    fc.assert(fc.property(fc.array(fc.option(fc.integer({ min: -3, max: 40 }), { nil: undefined }), { maxLength: 300 }), (ops) => {
      const hs = new HitStop(6);
      let run = 0, longest = 0;
      for (const op of ops) {
        if (op !== undefined) hs.request(op);
        if (hs.consume()) { run++; longest = Math.max(longest, run); } else run = 0;
      }
      expect(longest).toBeLessThanOrEqual(6);
    }));
  });

  it('ignores zero, negative and non-finite requests', () => {
    const h = new HitStop();
    for (const t of [0, -4, NaN, Infinity]) h.request(t);
    expect(h.consume()).toBe(false);
    h.request(2.9);
    expect(h.remaining).toBe(2);
    h.clear();
    expect(h.active).toBe(false);
  });
});

describe('flash', () => {
  it('starts at 1, eases down to 0 and is never cut short by a shorter trigger', () => {
    const f = new Flash();
    expect(f.intensity).toBe(0);
    f.trigger(6);
    expect(f.intensity).toBe(1);
    let last = 1;
    for (let i = 0; i < 6; i++) {
      if (i === 2) f.trigger(1);
      f.update(1);
      expect(f.intensity).toBeLessThanOrEqual(last);
      last = f.intensity;
    }
    expect(f.intensity).toBe(0);
    expect(f.active).toBe(false);
  });

  it('reads plain-data tick timers', () => {
    expect(flashLevel(4, 4)).toBe(1);
    expect(flashLevel(0, 4)).toBe(0);
    expect(flashLevel(2, 4, linear)).toBeCloseTo(0.5, 9);
    expect(flashLevel(3, 0)).toBe(0);
  });
});

describe('easing and tween', () => {
  it.each(Object.entries(EASINGS))('%s runs from 0 to 1', (_name, e) => {
    expect(e(0)).toBeCloseTo(0, 9);
    expect(e(1)).toBeCloseTo(1, 9);
  });

  it('overshoots with backOut and elasticOut', () => {
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => backOut(i / 100)))).toBeGreaterThan(1.05);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => elasticOut(i / 100)))).toBeGreaterThan(1.05);
  });

  it('tweens a number to its target in exactly the duration', () => {
    const t = new Tween(2).to(10, 0.5, linear);
    expect(t.done).toBe(false);
    for (let i = 0; i < 5; i++) t.update(0.05);
    expect(t.value).toBeCloseTo(6, 9);
    for (let i = 0; i < 5; i++) t.update(0.05);
    expect(t.value).toBe(10);
    const secs = new Flash(linear);
    secs.trigger(0.3);
    for (let i = 0; i < 6; i++) secs.update(0.05);
    expect(secs.active).toBe(false);
    expect(t.done).toBe(true);
    t.to(4, 0);
    expect(t.value).toBe(4);
    t.to(0, 1).update(0.25);
    t.set(-1);
    expect(t.update(1)).toBe(-1);
    expect(t.target).toBe(-1);
  });
});
