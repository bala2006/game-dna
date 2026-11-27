/**
 * Grid navigation: A* paths, line of sight, path smoothing and flow fields for many agents.
 *
 * Units: cells. Cell (x, y) has index `y * width + x`; its center is (x + 0.5, y + 0.5).
 * Each cell has a cost to enter it: 0 is blocked, walkable cells cost at least 1, so a step costs
 * `cost` (orthogonal) or `cost * √2` (diagonal). The octile, euclidean and chebyshev heuristics never
 * overestimate that; manhattan never overestimates on 4-way grids but does once diagonals are on
 * (a √2 step lowers it by 2), so `findPath` throws for manhattan with diagonals. Paths are therefore
 * optimal. Diagonal steps never pass between two blocked cells, and by default not past one either
 * (no corner cutting).
 * Search uses typed arrays, an indexed binary heap and per-grid scratch buffers reused across
 * calls, so it allocates only the returned path. Neighbor order and heap ties are fixed, so the
 * same grid and endpoints always give the same path.
 */

/** Integer cell coordinates. */
export interface Cell { x: number; y: number }

/** A navigation grid. Change costs with `setCost` so they stay valid. */
export interface Grid {
  readonly width: number;
  readonly height: number;
  /** Cost to enter each cell, row-major. 0 means blocked. */
  readonly cost: Float64Array;
}

/** Distance estimate from absolute cell offsets; a custom one must be consistent and never overestimate. */
export type Heuristic = 'octile' | 'manhattan' | 'euclidean' | 'chebyshev' | ((dx: number, dy: number) => number);

/** Options for `findPath`. */
export interface PathOptions {
  /** Allow 8-way moves (default true). */
  diagonal?: boolean;
  /** Allow a diagonal step past one blocked side cell (default false). */
  cutCorners?: boolean;
  /**
   * Default: octile with diagonals, manhattan without. Must not overestimate a step of cost 1 or √2,
   * so 'manhattan' with `diagonal` on throws a RangeError.
   */
  heuristic?: Heuristic;
  /** Give up and return null after expanding this many cells (default: no limit). */
  maxExpansions?: number;
}

/** A found path. */
export interface GridPath {
  /** Cells from start to goal, both included. */
  cells: Cell[];
  /** Sum of step costs. */
  cost: number;
  /** Cells expanded by the search. */
  expanded: number;
}

const SQRT2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, -1, 1, -1] as const;
const DY = [0, 0, 1, -1, 1, 1, -1, -1] as const;

function checkCost(c: number): number {
  if (!(c === 0 || (c >= 1 && Number.isFinite(c)))) throw new RangeError(`cell cost ${c} must be 0 (blocked) or a finite number >= 1`);
  return c;
}

/** A grid where every cell costs `cost` (a number or a function of the cell; default 1). */
export function createGrid(width: number, height: number, cost: number | ((x: number, y: number) => number) = 1): Grid {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('grid size must be positive integers');
  const data = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = checkCost(typeof cost === 'number' ? cost : cost(x, y));
  return { width, height, cost: data };
}

/** True when (x, y) lies on the grid. */
export const inBounds = (g: Grid, x: number, y: number): boolean => x >= 0 && y >= 0 && x < g.width && y < g.height && Number.isInteger(x) && Number.isInteger(y);

/** True when (x, y) is on the grid and not blocked. */
export const isWalkable = (g: Grid, x: number, y: number): boolean => inBounds(g, x, y) && g.cost[y * g.width + x]! > 0;

/** Walkable test for integer coordinates (hot loops). */
const open = (g: Grid, x: number, y: number): boolean => x >= 0 && y >= 0 && x < g.width && y < g.height && g.cost[y * g.width + x]! > 0;

/** Sets the cost to enter (x, y): 0 blocks it. Throws for costs between 0 and 1 or off-grid cells. */
export function setCost(g: Grid, x: number, y: number, cost: number): void {
  if (!inBounds(g, x, y)) throw new RangeError(`cell ${x},${y} is off the grid`);
  g.cost[y * g.width + x] = checkCost(cost);
}

const HEURISTICS = {
  octile: (dx: number, dy: number) => dx + dy + (SQRT2 - 2) * Math.min(dx, dy),
  manhattan: (dx: number, dy: number) => dx + dy,
  euclidean: (dx: number, dy: number) => Math.hypot(dx, dy),
  chebyshev: (dx: number, dy: number) => Math.max(dx, dy),
};

/** Binary min-heap of cell indices keyed by `f`, ties by `h` then index. Supports decrease-key. */
class IndexHeap {
  readonly items: Int32Array;
  readonly pos: Int32Array;
  size = 0;
  constructor(n: number, readonly f: Float64Array, readonly h: Float64Array | null) {
    this.items = new Int32Array(n);
    this.pos = new Int32Array(n);
  }
  private less(a: number, b: number): boolean {
    const fa = this.f[a]!, fb = this.f[b]!;
    if (fa !== fb) return fa < fb;
    const ha = this.h ? this.h[a]! : 0, hb = this.h ? this.h[b]! : 0;
    return ha !== hb ? ha < hb : a < b;
  }
  private place(i: number, at: number): void { this.items[at] = i; this.pos[i] = at; }
  private up(at: number): void {
    const i = this.items[at]!;
    while (at > 0) {
      const parent = (at - 1) >> 1, p = this.items[parent]!;
      if (!this.less(i, p)) break;
      this.place(p, at);
      at = parent;
    }
    this.place(i, at);
  }
  private down(at: number): void {
    const i = this.items[at]!, n = this.size;
    for (;;) {
      const l = 2 * at + 1;
      if (l >= n) break;
      const r = l + 1, c = r < n && this.less(this.items[r]!, this.items[l]!) ? r : l, ci = this.items[c]!;
      if (!this.less(ci, i)) break;
      this.place(ci, at);
      at = c;
    }
    this.place(i, at);
  }
  push(i: number): void { this.place(i, this.size++); this.up(this.size - 1); }
  decrease(i: number): void { this.up(this.pos[i]!); }
  pop(): number {
    const top = this.items[0]!, last = this.items[--this.size]!;
    if (this.size > 0) { this.place(last, 0); this.down(0); }
    return top;
  }
}

interface Scratch { gen: number; seen: Uint32Array; closed: Uint32Array; g: Float64Array; f: Float64Array; h: Float64Array; parent: Int32Array; heap: IndexHeap }
const scratches = new WeakMap<Grid, Scratch>();

function scratchFor(grid: Grid): Scratch {
  let s = scratches.get(grid);
  const n = grid.width * grid.height;
  if (!s || s.g.length !== n) {
    const f = new Float64Array(n), h = new Float64Array(n);
    s = { gen: 0, seen: new Uint32Array(n), closed: new Uint32Array(n), g: new Float64Array(n), f, h, parent: new Int32Array(n), heap: new IndexHeap(n, f, h) };
    scratches.set(grid, s);
  }
  if (++s.gen > 0xfffffffe) { s.seen.fill(0); s.closed.fill(0); s.gen = 1; }
  s.heap.size = 0;
  return s;
}

/** Whether the diagonal step from (x, y) by (dx, dy) may pass its two side cells. */
function cornerOk(grid: Grid, x: number, y: number, dx: number, dy: number, cutCorners: boolean): boolean {
  const a = open(grid, x + dx, y), b = open(grid, x, y + dy);
  return cutCorners ? a || b : a && b;
}

/**
 * Optimal path from `start` to `goal` with A*, or null when the goal is blocked, unreachable or beyond `maxExpansions`.
 * Throws a RangeError for `heuristic: 'manhattan'` with diagonal moves, which would give non-optimal paths.
 */
export function findPath(grid: Grid, start: Cell, goal: Cell, options: PathOptions = {}): GridPath | null {
  const { diagonal = true, cutCorners = false, maxExpansions = Infinity } = options;
  const heuristic = options.heuristic ?? (diagonal ? 'octile' : 'manhattan');
  if (diagonal && heuristic === 'manhattan') throw new RangeError("heuristic 'manhattan' overestimates diagonal steps; use 'octile' or set diagonal: false");
  const hf = typeof heuristic === 'function' ? heuristic : HEURISTICS[heuristic];
  if (!isWalkable(grid, start.x, start.y) || !isWalkable(grid, goal.x, goal.y)) return null;
  const w = grid.width, cost = grid.cost, s = scratchFor(grid), { gen, seen, closed, g, f, h, parent, heap } = s;
  const si = start.y * w + start.x, gi = goal.y * w + goal.x, dirs = diagonal ? 8 : 4;
  seen[si] = gen; g[si] = 0; parent[si] = -1;
  h[si] = hf(Math.abs(goal.x - start.x), Math.abs(goal.y - start.y));
  f[si] = h[si]!;
  heap.push(si);
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === gi) {
      const cells: Cell[] = [];
      for (let i = gi; i !== -1; i = parent[i]!) cells.push({ x: i % w, y: (i - (i % w)) / w });
      return { cells: cells.reverse(), cost: g[gi]!, expanded };
    }
    closed[cur] = gen;
    if (++expanded > maxExpansions) return null;
    const cx = cur % w, cy = (cur - cx) / w, gc = g[cur]!;
    for (let k = 0; k < dirs; k++) {
      const dx = DX[k]!, dy = DY[k]!, nx = cx + dx, ny = cy + dy;
      if (!open(grid, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed[ni] === gen || (k >= 4 && !cornerOk(grid, cx, cy, dx, dy, cutCorners))) continue;
      const ng = gc + (k < 4 ? cost[ni]! : cost[ni]! * SQRT2);
      if (seen[ni] !== gen) {
        seen[ni] = gen; g[ni] = ng; parent[ni] = cur;
        h[ni] = hf(Math.abs(goal.x - nx), Math.abs(goal.y - ny));
        f[ni] = ng + h[ni]!;
        heap.push(ni);
      } else if (ng < g[ni]!) {
        g[ni] = ng; parent[ni] = cur; f[ni] = ng + h[ni]!;
        heap.decrease(ni);
      }
    }
  }
  return null;
}

/**
 * True when the straight line between the centers of `a` and `b` crosses only walkable cells
 * (supercover traversal). Where the line passes exactly through a cell corner, the two side cells
 * follow the same corner rule as diagonal steps.
 */
export function losClear(grid: Grid, a: Cell, b: Cell, { cutCorners = false }: { cutCorners?: boolean } = {}): boolean {
  let x = a.x, y = a.y;
  if (!isWalkable(grid, x, y)) return false;
  const nx = Math.abs(b.x - a.x), ny = Math.abs(b.y - a.y), sx = Math.sign(b.x - a.x), sy = Math.sign(b.y - a.y);
  for (let ix = 0, iy = 0; ix < nx || iy < ny;) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (!cornerOk(grid, x, y, sx, sy, cutCorners)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; } else { y += sy; iy++; }
    if (!open(grid, x, y)) return false;
  }
  return true;
}

/** Drops waypoints that line of sight can skip (string pulling). Keeps both ends. Ignores cost differences. */
export function smoothPath(grid: Grid, cells: readonly Cell[], options: { cutCorners?: boolean } = {}): Cell[] {
  if (cells.length <= 2) return cells.slice();
  const out: Cell[] = [cells[0] as Cell];
  let anchor = cells[0] as Cell;
  for (let i = 1; i < cells.length - 1; i++) {
    if (!losClear(grid, anchor, cells[i + 1] as Cell, options)) { anchor = cells[i] as Cell; out.push(anchor); }
  }
  out.push(cells[cells.length - 1] as Cell);
  return out;
}

/** Distances and next steps toward one goal for every cell. */
export interface FlowField {
  readonly width: number;
  readonly height: number;
  readonly goal: Cell;
  /** Cost from each cell to the goal; Infinity when blocked or unreachable. */
  readonly distance: Float64Array;
  /** Index of the next cell toward the goal; -1 at the goal and where unreachable. */
  readonly next: Int32Array;
  /** Step (each of x, y in -1..1) from (x, y) toward the goal, or null at the goal, off-grid or unreachable. */
  direction(x: number, y: number, out?: Cell): Cell | null;
}

/** Dijkstra from `goal` over the whole grid: every agent reads its next step with one lookup. */
export function flowField(grid: Grid, goal: Cell, { diagonal = true, cutCorners = false }: { diagonal?: boolean; cutCorners?: boolean } = {}): FlowField {
  const w = grid.width, n = w * grid.height, cost = grid.cost, dirs = diagonal ? 8 : 4;
  const distance = new Float64Array(n).fill(Infinity), next = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const heap = new IndexHeap(n, distance, null), inHeap = new Uint8Array(n);
  if (isWalkable(grid, goal.x, goal.y)) {
    const gi = goal.y * w + goal.x;
    distance[gi] = 0;
    heap.push(gi);
    inHeap[gi] = 1;
  }
  while (heap.size > 0) {
    const b = heap.pop(), bx = b % w, by = (b - bx) / w, db = distance[b]!, cb = cost[b]!;
    done[b] = 1;
    for (let k = 0; k < dirs; k++) {
      const dx = DX[k]!, dy = DY[k]!, ax = bx + dx, ay = by + dy;
      if (!open(grid, ax, ay)) continue;
      const ai = ay * w + ax;
      if (done[ai] || (k >= 4 && !cornerOk(grid, bx, by, dx, dy, cutCorners))) continue;
      const d = db + (k < 4 ? cb : cb * SQRT2);
      if (d < distance[ai]!) {
        distance[ai] = d;
        next[ai] = b;
        if (inHeap[ai]) heap.decrease(ai);
        else { inHeap[ai] = 1; heap.push(ai); }
      }
    }
  }
  return {
    width: w,
    height: grid.height,
    goal: { x: goal.x, y: goal.y },
    distance,
    next,
    direction(x, y, out = { x: 0, y: 0 }) {
      if (!inBounds(grid, x, y)) return null;
      const t = next[y * w + x]!;
      if (t < 0) return null;
      out.x = (t % w) - x;
      out.y = (t - (t % w)) / w - y;
      return out;
    },
  };
}
