/**
 * Seeded pseudo-random generator (32-bit "mulberry"-style mixer, written for GameDNA).
 * Deterministic for a given seed on every JavaScript engine because it uses only
 * 32-bit integer arithmetic via Math.imul and unsigned shifts.
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
