# Verifying Phaser 3.90 games

## Mechanics in Node

A `SimScene` game keeps every rule in its `FixedStepSimulation` subclass, which imports nothing from Phaser. Scenario and property tests drive that class in Node; that is where mechanics are proven. The scene only draws and plays sound, so a browser test adds evidence about loading, input wiring and presentation.

## Browser smoke test

`tests/e2e/phaser-games.e2e.test.ts` serves each app's `dist/`, waits for the `canvas`, presses Enter to leave the title screen, holds ArrowRight for 1.2 s, and expects a non-zero canvas and no page or console errors. That proves the build boots and takes keys. It proves no rule, because nothing reads game state.

## Adding a dev hook

The Phaser apps expose no `window.__game` yet. Add one in `main.ts` after `bootGame`:

```ts
import { exposeDevHook } from '@gamedna/kit/loop';
import { bootGame } from '@gamedna/starter/phaser';
import { GravityScene } from './game/scene.js';

const scene = new GravityScene();
bootGame({ parent: 'game', width: 960, height: 540, backgroundColor: '#e9e4dc', scene });
exposeDevHook({
  get state() { return { ui: scene.uiMode, tick: scene.sim?.currentTick() ?? 0, ...scene.sim?.snapshot() }; },
});
```

`scene.sim` exists only after `create()`, hence the optional chaining. Then a test opens `?dev`, presses Enter, waits for `__game.state.ui === 'playing'`, holds a key and waits for a snapshot field such as `player.x` to change.

## Input and timing

- Phaser's keyboard plugin listens on the window, so `page.keyboard.down('ArrowRight')` reaches it without a click.
- `SimScene` polls bound keys and steps the simulation only while `uiMode` is `playing`. Keys held on the title screen do nothing.
- The first key press or click also unlocks Web Audio. Before it, `this.sound.locked` is true.
- A slow headless page runs fewer ticks per second of wall time, and the clock drops time past 5 steps per frame. Wait on `tick` or state, never on elapsed milliseconds.

## Screenshots

`page.screenshot()` captures the composited page, canvas included, with no `preserveDrawingBuffer` setting. Take one on the title screen, one in play and one on each end state (death, win, pause). Open each and check that actors stand out from the background, HUD text is readable at 960 x 540, and nothing draws as Phaser's missing-texture box, which signals a mistyped or unloaded texture key.
