/**
 * Seeded dungeon generator on a tile grid: rectangular rooms joined by corridors.
 *
 * Units: tiles; tile (x, y) has index `y * width + x`. Rooms never overlap and keep at least
 * `margin` wall tiles between each other and one wall tile at the map edge. Rooms are joined by a
 * minimum spanning tree over their centers, plus a fraction (`loops`) of short extra links so the
 * map has cycles, each carved as a one-tile L-shaped corridor. Every corridor runs center to center,
 * so every floor tile is reachable from `start` (checked before returning). `start` and `end` are
 * the room centers farthest apart by walking distance.
 * All randomness comes from the passed Rng in a fixed order: same seed and options, same dungeon.
 */
import { shuffle, type Rng } from './random.js';

/** Tile values in `Dungeon.tiles`. Doors are floor that joins a corridor to a room. */
export const TILE = { wall: 0, floor: 1, door: 2 } as const;

/** A placed rectangular room. */
export interface Room {
  /** Top-left tile. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Center tile. */
  cx: number;
  cy: number;
}

/** A door tile; one record per tile even if it touches two rooms. */
export interface Door { x: number; y: number; /** Index of the room it opens into. */ room: number }

/** Map size, seed source and layout limits. */
export interface DungeonOptions {
  width: number;
  height: number;
  rng: Rng;
  /** Most rooms to place (default 10). Fewer are placed when they do not fit. */
  maxRooms?: number;
  /** Room side length range in tiles, inclusive (default 4 to 9). */
  minSize?: number;
  maxSize?: number;
  /** Wall tiles kept between rooms (default 1). */
  margin?: number;
  /** Fraction of candidate extra links (each room's 3 nearest, not in the tree) to carve as loops (default 0.15). */
  loops?: number;
  /** Placement tries (default maxRooms * 30). */
  attempts?: number;
}

/** A generated dungeon. */
export interface Dungeon {
  width: number;
  height: number;
  /** `TILE` values, row-major. */
  tiles: Uint8Array;
  rooms: Room[];
  /** Room index pairs joined by a corridor: tree links first, then loops. */
  links: [number, number][];
  doors: Door[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Steps from `start` to each tile (4-way); -1 for walls. */
  distance: Int32Array;
}

/** Steps from (x, y) to every tile through non-wall tiles, 4-way; -1 where unreachable. */
export function floodDistances(width: number, height: number, tiles: Uint8Array, x: number, y: number): Int32Array {
  const dist = new Int32Array(width * height).fill(-1), queue = new Int32Array(width * height);
  const s = y * width + x;
  if (tiles[s] === TILE.wall || tiles[s] === undefined) return dist;
  let head = 0, tail = 0;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++]!, ix = i % width, d = dist[i]! + 1;
    const visit = (j: number) => { if (dist[j] === -1 && tiles[j] !== TILE.wall) { dist[j] = d; queue[tail++] = j; } };
    if (ix + 1 < width) visit(i + 1);
    if (ix > 0) visit(i - 1);
    if (i + width < width * height) visit(i + width);
    if (i >= width) visit(i - width);
  }
  return dist;
}

const dist2 = (a: Room, b: Room) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;

/** Generates a dungeon. Throws when not even one room of `minSize` fits. */
export function generateDungeon(options: DungeonOptions): Dungeon {
  const { width, height, rng, maxRooms = 10, minSize = 4, margin = 1, loops = 0.15 } = options;
  const maxSize = Math.max(minSize, options.maxSize ?? 9), attempts = options.attempts ?? maxRooms * 30;
  if (minSize < 1 || minSize > width - 2 || minSize > height - 2) throw new RangeError(`a ${minSize}-tile room does not fit a ${width}x${height} map`);

  const rooms: Room[] = [];
  for (let t = 0; t < attempts && rooms.length < maxRooms; t++) {
    const w = rng.int(minSize, Math.min(maxSize, width - 2)), h = rng.int(minSize, Math.min(maxSize, height - 2));
    const x = rng.int(1, width - 1 - w), y = rng.int(1, height - 1 - h);
    if (rooms.some((r) => x < r.x + r.w + margin && r.x < x + w + margin && y < r.y + r.h + margin && r.y < y + h + margin)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  if (rooms.length === 0) throw new RangeError('no room was placed; raise attempts');

  // Prim's minimum spanning tree over room centers; ties go to the lower room index.
  const n = rooms.length, linked = new Uint8Array(n * n), links: [number, number][] = [];
  const inTree = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  const relax = (i: number) => { for (let j = 0; j < n; j++) if (!inTree[j]) { const d = dist2(rooms[i]!, rooms[j]!); if (d < best[j]!) { best[j] = d; from[j] = i; } } };
  const link = (a: number, b: number) => { linked[a * n + b] = linked[b * n + a] = 1; links.push([a, b]); };
  inTree[0] = 1;
  relax(0);
  for (let k = 1; k < n; k++) {
    let j = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (j < 0 || best[i]! < best[j]!)) j = i;
    inTree[j] = 1;
    link(from[j]!, j);
    relax(j);
  }

  // Loop candidates: each room's three nearest rooms not already linked.
  const candidates: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const order = rooms.map((_, j) => j).filter((j) => j !== i).sort((a, b) => dist2(rooms[i]!, rooms[a]!) - dist2(rooms[i]!, rooms[b]!) || a - b);
    for (const j of order.slice(0, 3)) {
      const a = Math.min(i, j), b = Math.max(i, j);
      if (!linked[a * n + b] && !candidates.some(([p, q]) => p === a && q === b)) candidates.push([a, b]);
    }
  }
  const extra = shuffle(rng, candidates).slice(0, Math.round(Math.min(1, Math.max(0, loops)) * candidates.length));
  for (const [a, b] of extra) link(a, b);

  // Carve rooms, then corridors; a door is the corridor tile where a walk leaves or enters a room.
  const tiles = new Uint8Array(width * height), roomAt = new Int32Array(width * height).fill(-1), doors: Door[] = [];
  rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { tiles[y * width + x] = TILE.floor; roomAt[y * width + x] = i; }
  });
  const door = (t: number, room: number) => {
    if (tiles[t] === TILE.door) return;
    tiles[t] = TILE.door;
    doors.push({ x: t % width, y: Math.floor(t / width), room });
  };
  for (const [a, b] of links) {
    const ra = rooms[a]!, rb = rooms[b]!, horizontalFirst = rng.bool();
    let x = ra.cx, y = ra.cy, prev = y * width + x;
    while (x !== rb.cx || y !== rb.cy) {
      if (horizontalFirst ? x !== rb.cx : y === rb.cy) x += Math.sign(rb.cx - x);
      else y += Math.sign(rb.cy - y);
      const t = y * width + x;
      if (tiles[t] === TILE.wall) tiles[t] = TILE.floor;
      const was = roomAt[prev]!, now = roomAt[t]!;
      if (was >= 0 && now < 0) door(t, was);
      else if (was < 0 && now >= 0) door(prev, now);
      prev = t;
    }
  }

  // Start and end: the two room centers farthest apart by walking distance. Rooms are few, so a
  // flood from every center gives the exact pair; ties keep the earliest pair in room order.
  let si = 0, ei = 0, far = -1, distance = floodDistances(width, height, tiles, rooms[0]!.cx, rooms[0]!.cy);
  let startField = distance;
  for (let i = 0; i < rooms.length; i++) {
    const d = i === 0 ? distance : floodDistances(width, height, tiles, rooms[i]!.cx, rooms[i]!.cy);
    for (let j = i + 1; j < rooms.length; j++) {
      const v = d[rooms[j]!.cy * width + rooms[j]!.cx]!;
      if (v > far) { far = v; si = i; ei = j; startField = d; }
    }
  }
  distance = startField;
  const s = rooms[si]!, e = rooms[ei]!;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== TILE.wall && distance[i] === -1) throw new Error(`dungeon tile ${i % width},${Math.floor(i / width)} is unreachable`);
  return { width, height, tiles, rooms, links, doors, start: { x: s.cx, y: s.cy }, end: { x: e.cx, y: e.cy }, distance };
}
