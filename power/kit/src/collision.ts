/**
 * Collision tests, push-outs, casts, a tile-grid mover and a spatial hash. Pure: no three.js, no DOM,
 * no clocks, no randomness. The 2D functions are unit-agnostic (pixels, tiles or meters) and work in
 * (x, y) with y growing downward as in Phaser, so `top` is the smaller y. A box is its min corner plus size.
 * On the Kit's 3D ground plane pass z as y. `pushCircleOutOfBox` works on XZ directly, in meters, with
 * boxes turned like a heading: a box's local +Z points along (sin yaw, cos yaw).
 * Overlap tests are strict: shapes that only touch do not overlap. Casts treat boundaries as solid.
 * Push-outs write the corrected center into `out` and return whether they moved it.
 */
import { clamp } from './random.js';

/** A point or vector in 2D. */
export interface Vec2 { x: number; y: number }
/** Axis-aligned box: min corner and size. */
export interface Aabb { x: number; y: number; w: number; h: number }
/** Circle: center and radius. */
export interface Circle { x: number; y: number; r: number }
/** A point on the XZ ground plane. */
export interface PointXZ { x: number; z: number }
/** A box on the XZ ground plane: center, half sizes and heading-style yaw in radians. */
export interface OrientedBox { x: number; z: number; hx: number; hz: number; yaw: number }

/** True when two boxes share interior area. */
export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True when two circles are closer than the sum of their radii. */
export function circleOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
}

/** True when a circle and a box share interior area. */
export const circleAabbOverlap = (c: Circle, b: Aabb): boolean => circleBoxOverlap(c.x, c.y, c.r, b.x, b.y, b.w, b.h);

function circleBoxOverlap(x: number, y: number, r: number, bx: number, by: number, bw: number, bh: number): boolean {
  const dx = x - clamp(x, bx, bx + bw), dy = y - clamp(y, by, by + bh);
  return dx !== 0 || dy !== 0 ? Math.hypot(dx, dy) < r : r > 0 || (x > bx && x < bx + bw && y > by && y < by + bh);
}

/** Pushes a circle at (x, y) out of a box. A center inside leaves through the nearest side. */
export function circleVsAabb(x: number, y: number, r: number, b: Aabb, out: Vec2): boolean {
  const qx = clamp(x, b.x, b.x + b.w), qy = clamp(y, b.y, b.y + b.h), ox = x - qx, oy = y - qy;
  out.x = x;
  out.y = y;
  if (ox !== 0 || oy !== 0) {
    const d = Math.hypot(ox, oy);
    if (d >= r) return false;
    out.x = qx + (ox / d) * r;
    out.y = qy + (oy / d) * r;
    return true;
  }
  const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y, pen = Math.min(left, right, top, bottom);
  if (r <= 0 && pen <= 0) return false;
  if (pen === left) out.x = b.x - r;
  else if (pen === right) out.x = b.x + b.w + r;
  else if (pen === top) out.y = b.y - r;
  else out.y = b.y + b.h + r;
  return true;
}

/** Pushes a circle at (x, y) out of a fixed circle. Centers closer than 1e-6 have no push direction and stay. */
export function circleVsCircle(x: number, y: number, r: number, cx: number, cy: number, cr: number, out: Vec2): boolean {
  const d = Math.hypot(x - cx, y - cy), min = cr + r;
  if (d < min && d > 1e-6) {
    out.x = cx + ((x - cx) / d) * min;
    out.y = cy + ((y - cy) / d) * min;
    return true;
  }
  out.x = x;
  out.y = y;
  return false;
}

/** Pushes a circle at (x, z) out of a turned box on the ground plane. A center inside leaves through the nearer side. */
export function pushCircleOutOfBox(x: number, z: number, r: number, b: OrientedBox, out: PointXZ): boolean {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
  const ox = lx - qx, oz = lz - qz;
  let d = Math.hypot(ox, oz), nx: number, nz: number;
  if (d >= r) {
    out.x = x;
    out.z = z;
    return false;
  }
  if (d > 1e-9) { nx = ox / d; nz = oz / d; }
  else {
    const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
    if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; d = -px; }
    else { nx = 0; nz = Math.sign(lz) || 1; d = -pz; }
  }
  const push = r - d, rx = lx + nx * push, rz = lz + nz * push;
  out.x = b.x + rx * c + rz * s;
  out.z = b.z - rx * s + rz * c;
  return true;
}

/** Distance along a ray from (ox, oy) toward (dx, dy) to the first point of a box, 0 from inside, -1 on a miss. */
export function rayVsAabb(ox: number, oy: number, dx: number, dy: number, b: Aabb, maxDist = Infinity): number {
  const len = Math.hypot(dx, dy);
  if (len === 0) return ox >= b.x && ox <= b.x + b.w && oy >= b.y && oy <= b.y + b.h ? 0 : -1;
  const ux = dx / len, uy = dy / len;
  let lo = 0, hi = maxDist;
  if (ux === 0) { if (ox < b.x || ox > b.x + b.w) return -1; }
  else {
    const t1 = (b.x - ox) / ux, t2 = (b.x + b.w - ox) / ux;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  if (uy === 0) { if (oy < b.y || oy > b.y + b.h) return -1; }
  else {
    const t1 = (b.y - oy) / uy, t2 = (b.y + b.h - oy) / uy;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo <= hi ? lo : -1;
}

/** Distance from (ax, ay) along the segment to (bx, by) where it first touches a circle, 0 from inside, -1 on a miss. */
export function segmentVsCircle(ax: number, ay: number, bx: number, by: number, c: Circle): number {
  const fx = ax - c.x, fy = ay - c.y, inside = fx * fx + fy * fy - c.r * c.r;
  if (inside <= 0) return 0;
  const len = Math.hypot(bx - ax, by - ay);
  if (len === 0) return -1;
  const half = (fx * (bx - ax) + fy * (by - ay)) / len;
  if (half >= 0) return -1;
  const disc = half * half - inside;
  if (disc < 0) return -1;
  const t = -half - Math.sqrt(disc);
  return t <= len ? t : -1;
}

/** Result of `moveAndCollideTiles`: the new min corner and which sides hit a solid tile. */
export interface TileMove { x: number; y: number; left: boolean; right: boolean; top: boolean; bottom: boolean }

/** A reusable `TileMove` for the `out` argument. */
export const createTileMove = (): TileMove => ({ x: 0, y: 0, left: false, right: false, top: false, bottom: false });

/** Tile column or row index is solid. Called with any integer, including outside the map. */
export type TileSolid = (tx: number, ty: number) => boolean;

/** True when a box overlaps a solid tile. Edges within `skin` of a tile count as touching, not overlapping. */
export function overlapsTiles(x: number, y: number, w: number, h: number, isSolid: TileSolid, tileSize: number, skin = 0.001): boolean {
  const c0 = Math.floor(x / tileSize), c1 = Math.max(c0, Math.floor((x + w - skin) / tileSize));
  const r0 = Math.floor(y / tileSize), r1 = Math.max(r0, Math.floor((y + h - skin) / tileSize));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(c, r)) return true;
  return false;
}

/**
 * Moves a box by (dx, dy) through a tile grid in steps, x part then y part on each step. On contact
 * the box snaps flush against the tile, the side is flagged and that axis stops; the other goes on.
 * A move of at most half a tile on both axes is one step: x whole, then y whole. Otherwise it takes
 * n = ceil(max(|dx|, |dy|) / (tileSize / 2)) steps: an axis longer than half a tile advances by 1/n
 * of its move per step, and an axis within half a tile moves whole on the first step. No step moves
 * more than half a tile on an axis, so a fast body cannot pass through a wall or a lone tile,
 * diagonals included. Like any axis-separated mover, a step can still clip a tile corner by up to
 * the length of that step. Without contact the result is exactly x + dx, y + dy.
 */
export function moveAndCollideTiles(box: Aabb, dx: number, dy: number, isSolid: TileSolid, tileSize: number, out: TileMove, skin = 0.001): TileMove {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('moveAndCollideTiles needs a finite move');
  const { w, h } = box, half = tileSize / 2, x0 = box.x, y0 = box.y;
  const nx = Math.ceil(Math.abs(dx) / half), ny = Math.ceil(Math.abs(dy) / half), n = Math.max(1, nx, ny);
  let x = x0, y = y0, movingX = dx !== 0, movingY = dy !== 0;
  out.left = out.right = out.top = out.bottom = false;
  for (let i = 1; i <= n && (movingX || movingY); i++) {
    if (movingX) {
      const last = i === n || nx === 1;
      x = last ? x0 + dx : x0 + dx * (i / n);
      const hit = overlapsTiles(x, y, w, h, isSolid, tileSize, skin);
      if (hit && dx > 0) { x = Math.floor((x + w) / tileSize) * tileSize - w; out.right = true; }
      else if (hit) { x = (Math.floor(x / tileSize) + 1) * tileSize; out.left = true; }
      if (hit || last) movingX = false;
    }
    if (movingY) {
      const last = i === n || ny === 1;
      y = last ? y0 + dy : y0 + dy * (i / n);
      const hit = overlapsTiles(x, y, w, h, isSolid, tileSize, skin);
      if (hit && dy > 0) { y = Math.floor((y + h) / tileSize) * tileSize - h; out.bottom = true; }
      else if (hit) { y = (Math.floor(y / tileSize) + 1) * tileSize; out.top = true; }
      if (hit || last) movingY = false;
    }
  }
  out.x = x;
  out.y = y;
  return out;
}

const OFFSET = 0x2000000, STRIDE = 0x4000000;
/** One integer per cell. Cell coordinates must stay within ±33 million. */
const cellKey = (cx: number, cy: number): number => (cx + OFFSET) * STRIDE + (cy + OFFSET);

/**
 * Broad phase over boxes in square cells. Rebuild it each tick with `clear` and `insert`. Buckets
 * used in the last rebuild are kept for the next one, so steady use does not allocate; a bucket that
 * stays empty through a whole rebuild is deleted, so memory follows the occupied cells, not the
 * distance items have traveled. Queries return each matching id once.
 */
export class SpatialHash {
  private readonly cells = new Map<number, number[]>();
  private readonly used: number[][] = [];
  private usedKeys: number[] = [];
  /** Keys of the buckets kept, emptied, by the previous `clear`. */
  private keptKeys: number[] = [];
  private readonly ids: number[] = [];
  private readonly boxes: number[] = [];
  private readonly marks: number[] = [];
  private stamp = 0;

  constructor(readonly cellSize: number) {
    if (!(cellSize > 0)) throw new Error('SpatialHash cellSize must be positive');
  }

  /** Number of inserted items. */
  get size(): number { return this.ids.length; }

  /** Buckets held: at most the cells occupied in the current and the previous rebuild. */
  get cellCount(): number { return this.cells.size; }

  /** Removes every item. Deletes buckets that no item used since the previous `clear`. */
  clear(): void {
    for (const k of this.keptKeys) if (this.cells.get(k)?.length === 0) this.cells.delete(k);
    for (const bucket of this.used) bucket.length = 0;
    const kept = this.keptKeys;
    this.keptKeys = this.usedKeys;
    this.usedKeys = kept;
    this.usedKeys.length = this.used.length = this.ids.length = this.boxes.length = this.marks.length = 0;
  }

  /** Adds an item by caller id and box. Insert each id once per rebuild. */
  insert(id: number, x: number, y: number, w: number, h: number): void {
    if (!Number.isFinite(x + y + w + h)) throw new RangeError('SpatialHash.insert needs a finite box');
    const slot = this.ids.length, s = this.cellSize;
    this.ids.push(id);
    this.boxes.push(x, y, w, h);
    this.marks.push(0);
    for (let cx = Math.floor(x / s), cx1 = Math.floor((x + w) / s); cx <= cx1; cx++)
      for (let cy = Math.floor(y / s), cy1 = Math.floor((y + h) / s); cy <= cy1; cy++) {
        const k = cellKey(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) this.cells.set(k, (bucket = []));
        if (bucket.length === 0) { this.used.push(bucket); this.usedKeys.push(k); }
        bucket.push(slot);
      }
  }

  /** Ids of items whose box overlaps the query box, written into `out`. */
  query(x: number, y: number, w: number, h: number, out: number[] = []): number[] {
    return this.collect(x, y, x + w, y + h, x, y, w, h, -1, out);
  }

  /** Ids of items whose box comes closer than `r` to (x, y), written into `out`. */
  queryRadius(x: number, y: number, r: number, out: number[] = []): number[] {
    return this.collect(x - r, y - r, x + r, y + r, x, y, 0, 0, r, out);
  }

  private collect(x0: number, y0: number, x1: number, y1: number, qx: number, qy: number, qw: number, qh: number, r: number, out: number[]): number[] {
    if (!Number.isFinite(x0 + y0 + x1 + y1)) throw new RangeError('SpatialHash query needs a finite area');
    const s = this.cellSize, b = this.boxes, stamp = ++this.stamp;
    out.length = 0;
    for (let cx = Math.floor(x0 / s), cx1 = Math.floor(x1 / s); cx <= cx1; cx++)
      for (let cy = Math.floor(y0 / s), cy1 = Math.floor(y1 / s); cy <= cy1; cy++) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const slot of bucket) {
          if (this.marks[slot] === stamp) continue;
          this.marks[slot] = stamp;
          const i = slot * 4, bx = b[i] as number, by = b[i + 1] as number, bw = b[i + 2] as number, bh = b[i + 3] as number;
          const hit = r < 0
            ? qx < bx + bw && qx + qw > bx && qy < by + bh && qy + qh > by
            : circleBoxOverlap(qx, qy, r, bx, by, bw, bh);
          if (hit) out.push(this.ids[slot] as number);
        }
      }
    return out;
  }
}
