/** Converts real elapsed time into a bounded number of fixed ticks (no spiral of death). */
export class FixedStepClock {
  private acc = 0;
  constructor(private readonly hz = 60, private readonly maxStepsPerFrame = 5) {}

  advance(deltaMs: number): number {
    this.acc += Math.min(deltaMs, 250);
    const stepMs = 1000 / this.hz;
    let steps = 0;
    while (this.acc >= stepMs && steps < this.maxStepsPerFrame) {
      this.acc -= stepMs;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0;
    return steps;
  }

  /** Share of the next tick already elapsed, in [0, 1). Interpolate drawn state by it. */
  get alpha(): number {
    return Math.min(0.999, (this.acc * this.hz) / 1000);
  }

  reset(): void {
    this.acc = 0;
  }
}

export interface FixedStepLoop {
  stop(): void;
}

/**
 * Runs `tick` at a fixed rate and `render` once per animation frame. `render` gets `alpha` for
 * interpolation and the frame time in seconds, capped at 0.1 s, for presentation smoothing.
 */
export function runFixedStep({ hz = 60, maxStepsPerFrame = 5, tick, render }: {
  hz?: number;
  maxStepsPerFrame?: number;
  tick: () => void;
  render: (alpha: number, dt: number) => void;
}): FixedStepLoop {
  const clock = new FixedStepClock(hz, maxStepsPerFrame);
  let last = performance.now(), handle = 0, running = true;
  const frame = (now: number) => {
    if (!running) return;
    const ms = now - last;
    last = now;
    for (let i = clock.advance(ms); i > 0; i--) tick();
    render(clock.alpha, Math.min(0.1, ms / 1000));
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return { stop() { running = false; cancelAnimationFrame(handle); } };
}

/** Calls `onHidden` when the tab is hidden or the window loses focus. Returns an unsubscribe. */
export function onPageHidden(onHidden: () => void): () => void {
  const visibility = () => { if (document.hidden) onHidden(); };
  document.addEventListener('visibilitychange', visibility);
  addEventListener('blur', onHidden);
  return () => { document.removeEventListener('visibilitychange', visibility); removeEventListener('blur', onHidden); };
}

/** Calls `start` once, on the first pointer or key press. Browsers block audio until then. */
export function onFirstGesture(start: () => void): void {
  const once = () => { removeEventListener('pointerdown', once); removeEventListener('keydown', once); start(); };
  addEventListener('pointerdown', once);
  addEventListener('keydown', once);
}

/**
 * Exposes a test hook as `window[name]` only when the page URL has the `?dev` flag, so shipped
 * builds carry no hook. Returns whether the hook was exposed.
 */
export function exposeDevHook(api: object, { name = '__game', flag = 'dev' } = {}): boolean {
  if (!new URLSearchParams(location.search).has(flag)) return false;
  (globalThis as Record<string, unknown>)[name] = api;
  return true;
}
