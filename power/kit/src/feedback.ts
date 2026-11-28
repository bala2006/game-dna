/**
 * Game feel: trauma screen shake, hit stop, hit flashes, easing curves and number tweens. Pure:
 * callers pass elapsed time in, and shake noise is seeded, so the same seed and the same `dt`
 * sequence give the same motion. Shake works in seconds; hit stop works in simulation ticks;
 * `Flash` and `Tween` use whatever unit their `dt` is in (ticks or seconds), stated by the caller.
 */
import { clamp, createNoise, deriveSeed } from './random.js';

/** A curve from 0 at t = 0 to 1 at t = 1, for t in [0, 1]. */
export type Easing = (t: number) => number;
/** Constant speed. */
export const linear: Easing = (t) => t;
/** Fast start, gentle stop. */
export const quadOut: Easing = (t) => t * (2 - t);
/** Faster start and softer stop than `quadOut`. */
export const cubicOut: Easing = (t) => 1 - (1 - t) ** 3;
/** Overshoots by about 10%, then settles. */
export const backOut: Easing = (t) => { const s = 1.70158, u = t - 1; return 1 + u * u * ((s + 1) * u + s); };
/** Springs past 1 and rings down. */
export const elasticOut: Easing = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * ((2 * Math.PI) / 3)) + 1);
/** The easings by name, for tuning files. */
export const EASINGS = { linear, quadOut, cubicOut, backOut, elasticOut } as const;
export type EasingName = keyof typeof EASINGS;

/** Remaining time below this share of a duration counts as finished, so sums of float `dt` still end exactly. */
const SNAP = 1e-9;

export interface ShakeOffset { x: number; y: number; angle: number }

export interface ShakeOptions {
  seed?: number;
  /** Largest offset at full trauma, in the caller's units: pixels in 2D, meters in 3D. Default 1. */
  maxOffset?: number;
  /** Largest roll at full trauma, in radians. Default 0.05. */
  maxAngle?: number;
  /** Trauma lost per second. Default 1. */
  decay?: number;
  /** Noise lattice points per second; higher shakes faster. Default 18. */
  frequency?: number;
  /** Shake amount is trauma to this power, so small hits barely move and big ones jolt. Default 2. */
  exponent?: number;
  /** When true, `update` returns zero offsets. Trauma still decays. */
  reducedMotion?: boolean;
}

export interface Shake {
  /** Current trauma, 0 to 1. */
  readonly trauma: number;
  reducedMotion: boolean;
  /** Adds trauma, clamped to [0, 1]. A hit is about 0.3, an explosion 0.6 to 1. */
  add(amount: number): void;
  /** Decays trauma over `dt` seconds and returns this frame's offset. Returns the same object every call. */
  update(dt: number): Readonly<ShakeOffset>;
  reset(): void;
}

/** Trauma-based shake: offset = trauma^exponent * max, along smooth seeded noise. Apply x and y in camera space and `angle` as roll. */
export function createShake({ seed = 1, maxOffset = 1, maxAngle = 0.05, decay = 1, frequency = 18, exponent = 2, reducedMotion = false }: ShakeOptions = {}): Shake {
  const noise = createNoise(deriveSeed(seed, 'shake')), out: ShakeOffset = { x: 0, y: 0, angle: 0 };
  let trauma = 0, time = 0, still = reducedMotion;
  const wave = (channel: number) => noise.value(time * frequency, 0, channel) * 2 - 1;
  return {
    get trauma() { return trauma; },
    get reducedMotion() { return still; },
    set reducedMotion(v: boolean) { still = v; },
    add(amount) { trauma = clamp(trauma + amount, 0, 1); },
    update(dt) {
      time += dt;
      trauma = Math.max(0, trauma - decay * dt);
      const k = still ? 0 : trauma ** exponent;
      out.x = k === 0 ? 0 : k * maxOffset * wave(0);
      out.y = k === 0 ? 0 : k * maxOffset * wave(1);
      out.angle = k === 0 ? 0 : k * maxAngle * wave(2);
      return out;
    },
    reset() { trauma = 0; time = 0; out.x = out.y = out.angle = 0; },
  };
}

/**
 * Hit stop in simulation ticks. Call `consume()` once per tick and skip the world step while it
 * returns true. A longer request replaces a shorter one, requests never add up, and no run of
 * frozen ticks exceeds `cap`, however many hits land during it.
 */
export class HitStop {
  private left = 0;
  private run = 0;
  constructor(readonly cap = 12) {}

  /** Asks for `ticks` frozen ticks from now. Convert milliseconds with `ticksFor` from './contracts.js'. */
  request(ticks: number): void {
    const t = Number.isFinite(ticks) ? Math.max(0, Math.floor(ticks)) : 0;
    this.left = Math.max(0, Math.min(Math.max(this.left, t), this.cap - this.run));
  }

  /** True when this tick is frozen. Uses up one frozen tick. */
  consume(): boolean {
    if (this.left > 0) { this.left--; this.run++; return true; }
    this.run = 0;
    return false;
  }

  get remaining(): number { return this.left; }
  get active(): boolean { return this.left > 0; }
  clear(): void { this.left = 0; this.run = 0; }
}

/** Flash strength for plain-data timers such as `enemy.flashTicks`: 1 at `remaining = duration`, 0 at 0, along `1 - easing(progress)`. */
export function flashLevel(remaining: number, duration: number, easing: Easing = quadOut): number {
  if (!(remaining > 0 && duration > 0)) return 0;
  return clamp(1 - easing(1 - Math.min(1, remaining / duration)), 0, 1);
}

/** One countdown flash, such as an enemy's white hit flash. `duration` and `dt` share a unit: ticks or seconds. */
export class Flash {
  private left = 0;
  private length = 0;
  constructor(private readonly easing: Easing = quadOut) {}

  /** Starts a flash lasting `duration`. A shorter trigger never cuts a longer flash short. */
  trigger(duration: number): void {
    if (duration > this.left) { this.left = duration; this.length = duration; }
  }

  update(dt: number): void { this.left = this.left - dt <= SNAP * this.length ? 0 : this.left - dt; }
  /** 1 when triggered, easing down to 0 when done. */
  get intensity(): number { return flashLevel(this.left, this.length, this.easing); }
  get active(): boolean { return this.left > 0; }
  clear(): void { this.left = 0; }
}

/** Moves a number to a target over a duration along an easing. `duration` and `dt` share a unit. */
export class Tween {
  private from: number;
  private goal: number;
  private now: number;
  private duration = 0;
  private elapsed = 0;
  private easing: Easing = cubicOut;
  constructor(value = 0) { this.from = this.goal = this.now = value; }

  /** Starts from the current value toward `target`. A duration of 0 or less jumps there. */
  to(target: number, duration: number, easing: Easing = cubicOut): this {
    this.from = this.now;
    this.goal = target;
    this.duration = duration > 0 ? duration : 0;
    this.elapsed = 0;
    this.easing = easing;
    if (this.duration === 0) this.now = target;
    return this;
  }

  /** Advances by `dt` and returns the new value. */
  update(dt: number): number {
    if (this.elapsed < this.duration) {
      const e = this.elapsed + Math.max(0, dt);
      this.elapsed = this.duration - e <= SNAP * this.duration ? this.duration : e;
      const t = this.elapsed / this.duration;
      this.now = t >= 1 ? this.goal : this.from + (this.goal - this.from) * this.easing(t);
    }
    return this.now;
  }

  get value(): number { return this.now; }
  get target(): number { return this.goal; }
  get done(): boolean { return this.elapsed >= this.duration; }
  /** Jumps to `value` and stops. */
  set(value: number): void { this.from = this.goal = this.now = value; this.duration = this.elapsed = 0; }
}
