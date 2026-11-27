import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGrid, findPath } from '../src/nav.js';
import { createRng } from '../src/random.js';
import { TILE, floodDistances, generateDungeon, type DungeonOptions } from '../src/rooms.js';

const options = fc.record({
  seed: fc.integer(),
  width: fc.integer({ min: 12, max: 70 }),
  height: fc.integer({ min: 12, max: 50 }),
  maxRooms: fc.integer({ min: 1, max: 14 }),
  minSize: fc.integer({ min: 3, max: 5 }),
  extra: fc.integer({ min: 0, max: 5 }),
  margin: fc.integer({ min: 0, max: 3 }),
  loops: fc.double({ min: 0, max: 1, noNaN: true }),
});
const make = (o: { seed: number; width: number; height: number; maxRooms: number; minSize: number; extra: number; margin: number; loops: number }, over: Partial<DungeonOptions> = {}) =>
  generateDungeon({ width: o.width, height: o.height, rng: createRng(o.seed), maxRooms: o.maxRooms, minSize: o.minSize, maxSize: o.minSize + o.extra, margin: o.margin, loops: o.loops, ...over });

describe('rooms', () => {
  it('places rooms inside the border, apart by the margin, within the size range', () => {
    fc.assert(fc.property(options, (o) => {
      const d = make(o);
      expect(d.rooms.length).toBeGreaterThanOrEqual(1);
      expect(d.rooms.length).toBeLessThanOrEqual(o.maxRooms);
      for (const [i, a] of d.rooms.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(1);
        expect(a.y).toBeGreaterThanOrEqual(1);
        expect(a.x + a.w).toBeLessThanOrEqual(o.width - 1);
        expect(a.y + a.h).toBeLessThanOrEqual(o.height - 1);
        expect(a.w).toBeGreaterThanOrEqual(o.minSize);
        expect(a.w).toBeLessThanOrEqual(o.minSize + o.extra);
        for (const b of d.rooms.slice(i + 1)) {
          const apart = a.x + a.w + o.margin <= b.x || b.x + b.w + o.margin <= a.x || a.y + a.h + o.margin <= b.y || b.y + b.h + o.margin <= a.y;
          expect(apart).toBe(true);
        }
      }
    }), { numRuns: 150 });
  });

  it('makes every floor tile reachable from start, keeps the map edge solid and links all rooms', () => {
    fc.assert(fc.property(options, (o) => {
      const d = make(o), dist = floodDistances(d.width, d.height, d.tiles, d.start.x, d.start.y);
      for (let i = 0; i < d.tiles.length; i++) {
        const x = i % d.width, y = Math.floor(i / d.width);
        if (x === 0 || y === 0 || x === d.width - 1 || y === d.height - 1) expect(d.tiles[i]).toBe(TILE.wall);
        if (d.tiles[i] !== TILE.wall) expect(dist[i], `tile ${x},${y}`).toBeGreaterThanOrEqual(0);
      }
      expect(d.links.length).toBeGreaterThanOrEqual(d.rooms.length - 1);
      for (const r of d.rooms) expect(dist[r.cy * d.width + r.cx]).toBeGreaterThanOrEqual(0);
      for (const door of d.doors) {
        expect(d.tiles[door.y * d.width + door.x]).toBe(TILE.door);
        const r = d.rooms[door.room]!;
        const outside = door.x < r.x || door.x >= r.x + r.w || door.y < r.y || door.y >= r.y + r.h;
        const touches = door.x >= r.x - 1 && door.x <= r.x + r.w && door.y >= r.y - 1 && door.y <= r.y + r.h;
        expect(outside && touches).toBe(true);
      }
      expect(dist[d.end.y * d.width + d.end.x]).toBe(Math.max(...d.rooms.map((r) => dist[r.cy * d.width + r.cx]!)));
    }), { numRuns: 150 });
  });

  it('is deterministic per seed and varies across seeds', () => {
    const o = { seed: 77, width: 60, height: 40, maxRooms: 12, minSize: 4, extra: 5, margin: 1, loops: 0.3 };
    const a = make(o), b = make(o), c = make({ ...o, seed: 78 });
    expect(b).toEqual(a);
    expect(Buffer.from(c.tiles).equals(Buffer.from(a.tiles))).toBe(false);
  });

  it('adds loops as asked and stays walkable for the nav module', () => {
    const o = { seed: 5, width: 80, height: 50, maxRooms: 14, minSize: 4, extra: 4, margin: 2, loops: 0 };
    const tree = make(o), loopy = make({ ...o, loops: 1 });
    expect(tree.links).toHaveLength(tree.rooms.length - 1);
    expect(loopy.links.length).toBeGreaterThan(loopy.rooms.length - 1);
    const grid = createGrid(loopy.width, loopy.height, (x, y) => (loopy.tiles[y * loopy.width + x] === TILE.wall ? 0 : 1));
    const path = findPath(grid, loopy.start, loopy.end, { diagonal: false });
    expect(path?.cost).toBe(loopy.distance[loopy.end.y * loopy.width + loopy.end.x]);
  });

  it('throws when not even one room fits', () => {
    expect(() => generateDungeon({ width: 5, height: 20, rng: createRng(1), minSize: 4 })).toThrow(RangeError);
  });
  it('picks start and end as the room centers farthest apart by walking distance (brute force, 50 seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const d = generateDungeon({ width: 60, height: 40, rng: createRng(seed), maxRooms: 12, minSize: 4, maxSize: 8, margin: 1, loops: 0.2 });
      let best = -1;
      for (const a of d.rooms) {
        const f = floodDistances(d.width, d.height, d.tiles, a.cx, a.cy);
        for (const b of d.rooms) best = Math.max(best, f[b.cy * d.width + b.cx]!);
      }
      const fromStart = floodDistances(d.width, d.height, d.tiles, d.start.x, d.start.y);
      expect(fromStart[d.end.y * d.width + d.end.x]).toBe(best);
    }
  });
});
