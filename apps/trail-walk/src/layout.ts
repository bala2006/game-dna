import { createNoise, createRng, deriveSeed } from '@gamedna/kit/random';
import { createHeightField, createPathIndex, pathFrames, scatter, type GroundPoint, type HeightFn, type PathFrames, type PathIndex } from '@gamedna/kit/world';

/** A box on the ground plane, turned by `yaw` around its center. Half sizes in meters. */
export interface Box { x: number; z: number; hx: number; hz: number; yaw: number }

export interface Tree { x: number; z: number; r: number; scale: number }

/** The walkable world as data: everything the simulation collides with and everything the view draws. */
export interface Layout {
  seed: number;
  trail: PathFrames;
  trailIndex: PathIndex;
  height: HeightFn;
  trees: Tree[];
  start: GroundPoint & { facing: number };
  /** A 4 m wall with a 0.9 x 2.1 m doorway, as two solid pieces either side of the gap. */
  wall: { x: number; z: number; width: number; height: number; thickness: number; door: { width: number; height: number }; pieces: Box[] };
  car: Box;
  markers: GroundPoint[];
  bound: number;
}

export const MARKERS = 8;

/** Builds the trail loop, terrain, trees, wall, parked car and markers from one seed. Pure. */
export function buildLayout(seed: number): Layout {
  const noise = createNoise(seed), rng = createRng(deriveSeed(seed, 'layout'));
  const points: GroundPoint[] = [];
  for (let i = 0; i < 420; i++) {
    const a = (i / 420) * Math.PI * 2, r = 46 + 9 * Math.sin(a * 3 + 0.7) + 5 * Math.sin(a * 5 + 2.1);
    points.push({ x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r });
  }
  const trailIndex = createPathIndex(points, { closed: true, cell: 12 });
  const trail = pathFrames(points, { closed: true });
  const height = createHeightField({ noise, path: trailIndex, flatWidth: 3, blend: 26, hills: { amplitude: 7, scale: 70 }, ranges: { inner: 160, outer: 420, scale: 140, height: 120 }, floor: -1 });

  const start = { x: 55, z: 8, facing: Math.PI / 2 };
  const wallW = 4, thickness = 0.2, door = { width: 0.9, height: 2.1 }, wx = start.x + 6, wz = start.z, side = (wallW - door.width) / 2;
  const pieces: Box[] = [-1, 1].map((s) => ({ x: wx, z: wz + s * (door.width + side) / 2, hx: thickness / 2, hz: side / 2, yaw: 0 }));
  const car: Box = { x: start.x + 2, z: start.z + 6, hx: 0.92, hz: 2.39, yaw: 1.3 };

  const clearOfProps = (x: number, z: number, gap: number) => Math.hypot(x - wx, z - wz) > gap && Math.hypot(x - car.x, z - car.z) > gap;
  const trees = scatter({
    rng, count: 420, bounds: [-150, -130, 150, 130], spacing: 4.5,
    accept: (x, z) => noise.fbm(x / 40, z / 40, 91, 3) > 0.47 && trailIndex.nearest(x, z).distance > 4 && Math.hypot(x - start.x, z - start.z) > 14,
  }).map((p) => { const scale = rng.range(0.8, 1.4); return { ...p, r: 0.3 * scale, scale }; });

  const markers: GroundPoint[] = [];
  for (let i = 0; i < MARKERS; i++) {
    let s = ((i + 0.5) / MARKERS) * trail.total + rng.range(-6, 6), p = trail.at(s, rng.range(-2.6, 2.6));
    while (!clearOfProps(p.x, p.z, 8)) { s += 5; p = trail.at(s, 2); }
    markers.push({ x: p.x, z: p.z });
  }
  return { seed, trail, trailIndex, height, trees, start, wall: { x: wx, z: wz, width: wallW, height: 2.7, thickness, door, pieces }, car, markers, bound: 140 };
}
