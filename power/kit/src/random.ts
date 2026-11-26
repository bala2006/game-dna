/**
 * Seeded randomness, noise and shaping functions. Deterministic on every JavaScript engine:
 * only 32-bit integer arithmetic through Math.imul and unsigned shifts.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  bool(probability?: number): boolean;
  /** Current internal state, so a run can be resumed or recorded. */
  state(): number;
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.trunc(seed) >>> 0;
}

export function createRng(seed: number): Rng {
  let s = normalizeSeed(seed) ^ 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() needs at least one item');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
    state() {
      return s;
    },
  };
}

/** Derive an independent child seed from a parent seed and a label (FNV-1a over the label). */
export function deriveSeed(seed: number, label: string): number {
  let h = 0x811c9dc5 ^ normalizeSeed(seed);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Noise {
  /** Hash of an integer lattice point and a channel, in [0, 1). */
  hash(ix: number, iy: number, channel: number): number;
  /** Smooth value noise in [0, 1). With `period`, it tiles every `period` units. */
  value(x: number, y: number, channel?: number, period?: number): number;
  /** Fractal sum of `octaves` value-noise layers, normalized to [0, 1). */
  fbm(x: number, y: number, channel?: number, octaves?: number, period?: number): number;
}

export function createNoise(seed = 1): Noise {
  const hash = (ix: number, iy: number, channel: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(channel + seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const value = (x: number, y: number, channel = 0, period = 0): number => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const w = (i: number) => (period ? ((i % period) + period) % period : i);
    const a = hash(w(ix), w(iy), channel), b = hash(w(ix + 1), w(iy), channel);
    const c = hash(w(ix), w(iy + 1), channel), d = hash(w(ix + 1), w(iy + 1), channel);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x: number, y: number, channel = 0, octaves = 5, period = 0): number => {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      v += amp * value(x * f, y * f, channel + i * 17, period * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return v / norm;
  };
  return { hash, value, fbm };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0 below `edge0`, 1 above `edge1`, a smooth S-curve between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Angle wrapped to (-PI, PI]. */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Frame-rate independent smoothing factor for a time constant `tau` in seconds. */
export const ease = (dt: number, tau: number): number => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
