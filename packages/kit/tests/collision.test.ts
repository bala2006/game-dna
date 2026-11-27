import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SpatialHash, aabbOverlap, circleAabbOverlap, circleOverlap, circleVsAabb, circleVsCircle, createTileMove, moveAndCollideTiles,
  overlapsTiles, pushCircleOutOfBox, rayVsAabb, segmentVsCircle, type Aabb, type OrientedBox, type TileSolid,
} from '../src/collision.js';

const v = () => ({ x: 0, y: 0 });
const xz = () => ({ x: 0, z: 0 });

describe('overlap tests', () => {
  const a: Aabb = { x: 0, y: 0, w: 10, h: 10 };
  it('treats touching boxes as apart and shared area as overlap', () => {
    expect(aabbOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(aabbOverlap(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(aabbOverlap(a, { x: 0, y: -5, w: 5, h: 5 })).toBe(false);
    expect(aabbOverlap(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it('treats a zero-size box as a point: inside overlaps, on an edge does not', () => {
    expect(aabbOverlap(a, { x: 5, y: 5, w: 0, h: 0 })).toBe(true);
    expect(aabbOverlap(a, { x: 10, y: 5, w: 0, h: 0 })).toBe(false);
    expect(circleAabbOverlap({ x: 5, y: 5, r: 0 }, a)).toBe(true);
    expect(circleAabbOverlap({ x: 0, y: 5, r: 0 }, a)).toBe(false);
  });
  it('compares circles by the sum of radii, strictly', () => {
    expect(circleOverlap({ x: 0, y: 0, r: 1 }, { x: 2, y: 0, r: 1 })).toBe(false);
    expect(circleOverlap({ x: 0, y: 0, r: 1 }, { x: 1.99, y: 0, r: 1 })).toBe(true);
    expect(circleOverlap({ x: 3, y: 3, r: 0 }, { x: 3, y: 3, r: 0 })).toBe(false);
    expect(circleAabbOverlap({ x: 13, y: 14, r: 5 }, a)).toBe(false);
    expect(circleAabbOverlap({ x: 13, y: 13.9, r: 5 }, a)).toBe(true);
  });
});

describe('push-outs', () => {
  const box: Aabb = { x: 0, y: 0, w: 10, h: 4 };
  it('pushes a circle off a box corner to exactly touching', () => {
    const out = v();
    expect(circleVsAabb(11, 5, 2, box, out)).toBe(true);
    expect(Math.hypot(out.x - 10, out.y - 4)).toBeCloseTo(2, 12);
    expect(circleVsAabb(out.x, out.y, 2, box, v())).toBe(false);
    expect(circleVsAabb(13, 2, 2, box, out)).toBe(false);
    expect(out).toEqual({ x: 13, y: 2 });
  });
  it('moves a center inside the box out through the nearest side', () => {
    const out = v();
    expect(circleVsAabb(5, 1, 1, box, out)).toBe(true);
    expect(out).toEqual({ x: 5, y: -1 });
    expect(circleVsAabb(9, 2.5, 0.5, box, out)).toBe(true);
    expect(out).toEqual({ x: 10.5, y: 2.5 });
    expect(circleVsAabb(10, 2, 0, box, out)).toBe(false);
    expect(circleVsAabb(3, 3, 1, { x: 3, y: 3, w: 0, h: 0 }, out)).toBe(true);
    expect(out).toEqual({ x: 2, y: 3 });
  });
  it('pushes one circle out of another and leaves coincident centers alone', () => {
    const out = v();
    expect(circleVsCircle(1, 0, 1, 0, 0, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(2, 12);
    expect(out.y).toBe(0);
    expect(circleVsCircle(2, 0, 1, 0, 0, 1, out)).toBe(false);
    expect(circleVsCircle(0, 0, 1, 0, 0, 1, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('pushes a circle out of a turned box on the ground plane', () => {
    const b: OrientedBox = { x: 4, z: -2, hx: 1, hz: 2, yaw: 0 }, out = xz();
    expect(pushCircleOutOfBox(5.2, -2, 0.3, b, out)).toBe(true);
    expect(out.x).toBeCloseTo(5.3, 12);
    expect(out.z).toBe(-2);
    expect(pushCircleOutOfBox(4.5, -2, 0.3, b, out)).toBe(true);
    expect(out.x).toBeCloseTo(5.3, 12);
    expect(pushCircleOutOfBox(4, -2 + 1.9, 0.3, b, out)).toBe(true);
    expect(out.z).toBeCloseTo(0.3, 12);
    expect(pushCircleOutOfBox(9, 9, 0.3, b, out)).toBe(false);
    expect(out).toEqual({ x: 9, z: 9 });
    // Yaw is a heading: a quarter turn lays the long side along +X.
    expect(pushCircleOutOfBox(4 + 1.9, -2, 0.3, { ...b, yaw: Math.PI / 2 }, out)).toBe(true);
    expect(out.x).toBeCloseTo(4 + 2.3, 12);
  });

  it('always leaves a circle at least its radius from a turned box', () => {
    const dist = (x: number, z: number, b: OrientedBox) => {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz));
    };
    const num = (m: number) => fc.double({ min: -m, max: m, noNaN: true });
    fc.assert(fc.property(num(6), num(6), fc.double({ min: 0.01, max: 2, noNaN: true }), num(4), fc.double({ min: 0.1, max: 3, noNaN: true }), fc.double({ min: 0.1, max: 3, noNaN: true }), (x, z, r, yaw, hx, hz) => {
      const b = { x: 0.5, z: -0.25, hx, hz, yaw }, out = xz(), moved = pushCircleOutOfBox(x, z, r, b, out);
      expect(dist(out.x, out.z, b)).toBeGreaterThan(r - 1e-9);
      if (!moved) expect(out).toEqual({ x, z });
    }));
  });
});

describe('casts', () => {
  const box: Aabb = { x: 10, y: -2, w: 4, h: 4 };
  it('returns the distance along a ray to a box, whatever the direction length', () => {
    expect(rayVsAabb(0, 0, 1, 0, box)).toBe(10);
    expect(rayVsAabb(0, 0, 25, 0, box)).toBe(10);
    expect(rayVsAabb(20, 0, -3, 0, box)).toBe(6);
    expect(rayVsAabb(0, 0, -1, 0, box)).toBe(-1);
    expect(rayVsAabb(0, 0, 1, 0, box, 9)).toBe(-1);
    expect(rayVsAabb(12, 0, 0, 1, box)).toBe(0);
    expect(rayVsAabb(0, 0, 0, 0, box)).toBe(-1);
    expect(rayVsAabb(10, 2, 0, 0, box)).toBe(0);
    expect(rayVsAabb(0, 12, 1, -1, box)).toBeCloseTo(Math.SQRT2 * 10, 12);
    expect(rayVsAabb(0, 4, 1, -1, box)).toBe(-1);
  });
  it('counts a ray along an edge as a hit and one beside it as a miss', () => {
    expect(rayVsAabb(0, 2, 1, 0, box)).toBe(10);
    expect(rayVsAabb(0, 2.0001, 1, 0, box)).toBe(-1);
    expect(rayVsAabb(12, -10, 0, 1, box)).toBe(8);
  });
  it('returns the distance along a segment to a circle', () => {
    const c = { x: 5, y: 0, r: 1 };
    expect(segmentVsCircle(0, 0, 10, 0, c)).toBeCloseTo(4, 12);
    expect(segmentVsCircle(10, 0, 0, 0, c)).toBeCloseTo(4, 12);
    expect(segmentVsCircle(0, 0, 3.9, 0, c)).toBe(-1);
    expect(segmentVsCircle(0, 0, -10, 0, c)).toBe(-1);
    expect(segmentVsCircle(5, 0.5, 20, 9, c)).toBe(0);
    expect(segmentVsCircle(0, 1, 10, 1, c)).toBeCloseTo(5, 6);
    expect(segmentVsCircle(0, 1.01, 10, 1.01, c)).toBe(-1);
    expect(segmentVsCircle(3, 3, 3, 3, c)).toBe(-1);
  });
  it('agrees with dense sampling along random segments', () => {
    const num = fc.double({ min: -20, max: 20, noNaN: true });
    fc.assert(fc.property(num, num, num, num, fc.double({ min: 0.2, max: 6, noNaN: true }), (ax, ay, bx, by, r) => {
      const c = { x: 1, y: -2, r }, d = segmentVsCircle(ax, ay, bx, by, c), len = Math.hypot(bx - ax, by - ay);
      let first = -1;
      for (let i = 0; i <= 2000 && len > 0; i++) {
        const t = (i / 2000) * len, x = ax + ((bx - ax) / len) * t, y = ay + ((by - ay) / len) * t;
        if (Math.hypot(x - c.x, y - c.y) <= r) { first = t; break; }
      }
      if (first >= 0) expect(Math.abs(d - first)).toBeLessThan(len / 2000 + 1e-6);
      else if (d >= 0) expect(Math.hypot(ax + ((bx - ax) / len) * d - c.x, ay + ((by - ay) / len) * d - c.y)).toBeCloseTo(r, 6);
    }));
  });
});

/** Gravity Shift's original single-step mover, kept here as the reference the Kit must match. */
function referenceMove(b: Aabb, dx: number, dy: number, solid: TileSolid, T: number) {
  const hit = (x: number, y: number) => {
    for (let r = Math.floor(y / T); r <= Math.floor((y + b.h - 0.001) / T); r++)
      for (let c = Math.floor(x / T); c <= Math.floor((x + b.w - 0.001) / T); c++) if (solid(c, r)) return true;
    return false;
  };
  let x = b.x + dx, y = b.y, hx = 0, hy = 0;
  if (hit(x, y)) { if (dx > 0) { x = Math.floor((x + b.w) / T) * T - b.w; hx = 1; } else if (dx < 0) { x = (Math.floor(x / T) + 1) * T; hx = -1; } }
  y += dy;
  if (hit(x, y)) { if (dy > 0) { y = Math.floor((y + b.h) / T) * T - b.h; hy = 1; } else if (dy < 0) { y = (Math.floor(y / T) + 1) * T; hy = -1; } }
  return { x, y, hx, hy };
}

describe('tile mover', () => {
  const T = 32;
  // A 12 x 8 room: walls all round, a pillar at column 6, rows 4 to 6.
  const room: TileSolid = (c, r) => c <= 0 || c >= 11 || r <= 0 || r >= 7 || (c === 6 && r >= 4);
  const body = (x: number, y: number): Aabb => ({ x, y, w: 20, h: 26 });

  it('stops flush against walls, floors and ceilings and flags the side', () => {
    const m = createTileMove();
    moveAndCollideTiles(body(160, 7 * T - 26), 20, 0, room, T, m);
    expect(m).toMatchObject({ x: 6 * T - 20, right: true, left: false });
    moveAndCollideTiles(body(7 * T + 5, 7 * T - 26), -20, 0, room, T, m);
    expect(m).toMatchObject({ x: 7 * T, left: true, right: false });
    moveAndCollideTiles(body(40, 7 * T - 30), 0, 10, room, T, m);
    expect(m).toMatchObject({ y: 7 * T - 26, bottom: true, top: false });
    moveAndCollideTiles(body(40, T + 3), 0, -10, room, T, m);
    expect(m).toMatchObject({ y: T, top: true, bottom: false });
  });

  it('slides along a surface it only touches', () => {
    const m = createTileMove();
    moveAndCollideTiles(body(40, 7 * T - 26), 3, 0, room, T, m);
    expect(m).toEqual({ x: 43, y: 7 * T - 26, left: false, right: false, top: false, bottom: false });
    expect(overlapsTiles(6 * T - 20, 7 * T - 26, 20, 26, room, T)).toBe(false);
    expect(overlapsTiles(6 * T - 19.9, 7 * T - 26, 20, 26, room, T)).toBe(true);
  });

  it('treats a zero-size box as a point in the tile that contains it', () => {
    const m = createTileMove();
    expect(overlapsTiles(T, T, 0, 0, room, T)).toBe(false);
    expect(overlapsTiles(T - 0.5, T, 0, 0, room, T)).toBe(true);
    moveAndCollideTiles({ x: 40, y: 40, w: 0, h: 0 }, -20, 0, room, T, m);
    expect(m).toMatchObject({ x: T, left: true });
  });

  it('does not tunnel through a one-tile wall or floor at any speed', () => {
    const m = createTileMove();
    moveAndCollideTiles(body(40, 7 * T - 26), 10 * T, 0, room, T, m);
    expect(m).toMatchObject({ x: 6 * T - 20, right: true });
    moveAndCollideTiles(body(40, 2 * T), 0, 50 * T, room, T, m);
    expect(m).toMatchObject({ y: 7 * T - 26, bottom: true });
    const cell: TileSolid = (c, r) => c <= 0 || c >= 6 || r <= 0 || r >= 7;
    fc.assert(fc.property(fc.double({ min: 32, max: 172, noNaN: true }), fc.double({ min: 32, max: 7 * T - 26, noNaN: true }), fc.double({ min: -20 * T, max: 20 * T, noNaN: true }), fc.double({ min: -20 * T, max: 20 * T, noNaN: true }), (x, y, dx, dy) => {
      moveAndCollideTiles(body(x, y), dx, dy, cell, T, m);
      // Edges may end up to the 0.001 skin inside a tile: that counts as touching.
      expect(overlapsTiles(m.x, m.y, 20, 26, cell, T)).toBe(false);
      expect(m.x + 20).toBeLessThanOrEqual(6 * T + 0.001 + 1e-9);
      expect(m.x).toBeGreaterThanOrEqual(T);
      expect(m.y).toBeGreaterThanOrEqual(T);
      expect(m.y + 26).toBeLessThanOrEqual(7 * T + 0.001 + 1e-9);
    }), { numRuns: 300 });
  });

  it('matches the single-step reference exactly when x moves at most half a tile and y under one tile (Gravity Shift range)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 31 }), fc.double({ min: 33, max: 320, noNaN: true }), fc.double({ min: 33, max: 200, noNaN: true }), fc.double({ min: -0.5 * T, max: 0.5 * T, noNaN: true }), fc.double({ min: -0.9 * T, max: 0.9 * T, noNaN: true }), (seed, x, y, dx, dy) => {
      const solid: TileSolid = (c, r) => c <= 0 || c >= 11 || r <= 0 || r >= 7 || ((Math.imul(c * 73856093 ^ r * 19349663, seed | 1) >>> 0) % 5 === 0);
      fc.pre(!overlapsTiles(x, y, 20, 26, solid, T));
      const ref = referenceMove(body(x, y), dx, dy, solid, T), m = moveAndCollideTiles(body(x, y), dx, dy, solid, T, createTileMove());
      expect(m.x).toBe(ref.x);
      expect(m.y).toBe(ref.y);
      expect(m.right ? 1 : m.left ? -1 : 0).toBe(ref.hx);
      expect(m.bottom ? 1 : m.top ? -1 : 0).toBe(ref.hy);
    }), { numRuns: 500 });
  });

  it('stops a fast diagonal move at a lone tile instead of stepping around it (review case)', () => {
    const pillar: TileSolid = (c, r) => c === 1 && r === 1, m = createTileMove();
    moveAndCollideTiles({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 2, 2, pillar, 1, m);
    expect(m).toEqual({ x: 2.25, y: 0.5, left: false, right: false, top: false, bottom: true });
    moveAndCollideTiles({ x: 2.25, y: 2.25, w: 0.5, h: 0.5 }, -2, -2, pillar, 1, m);
    expect(m).toEqual({ x: 0.25, y: 2, left: false, right: false, top: true, bottom: false });
    moveAndCollideTiles({ x: 2.25, y: 0.25, w: 0.5, h: 0.5 }, -2, 2, pillar, 1, m);
    expect(m).toEqual({ x: 0.25, y: 0.5, left: false, right: false, top: false, bottom: true });
  });

  it('never passes a lone tile on a move aimed through its center, at any angle and speed', () => {
    const pillar: TileSolid = (c, r) => c === 5 && r === 5, m = createTileMove(), b = 0.5;
    fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: 1.6, max: 4, noNaN: true }), fc.double({ min: 0.1, max: 3, noNaN: true }), (angle, dist, beyond) => {
      const ux = Math.cos(angle), uy = Math.sin(angle), x = 5.5 + ux * dist - b / 2, y = 5.5 + uy * dist - b / 2;
      moveAndCollideTiles({ x, y, w: b, h: b }, -ux * (dist + beyond), -uy * (dist + beyond), pillar, 1, m);
      expect(m.left || m.right || m.top || m.bottom).toBe(true);
      expect(overlapsTiles(m.x, m.y, b, b, pillar, 1)).toBe(false);
      if (m.right) expect(m.x + b).toBeLessThanOrEqual(5 + 1e-9);
      if (m.left) expect(m.x).toBeGreaterThanOrEqual(6 - 1e-9);
      if (m.bottom) expect(m.y + b).toBeLessThanOrEqual(5 + 1e-9);
      if (m.top) expect(m.y).toBeGreaterThanOrEqual(6 - 1e-9);
    }), { numRuns: 500 });
  });

  it('refuses a non-finite move instead of looping', () => {
    expect(() => moveAndCollideTiles(body(40, 40), Infinity, 0, room, T, createTileMove())).toThrow(RangeError);
  });
});

describe('spatial hash', () => {
  const box = fc.record({ x: fc.double({ min: -300, max: 300, noNaN: true }), y: fc.double({ min: -300, max: 300, noNaN: true }), w: fc.double({ min: 0, max: 80, noNaN: true }), h: fc.double({ min: 0, max: 80, noNaN: true }) });
  const sorted = (a: number[]) => [...a].sort((p, q) => p - q);

  it('returns exactly what a brute-force scan returns, for boxes and radii', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 64, noNaN: true }), fc.array(box, { maxLength: 60 }), fc.array(box, { minLength: 1, maxLength: 8 }), (cell, items, queries) => {
      const hash = new SpatialHash(cell), out: number[] = [];
      items.forEach((b, i) => hash.insert(i, b.x, b.y, b.w, b.h));
      expect(hash.size).toBe(items.length);
      for (const q of queries) {
        const brute = items.flatMap((b, i) => (aabbOverlap(b, q) ? [i] : []));
        expect(sorted(hash.query(q.x, q.y, q.w, q.h, out))).toEqual(brute);
        const c = { x: q.x, y: q.y, r: q.w };
        expect(sorted(hash.queryRadius(c.x, c.y, c.r, out))).toEqual(items.flatMap((b, i) => (circleAabbOverlap(c, b) ? [i] : [])));
      }
    }), { numRuns: 200 });
  });

  it('reports a multi-cell item once, forgets everything on clear, and reuses its buckets', () => {
    const hash = new SpatialHash(10);
    hash.insert(7, -25, -25, 50, 50);
    hash.insert(8, 100, 100, 1, 1);
    expect(hash.query(-30, -30, 60, 60)).toEqual([7]);
    expect(hash.queryRadius(100.5, 100.5, 0.1)).toEqual([8]);
    hash.clear();
    expect(hash.size).toBe(0);
    expect(hash.query(-30, -30, 200, 200)).toEqual([]);
    hash.insert(3, 0, 0, 5, 5);
    expect(hash.query(4, 4, 1, 1)).toEqual([3]);
    expect(hash.query(5, 0, 1, 1)).toEqual([]);
  });

  it('keeps memory bounded by occupied cells while an item travels across 50,000 cells', () => {
    const hash = new SpatialHash(10), out: number[] = [];
    let most = 0;
    for (let i = 0; i < 50_000; i++) {
      hash.clear();
      hash.insert(1, i * 10 + 2, -3, 5, 5);
      most = Math.max(most, hash.cellCount);
      if (i % 9973 === 0) expect(hash.query(i * 10, -5, 10, 10, out)).toEqual([1]);
    }
    expect(most).toBeLessThanOrEqual(4);
    hash.clear();
    expect(hash.cellCount).toBeLessThanOrEqual(2);
    hash.clear();
    expect(hash.cellCount).toBe(0);
    // Steady use keeps its buckets: same cells every rebuild, same count.
    for (let i = 0; i < 3; i++) { hash.clear(); hash.insert(1, 0, 0, 25, 5); hash.insert(2, 3, 3, 1, 1); }
    expect(hash.cellCount).toBe(3);
    expect(hash.query(0, 0, 30, 10).sort()).toEqual([1, 2]);
  });
});
