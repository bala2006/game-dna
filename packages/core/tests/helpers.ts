import type { FlatState, GameHarness, ParameterValues, Primitive, RawEvent } from '../src/index.js';

/** Tiny counter game for testing the runner: pressing "inc" adds params.step to a counter. */
export class CounterHarness implements GameHarness {
  readonly tickRateHz = 60;
  private tick = 0;
  private count = 0;
  private held = new Set<string>();
  private prev = new Set<string>();
  private events: RawEvent[] = [];
  private step_ = 1;
  noise = 0;

  reset(_seed: number, params: ParameterValues, _setup: Record<string, Primitive>): void {
    this.tick = 0;
    this.count = 0;
    this.held.clear();
    this.prev.clear();
    this.events = [];
    this.step_ = typeof params['counter.step'] === 'number' ? (params['counter.step'] as number) : 1;
  }
  setInput(key: string, down: boolean): void {
    if (down) this.held.add(key);
    else this.held.delete(key);
  }
  step(): void {
    this.tick++;
    if (this.held.has('inc') && !this.prev.has('inc')) {
      this.count += this.step_;
      this.events.push({ type: 'inc', data: { id: this.count, by: this.step_ } });
    }
    this.prev = new Set(this.held);
  }
  snapshot(): FlatState {
    return { count: this.count + this.noise * Math.random(), tick: this.tick };
  }
  drainEvents(): RawEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  currentTick(): number {
    return this.tick;
  }
}
