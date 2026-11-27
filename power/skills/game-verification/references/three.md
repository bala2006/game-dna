# Verifying three.js 0.170 games

## Rules in Node

The three.js apps keep rules in `sim.ts` with no `three` import, so `tests/sim.test.ts` steps them directly: `sim.step(controls)` with an automatic driver, then assertions on plain state. `apps/ridgeline-racer/tests/sim.test.ts` shows the shapes: a full race finishes lap by lap, skipping checkpoints counts no lap, reset returns to the grid, input is ignored while paused, and two runs with one seed and one input sequence are `toEqual`.

`tests/contracts.test.ts` checks the seams: the sim's step equals `1 / CONTRACTS.simulation.hz`, and every event type emitted during a full automatic run is in `CONTRACTS.events`.

## Scenario adapter

These sims take a controls object per step, not `setInput`. To run scenario JSON, wrap one in a `GameHarness`:

```ts
import type { FlatState, GameHarness, RawEvent } from '@gamedna/core';
import { CONTRACTS } from '../src/contracts.js';
import { RaceSim } from '../src/sim.js';
import { buildTrack } from '../src/track.js';

class RaceHarness implements GameHarness {
  readonly tickRateHz = CONTRACTS.simulation.hz;
  private sim = new RaceSim(buildTrack(4));
  private keys = new Set<string>();
  private ticks = 0;
  reset(seed: number): void { this.sim = new RaceSim(buildTrack(seed)); this.keys.clear(); this.ticks = 0; }
  setInput(key: string, down: boolean): void { if (down) this.keys.add(key); else this.keys.delete(key); }
  step(): void {
    const k = (name: string) => (this.keys.has(name) ? 1 : 0);
    this.sim.step({ steer: k('left') - k('right'), throttle: k('throttle'), brake: k('brake'), drift: this.keys.has('drift') });
    this.ticks++;
  }
  snapshot(): FlatState {
    const { car, race } = this.sim;
    return { 'car.speed': Math.abs(car.vf), 'car.offroad': car.offroad, 'race.phase': race.phase, 'race.lap': race.lap };
  }
  drainEvents(): RawEvent[] { return this.sim.drainEvents().map(({ type, ...data }) => ({ type, data })); }
  currentTick(): number { return this.ticks; }
}
```

- `currentTick()` counts steps. A game clock that stops during a countdown or pause makes `runScenario` loop forever.
- Event payloads must be flat primitives; flatten vectors into `x` and `z` fields.

## Browser tests

- `serveDist(dist)` serves the built `dist/`, `launchChromium()` starts Chromium on SwiftShader, and `openGame(browser, url, contextOptions)` installs a stub gamepad on `window.__pad`, waits up to 120 s for `window.__game`, rejects on the first page error and collects console errors in `errors`. End each test with `expect(errors).toEqual([])`.
- Open `?dev&quality=low`, plus `&seed=` to pin the layout and an app flag such as `&auto=1` for an automatic player that reaches the core loop's goal.
- Wait with `page.waitForFunction(() => window.__game.state.speed > 22, null, { polling: 100, timeout })`. SwiftShader runs a lit scene at a few frames per second, so the racer's tests allow 900 s each.
- `frames(page, n)` waits for n animation frames before reading render-side values such as the camera position.
- Devices: `page.keyboard.down('KeyW')`; mouse look by adding to `__game.input.raw.look.x`; the gamepad by setting `__pad.connected = true`, `buttons[7].value = 1` and `axes[0]`; several fingers through `touch(ctx, page)`, which sends CDP `touchStart`, `touchMove` and `touchEnd` with point ids.
- Touch layout: with `hasTouch: true, isMobile: true`, `auditTouchLayout(layout)` on the hook's `touchLayout()` result returns `[]` at 667 x 375, 844 x 390 and 932 x 430.

## Dev hook

`exposeDevHook` publishes `window.__game` only when the URL has `?dev`, so shipped builds carry none. Give it a `state` getter that builds a fresh plain object each call, the `input` handle, and measurement helpers such as `carSize()`. Setup helpers such as `standAtMarker(i)` are allowed to reach a precondition; a test that uses one says so and proves the skipped part elsewhere.

## Screenshots

Save to `.scratch/<app>-shots/` at named states: each camera view, a touch session, the automatic run. Open every file with the image reader and write what it shows: the player in frame, a readable HUD, no all-black or all-white frame, the horizon and fog where the view expects them. Quality `low` drops bloom and vignette, so post-processing is unverified in these runs.
