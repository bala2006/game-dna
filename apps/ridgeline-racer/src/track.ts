import { CatmullRomCurve3, Vector3 } from 'three';
import { createRng, deriveSeed } from '@gamedna/kit/random';
import { createPathIndex, pathFrames, type GroundPoint, type PathFrames, type PathIndex } from '@gamedna/kit/world';

/** Road width, curb width and barrier offset from the centerline, in meters. */
export const ROAD = { width: 14, curb: 1.1, rail: 14 / 2 + 6 } as const;

export interface Track {
  seed: number;
  points: GroundPoint[];
  frames: PathFrames;
  index: PathIndex;
  /** Signed curvature per point: positive turns left. */
  turn: number[];
  count: number;
  /** Point index of the start grid. */
  start: number;
}

/** A closed circuit from a seed: 14 jittered control points on an ellipse, resampled to 900 points about 1.2 m apart. */
export function buildTrack(seed: number, { controls = 14, radius = 150, samples = 900 } = {}): Track {
  const rng = createRng(deriveSeed(seed, 'track'));
  const ctrl: Vector3[] = [];
  for (let i = 0; i < controls; i++) {
    const a = (i / controls) * Math.PI * 2, r = radius * rng.range(0.72, 1.18);
    ctrl.push(new Vector3(Math.cos(a) * r * 1.35, 0, Math.sin(a) * r));
  }
  const spaced = new CatmullRomCurve3(ctrl, true, 'centripetal').getSpacedPoints(samples);
  spaced.pop();
  const points = spaced.map((p) => ({ x: p.x, z: p.z }));
  const frames = pathFrames(points, { closed: true }), n = points.length;
  const turn = points.map((_, i) => {
    const a = frames.tangents[(i - 6 + n) % n] as GroundPoint, b = frames.tangents[(i + 6) % n] as GroundPoint;
    return a.x * b.z - a.z * b.x;
  });
  return { seed, points, frames, index: createPathIndex(points, { closed: true, cell: 24 }), turn, count: n, start: 6 };
}
