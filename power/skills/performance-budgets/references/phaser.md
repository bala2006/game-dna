# Budgets in Phaser 3.90 games

## Measuring

- The `delta` passed to `update(time, delta)` is clamped and averaged over the last 10 frames, so it hides spikes. Feed the frame sampler and the quality governor `this.game.loop.rawDelta` instead.
- `this.game.loop.actualFps` updates once a second and is smoothed; use it for an on-screen readout, not for budget checks.
- Phaser 3.90 has no WebGL draw-call counter. Measure calls with the browser's performance panel or a WebGL inspector, and reason about batch breaks: a change of texture beyond the batch's texture units, blend mode, mask, pipeline or FX ends the current batch.
- `this.children.length` is the scene's display-list size. Hundreds of hidden but active objects still cost update time.

## Batching

- Pack sprites that draw together into one atlas (`this.load.atlas` or `this.load.multiatlas`). Keep atlas pages at 2048 x 2048 or smaller for phones, about 16 MB each uncompressed.
- Every `Text` object owns a canvas texture that is redrawn and uploaded when its string changes. `setText` skips identical strings, so set HUD text only when the value changes, and use `BitmapText` for numbers that change every frame.
- `this.load.svg(key, url, { width, height })` rasterizes at the given size. Memory follows that size, not the SVG file size, and scaling the image up later blurs it.
- Set `maxParticles` on every emitter. The default, 0, means no limit.

## Pooling

- Pool rule-side entities in the simulation with `createPool`, so scenario tests see the same caps as the game.
- Pool the drawing side with a Phaser group: `this.add.group({ classType: Phaser.GameObjects.Image, defaultKey: 'bullet', maxSize: 200 })`. `group.get(x, y)` returns an inactive member or a new one, and null once `maxSize` members are active; `group.killAndHide(obj)` returns one. Size the group to the simulation pool's `max`.
- Never `destroy()` and re-create objects per shot or per hit.

## Memory across scenes

- Scene shutdown destroys the scene's display list, tweens, timers and input listeners. Textures and cached audio live in game-wide managers and survive it.
- Free a level's textures with `this.textures.remove(key)` and its audio with `this.cache.audio.remove(key)` when no later scene uses them.
- Load the next level's files in a loading scene, or during play with `this.load` calls followed by `this.load.start()`, rather than all in the first `preload`.
