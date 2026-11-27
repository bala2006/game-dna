import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGrid, findPath, flowField, isWalkable, losClear, setCost, smoothPath, type Cell, type Grid } from '../src/nav.js';
import { createRng } from '../src/random.js';

/** Reference shortest-path cost: Dijkstra by linear scan, written independently of nav.ts. */
function bruteCost(g: Grid, s: Cell, t: Cell, diagonal: boolean): number | null {
  const n = g.width * g.height, dist = Array<number>(n).fill(Infinity), done = Array<boolean>(n).fill(false);
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < g.width && y < g.height && (g.cost[y * g.width + x] ?? 0) > 0;
  if (!open(s.x, s.y) || !open(t.x, t.y)) return null;
  dist[s.y * g.width + s.x] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (dist[i] ?? Infinity) < Infinity && (u < 0 || (dist[i] ?? 0) < (dist[u] ?? 0))) u = i;
    if (u < 0) return null;
    if (u === t.y * g.width + t.x) return dist[u] ?? null;
    done[u] = true;
    const ux = u % g.width, uy = Math.floor(u / g.width);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
      const x = ux + dx, y = uy + dy;
      if (!open(x, y)) continue;
      if (dx !== 0 && dy !== 0 && !(open(ux + dx, uy) && open(ux, uy + dy))) continue;
      const v = y * g.width + x, c = (g.cost[v] ?? 0) * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      if ((dist[u] ?? 0) + c < (dist[v] ?? Infinity)) dist[v] = (dist[u] ?? 0) + c;
    }
  }
}

const randomGrid = (seed: number, w: number, h: number, wallRate: number) => {
  const rng = createRng(seed);
  return createGrid(w, h, () => (rng.bool(wallRate) ? 0 : rng.pick([1, 1, 1, 2, 5])));
};

describe('nav', () => {
  it('A* matches a brute-force Dijkstra on random seeded grids', () => {
    fc.assert(fc.property(fc.integer(), fc.boolean(), fc.integer({ min: 3, max: 14 }), fc.integer({ min: 3, max: 14 }), fc.double({ min: 0, max: 0.45, noNaN: true }), (seed, diagonal, w, h, wallRate) => {
      const g = randomGrid(seed, w, h, wallRate), rng = createRng(seed ^ 0x5bd1);
      const s = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) }, t = { x: rng.int(0, w - 1), y: rng.int(0, h - 1) };
      const path = findPath(g, s, t, { diagonal }), ref = bruteCost(g, s, t, diagonal);
      if (ref === null) { expect(path).toBeNull(); return; }
      expect(path).not.toBeNull();
      expect(path!.cost).toBeCloseTo(ref, 9);
      expect(path!.cells[0]).toEqual(s);
      expect(path!.cells.at(-1)).toEqual(t);
      let sum = 0;
      for (let i = 1; i < path!.cells.length; i++) {
        const a = path!.cells[i - 1]!, b = path!.cells[i]!, dx = b.x - a.x, dy = b.y - a.y;
        expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
        if (!diagonal) expect(Math.abs(dx) + Math.abs(dy)).toBe(1);
        expect(isWalkable(g, b.x, b.y)).toBe(true);
        if (dx !== 0 && dy !== 0) expect(isWalkable(g, a.x + dx, a.y) && isWalkable(g, a.x, a.y + dy)).toBe(true);
        sum += g.cost[b.y * w + b.x]! * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      }
      expect(sum).toBeCloseTo(path!.cost, 9);
    }), { numRuns: 300 });
  });

  it('refuses manhattan with diagonals; every other built-in heuristic stays optimal', () => {
    const g = randomGrid(3, 12, 12, 0.25), s = { x: 0, y: 0 }, t = { x: 11, y: 11 };
    expect(() => findPath(g, s, t, { heuristic: 'manhattan' })).toThrow(/manhattan.*diagonal/);
    expect(() => findPath(g, s, t, { heuristic: 'manhattan', diagonal: true })).toThrow(RangeError);
    fc.assert(fc.property(fc.integer(), fc.constantFrom('octile', 'euclidean', 'chebyshev', 'manhattan'), fc.boolean(), (seed, heuristic, diagonal) => {
      if (heuristic === 'manhattan' && diagonal) return;
      const grid = randomGrid(seed, 12, 12, 0.25), rng = createRng(seed ^ 0x77);
      const a = { x: rng.int(0, 11), y: rng.int(0, 11) }, b = { x: rng.int(0, 11), y: rng.int(0, 11) };
      const ref = bruteCost(grid, a, b, diagonal), path = findPath(grid, a, b, { heuristic, diagonal });
      if (ref === null) expect(path).toBeNull();
      else expect(path!.cost).toBeCloseTo(ref, 9);
    }), { numRuns: 400 });
  });

  it('returns null when the goal is walled off, blocked or past maxExpansions', () => {
    const g = createGrid(9, 9);
    for (let y = 0; y < 9; y++) setCost(g, 4, y, 0);
    expect(findPath(g, { x: 0, y: 0 }, { x: 8, y: 8 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
    const open = createGrid(30, 30);
    expect(findPath(open, { x: 0, y: 0 }, { x: 29, y: 29 }, { heuristic: () => 0, maxExpansions: 50 })).toBeNull();
    expect(findPath(open, { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ cells: [{ x: 3, y: 3 }], cost: 0, expanded: 0 });
  });

  it('does not cut corners by default and never squeezes between two blocked cells', () => {
    const g = createGrid(2, 2);
    setCost(g, 1, 0, 0);
    expect(findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 })!.cells).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 }, { cutCorners: true })!.cells).toHaveLength(2);
    setCost(g, 0, 1, 0);
    expect(findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 }, { cutCorners: true })).toBeNull();
    expect(losClear(g, { x: 0, y: 0 }, { x: 1, y: 1 }, { cutCorners: true })).toBe(false);
  });

  it('prefers cheap cells over the straight line when cheaper overall', () => {
    const g = createGrid(5, 3);
    for (let x = 1; x < 4; x++) setCost(g, x, 1, 10);
    const p = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 }, { diagonal: false })!;
    expect(p.cost).toBe(6);
    expect(p.cells.every((c) => c.y !== 1 || c.x === 0 || c.x === 4)).toBe(true);
    expect(() => setCost(g, 0, 0, 0.5)).toThrow(RangeError);
  });

  it('is deterministic and reuses scratch buffers across calls', () => {
    const g = randomGrid(11, 40, 40, 0.25);
    const a = findPath(g, { x: 0, y: 0 }, { x: 39, y: 39 }), b = findPath(g, { x: 0, y: 0 }, { x: 39, y: 39 });
    findPath(g, { x: 5, y: 5 }, { x: 20, y: 30 });
    expect(findPath(g, { x: 0, y: 0 }, { x: 39, y: 39 })).toEqual(a);
    expect(b).toEqual(a);
  });

  it('line of sight follows the supercover rule', () => {
    const g = createGrid(6, 6);
    expect(losClear(g, { x: 0, y: 0 }, { x: 5, y: 3 })).toBe(true);
    setCost(g, 2, 1, 0);
    expect(losClear(g, { x: 0, y: 0 }, { x: 5, y: 3 })).toBe(false);
    expect(losClear(g, { x: 0, y: 5 }, { x: 5, y: 5 })).toBe(true);
    const d = createGrid(3, 3);
    setCost(d, 1, 0, 0);
    expect(losClear(d, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(losClear(d, { x: 0, y: 0 }, { x: 2, y: 2 }, { cutCorners: true })).toBe(true);
  });

  it('smoothPath keeps the ends, drops visible waypoints and every leg stays clear', () => {
    expect(smoothPath(createGrid(10, 10), findPath(createGrid(10, 10), { x: 0, y: 0 }, { x: 9, y: 4 })!.cells)).toEqual([{ x: 0, y: 0 }, { x: 9, y: 4 }]);
    fc.assert(fc.property(fc.integer(), (seed) => {
      const g = randomGrid(seed, 20, 20, 0.3), p = findPath(g, { x: 0, y: 0 }, { x: 19, y: 19 });
      if (!g.cost[0] || !p) return;
      const s = smoothPath(g, p.cells);
      expect(s[0]).toEqual(p.cells[0]);
      expect(s.at(-1)).toEqual(p.cells.at(-1));
      expect(s.length).toBeLessThanOrEqual(p.cells.length);
      for (let i = 1; i < s.length; i++) expect(losClear(g, s[i - 1]!, s[i]!)).toBe(true);
    }), { numRuns: 60 });
  });

  it('flow field directions always descend toward the goal and agree with A* costs', () => {
    fc.assert(fc.property(fc.integer(), fc.boolean(), (seed, diagonal) => {
      const g = randomGrid(seed, 16, 12, 0.3), goal = { x: 8, y: 6 };
      setCost(g, goal.x, goal.y, 1);
      const field = flowField(g, goal, { diagonal });
      expect(field.direction(goal.x, goal.y)).toBeNull();
      for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
        const i = y * 16 + x, d = field.distance[i]!;
        if (!Number.isFinite(d) || i === goal.y * 16 + goal.x) { if (!Number.isFinite(d)) expect(field.direction(x, y)).toBeNull(); continue; }
        const step = field.direction(x, y)!;
        expect(Math.max(Math.abs(step.x), Math.abs(step.y))).toBe(1);
        expect(field.distance[(y + step.y) * 16 + x + step.x]!).toBeLessThan(d);
        if ((x * 7 + y * 3) % 11 === 0) expect(findPath(g, { x, y }, goal, { diagonal })!.cost).toBeCloseTo(d, 9);
      }
    }), { numRuns: 60 });
  });

  it('flows around walls so agents following it reach the goal', () => {
    const g = createGrid(10, 10);
    for (let y = 0; y < 8; y++) setCost(g, 5, y, 0);
    const field = flowField(g, { x: 9, y: 0 });
    let at = { x: 0, y: 0 }, steps = 0;
    while ((at.x !== 9 || at.y !== 0) && steps++ < 100) { const d = field.direction(at.x, at.y)!; at = { x: at.x + d.x, y: at.y + d.y }; }
    expect(at).toEqual({ x: 9, y: 0 });
    expect(steps).toBeLessThan(25);
  });
});
