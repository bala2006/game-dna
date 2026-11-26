import * as THREE from 'three';
import { clamp, smoothstep, type Noise, type Rng } from './random.js';

/** A point on the ground plane. 1 unit = 1 m. */
export interface GroundPoint { x: number; z: number }

export interface PathHit {
  distance: number;
  /** Index of the nearest segment, from point `index` to point `index + 1`. */
  index: number;
  /** Position along that segment, 0 to 1. */
  t: number;
}

export interface PathIndex {
  nearest(x: number, z: number): PathHit;
}

/** Spatial index over a polyline: fast distance from any ground point to the path. */
export function createPathIndex(points: readonly GroundPoint[], { closed = true, cell = 24 } = {}): PathIndex {
  type Seg = readonly [number, number, number, number];
  const segs: Seg[] = [], grid = new Map<string, number[]>();
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i] as GroundPoint, b = points[(i + 1) % points.length] as GroundPoint;
    segs.push([a.x, a.z, b.x, b.z]);
  }
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  segs.forEach(([ax, az, bx, bz], i) => {
    for (let cx = Math.floor(Math.min(ax, bx) / cell); cx <= Math.floor(Math.max(ax, bx) / cell); cx++)
      for (let cz = Math.floor(Math.min(az, bz) / cell); cz <= Math.floor(Math.max(az, bz) / cell); cz++) {
        const k = key(cx, cz), list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
  });
  const segDist = ([ax, az, bx, bz]: Seg, x: number, z: number) => {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    return { d: Math.hypot(ax + dx * t - x, az + dz * t - z), t };
  };
  const bruteForce = (x: number, z: number): PathHit => {
    let best: PathHit = { distance: Infinity, index: 0, t: 0 };
    segs.forEach((s, i) => { const r = segDist(s, x, z); if (r.d < best.distance) best = { distance: r.d, index: i, t: r.t }; });
    return best;
  };
  function nearest(x: number, z: number, maxRings = 4): PathHit {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best: PathHit = { distance: Infinity, index: 0, t: 0 };
    for (let ring = 0; ring <= maxRings; ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        for (const si of grid.get(key(cx + i, cz + j)) ?? []) {
          const r = segDist(segs[si] as Seg, x, z);
          if (r.d < best.distance) best = { distance: r.d, index: si, t: r.t };
        }
      }
      if (best.distance <= ring * cell) return best;
    }
    return best.distance <= maxRings * cell ? best : bruteForce(x, z);
  }
  return { nearest: (x, z) => nearest(x, z) };
}

/** Tangents and distances along a path, so features can be placed beside it. */
export interface PathFrames {
  points: readonly GroundPoint[];
  tangents: GroundPoint[];
  /** Distance along the path to each point. */
  distance: number[];
  total: number;
  closed: boolean;
  count: number;
  /** The point `side` meters to the left of point `i` (negative: right). */
  offset(i: number, side: number): GroundPoint;
  /** Position, tangent and point index at `s` meters along the path, `side` meters to its left. */
  at(s: number, side?: number): GroundPoint & { tangent: GroundPoint; index: number };
}

export function pathFrames(points: readonly GroundPoint[], { closed = true } = {}): PathFrames {
  const n = points.length;
  if (n < 2) throw new Error('pathFrames needs at least two points');
  const pt = (i: number) => points[closed ? (i + n) % n : clamp(i, 0, n - 1)] as GroundPoint;
  const tangents = points.map((_, i) => {
    const a = pt(i - 1), b = pt(i + 1), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  });
  const distance = [0];
  for (let i = 1; i < n; i++) distance.push((distance[i - 1] ?? 0) + Math.hypot(pt(i).x - pt(i - 1).x, pt(i).z - pt(i - 1).z));
  const total = (distance[n - 1] ?? 0) + (closed ? Math.hypot(pt(0).x - pt(n - 1).x, pt(0).z - pt(n - 1).z) : 0);
  const offset = (i: number, side: number): GroundPoint => {
    const p = pt(i), t = tangents[closed ? (i + n) % n : clamp(i, 0, n - 1)] as GroundPoint;
    return { x: p.x - t.z * side, z: p.z + t.x * side };
  };
  const at = (s: number, side = 0) => {
    const d = closed ? ((s % total) + total) % total : clamp(s, 0, total);
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((distance[mid] ?? 0) <= d) lo = mid; else hi = mid - 1; }
    const next = closed ? (lo + 1) % n : Math.min(lo + 1, n - 1);
    const segLen = (lo + 1 < n ? distance[lo + 1] ?? total : total) - (distance[lo] ?? 0) || 1;
    const f = clamp((d - (distance[lo] ?? 0)) / segLen, 0, 1), a = offset(lo, side), b = offset(next, side);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tangent: tangents[lo] as GroundPoint, index: lo };
  };
  return { points, tangents, distance, total, closed, count: n, offset, at };
}

/**
 * A strip along a path, between two side offsets and at two heights: road surfaces, lines,
 * curbs, rails (one offset, two heights), trails and rivers. UV v runs along the path every `vTile` meters.
 */
export function ribbonGeometry(frames: PathFrames, { from, to, y0 = 0, y1 = y0, vTile = 3.5, colorOf = null, skip = null, flatColor = false }: {
  from: number;
  to: number;
  y0?: number;
  y1?: number;
  vTile?: number;
  /** Vertex color per path point and side offset. */
  colorOf?: ((index: number, side: number) => THREE.Color) | null;
  /** Leave out segment `i`: dashes, gaps. */
  skip?: ((segment: number) => boolean) | null;
  /** One color per segment instead of blending between points: curb blocks. */
  flatColor?: boolean;
}): THREE.BufferGeometry {
  const { count, closed, distance, total } = frames, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const segments = closed ? count : count - 1;
  let n = 0;
  for (let i = 0; i < segments; i++) {
    if (skip?.(i)) continue;
    for (const j of [i, i + 1]) {
      const k = j % count, a = frames.offset(k, from), b = frames.offset(k, to), v = (j === count ? total : distance[k] ?? 0) / vTile;
      pos.push(a.x, y0, a.z, b.x, y1, b.z);
      uv.push(0, v, 1, v);
      if (colorOf) { const ck = flatColor ? i : k, c = colorOf(ck, from), d = colorOf(ck, to); col.push(c.r, c.g, c.b, d.r, d.g, d.b); }
    }
    idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorOf) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type HeightFn = (x: number, z: number) => number;

/**
 * Pure height function: fractal hills, flat along a path and blended back over `blend` meters,
 * plus an optional ring of far ranges for the horizon.
 */
export function createHeightField({ noise, path = null, flatWidth = 10, blend = 40, hills = { amplitude: 30, scale: 220 }, ranges = null, floor = -2 }: {
  noise: Noise;
  path?: PathIndex | null;
  flatWidth?: number;
  blend?: number;
  hills?: { amplitude: number; scale: number };
  ranges?: { inner: number; outer: number; height: number; scale: number; cx?: number; cz?: number; stretch?: number } | null;
  floor?: number;
}): HeightFn {
  return (x, z) => {
    const keep = path ? smoothstep(flatWidth, flatWidth + blend, path.nearest(x, z).distance) : 1;
    let y = (noise.fbm(x / hills.scale, z / hills.scale, 21, 5) - 0.45) * 2 * hills.amplitude * keep;
    if (ranges) {
      const r = Math.hypot((x - (ranges.cx ?? 0)) / (ranges.stretch ?? 1), z - (ranges.cz ?? 0));
      y += smoothstep(ranges.inner, ranges.outer, r) * (0.35 + noise.fbm(x / ranges.scale, z / ranges.scale, 33, 5)) * ranges.height;
    }
    return Math.max(floor, y);
  };
}

/** Poisson-disc style placement: no two points closer than `spacing`, and only where `accept` agrees. */
export function scatter({ rng, count, bounds, spacing = 1, accept = () => true, maxTries = count * 30 }: {
  rng: Rng;
  count: number;
  /** `[minX, minZ, maxX, maxZ]`. */
  bounds: readonly [number, number, number, number];
  spacing?: number;
  accept?: (x: number, z: number) => boolean;
  maxTries?: number;
}): GroundPoint[] {
  const [minX, minZ, maxX, maxZ] = bounds, cell = spacing / Math.SQRT2, grid = new Map<string, GroundPoint>(), out: GroundPoint[] = [];
  for (let tries = 0; tries < maxTries && out.length < count; tries++) {
    const x = rng.range(minX, maxX), z = rng.range(minZ, maxZ);
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    let ok = true;
    for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2 && ok; j++) {
      const p = grid.get(`${gx + i},${gz + j}`);
      if (p && Math.hypot(p.x - x, p.z - z) < spacing) ok = false;
    }
    if (!ok || !accept(x, z)) continue;
    const p = { x, z };
    grid.set(`${gx},${gz}`, p);
    out.push(p);
  }
  return out;
}

/** A square of terrain centered on the origin, displaced by `height`, with optional vertex color by rule. */
export function heightfieldGeometry({ size, segments, height, color = null, uvTile = 8 }: {
  size: number;
  segments: number;
  height: HeightFn;
  /** Color from position and the normal's up component (1 flat, 0 vertical). */
  color?: ((x: number, y: number, z: number, up: number) => THREE.Color) | null;
  /** Meters per texture repeat. */
  uvTile?: number;
}): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  if (color) {
    const nrm = g.getAttribute('normal'), c: number[] = [];
    for (let i = 0; i < p.count; i++) { const col = color(p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i)); c.push(col.r, col.g, col.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / uvTile), uv.getY(i) * (size / uvTile));
  return g;
}

/** Fades a material's color map toward `farColor` between `near` and `far` meters, which hides tiling. */
export function fadeTextureWithDistance<M extends THREE.MeshStandardMaterial>(material: M, farColor: THREE.Color, near = 90, far = 450): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.farColor = { value: farColor };
    shader.fragmentShader = 'uniform vec3 farColor;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 sampledDiffuseColor = texture2D(map, vMapUv);
      sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, farColor, smoothstep(${near.toFixed(1)}, ${far.toFixed(1)}, length(vViewPosition)));
      diffuseColor *= sampledDiffuseColor;`);
  };
  return material;
}
