# Fixed-step loops in Phaser 3.90 games

## SimScene

`SimScene` from `@gamedna/starter/phaser` polls bound keys once per frame, runs `clock.advance(delta)` ticks of `sim.step()`, passes each tick's events to `onSimEvents`, then calls `renderState(deltaMs)`. Outside `uiMode === 'playing'` it resets the clock, so leaving the pause screen never bursts.

- `renderState` receives no alpha. On 120 and 144 Hz displays, read `this.clock.alpha` and draw between the previous and current positions the simulation keeps.
- For pixel art, round only drawn positions (`Math.round`, or the camera's `roundPixels`). Rounding simulation state changes the rules.
- Phaser pauses its loop when the tab is hidden and resets its delta when it returns, so the tab switch itself does not burst. Still pause the simulation through `uiMode` so the player returns to a paused game.

## Phaser smooths delta

With `fps.smoothStep` on (the default), Phaser averages the last 10 frame deltas (`fps.deltaHistory`) and replaces any delta above 200 ms (`fps.min` of 5) with an earlier one. The simulation then sees fewer hitches, but after a stall it runs behind wall time. Keep the default for action games. Set `fps: { smoothStep: false }` in the game config when ticks must stay locked to audio, as in rhythm games.

## Engine clocks and randomness stay out of rules

- `this.time.delayedCall`, `this.time.addEvent` and tweens run on the scene clock and its `timeScale`. Use them for presentation only; rule timers are tick counters in the simulation.
- `Phaser.Math.Between` and `Phaser.Math.FloatBetween` call `Math.random()`. `Phaser.Math.RND` is one global generator that any plugin may draw from. Rules use the simulation's `rng`.

## Arcade Physics runs a second clock

Arcade keeps its own accumulator (`physics.arcade.fps`, default 60, with `fixedStep` on) that is unrelated to `SimScene.clock`. A rule that reads Arcade bodies ties the game to that clock and to the browser, so headless scenario runs cannot replay it. Use Arcade either for everything in a prototype without scenario tests, or for nothing that a rule reads.
