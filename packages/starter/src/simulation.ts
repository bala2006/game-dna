import { createRng, type Rng } from '@gamedna/core/prng';
import type { FlatState, GameHarness, ParameterValues, Primitive, RawEvent } from '@gamedna/core';

/** Per-tick view of logical keys. `pressed` and `released` are edges since the previous tick. */
export interface InputFrame {
  held: ReadonlySet<string>;
  pressed: ReadonlySet<string>;
  released: ReadonlySet<string>;
  isDown(key: string): boolean;
  wasPressed(key: string): boolean;
}

/**
 * Collects key transitions between ticks. Both live keyboard input and scripted scenario input
 * go through this latch, so the simulation cannot tell them apart.
 */
export class InputLatch {
  private readonly held = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  set(key: string, down: boolean): void {
    if (down && !this.held.has(key)) {
      this.held.add(key);
      this.pressed.add(key);
    } else if (!down && this.held.has(key)) {
      this.held.delete(key);
      this.released.add(key);
    }
  }

  /** Snapshot for one tick, then clear edges. */
  take(): InputFrame {
    const held = new Set(this.held);
    const pressed = this.pressed;
    const released = this.released;
    this.pressed = new Set();
    this.released = new Set();
    return { held, pressed, released, isDown: (k) => held.has(k), wasPressed: (k) => pressed.has(k) };
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
  }

  heldKeys(): string[] {
    return [...this.held].sort();
  }
}

/** Read a numeric tuning value with a fallback, ignoring wrong types. */
export function num(values: ParameterValues, key: string, fallback: number): number {
  const v = values[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function flag(values: ParameterValues, key: string, fallback = false): boolean {
  const v = values[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function msToTicks(ms: number, hz: number): number {
  return Math.max(0, Math.ceil((ms * hz) / 1000));
}

/**
 * Base class for a deterministic fixed-step game simulation. Game rules live in subclasses as
 * plain TypeScript; Phaser only draws the resulting state. Implements the GameDNA harness.
 */
export abstract class FixedStepSimulation implements GameHarness {
  readonly tickRateHz: number = 60;
  protected tick = 0;
  protected seed = 1;
  protected rng: Rng = createRng(1);
  protected params: ParameterValues;
  protected setup: Record<string, Primitive> = {};
  protected readonly input = new InputLatch();
  private events: RawEvent[] = [];

  protected constructor(defaults: ParameterValues) {
    this.params = { ...defaults };
  }

  get dt(): number {
    return 1 / this.tickRateHz;
  }

  reset(seed: number, params: ParameterValues, setup: Record<string, Primitive> = {}): void {
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.params = { ...this.params, ...params };
    this.setup = { ...setup };
    this.tick = 0;
    this.events = [];
    this.input.clear();
    this.onReset();
  }

  setInput(key: string, down: boolean): void {
    this.input.set(key, down);
  }

  step(): void {
    const frame = this.input.take();
    this.tick++;
    this.update(frame);
  }

  currentTick(): number {
    return this.tick;
  }

  parameters(): ParameterValues {
    return { ...this.params };
  }

  protected emit(type: string, data: Record<string, Primitive> = {}): void {
    if (this.events.length < 5_000) this.events.push({ type, data });
  }

  drainEvents(): RawEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  abstract snapshot(): FlatState;
  protected abstract onReset(): void;
  protected abstract update(input: InputFrame): void;
}

export { FixedStepClock } from '@gamedna/kit/loop';
