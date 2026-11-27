# Game architecture in Phaser 3.90 games

## Scene lifecycle

- A scene runs `init(data)`, `preload()`, `create(data)`, then `update(time, delta)` every frame. `this.scene.restart(data)` shuts it down and runs `init`, `preload` and `create` again on the same instance. The constructor and class field initializers do not run again, so reset every field (maps of sprites, counters, flags) in `init` or `create`.
- Shutdown destroys the scene's game objects, its keyboard keys and its keyboard listeners. It leaves listeners on `this.game.events`, `this.scale`, `this.sound`, the registry, `window` and `document`. Remove those in `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)`.
- Restarting a level does not need a Phaser restart. Gravity Shift and Neon Survivor restart through a rule inside the simulation (`restart` input, then `reset` of the run) and keep the scene, its textures and its emitters.
- A HUD can run as a parallel scene started with `this.scene.launch('hud', { sim })`. It reads the simulation and never steps it; only one scene owns `sim.step()`.

## Loader and cache

- Load shared assets once in a boot scene's `preload`, with `this.load.on('progress', (p: number) => ...)` driving a bar, then `this.scene.start('game')`. Textures and audio stay available to every scene.
- JSON content: `this.load.json('levels', 'data/levels.json')` in `preload`, `this.cache.json.get('levels')` in `create`, validated and converted to simulation data once. Tests read the same file from disk, or the game imports it as a module, as Gravity Shift does with `levels.ts` and `tuning.json`. The simulation never reads `this.cache` during a tick.
- Guard optional assets with `this.textures.exists(key)` and `this.cache.audio.exists(key)`, with a generated fallback such as a texture drawn by `Graphics.generateTexture`.

## Entities to game objects

- Keep a `Map<number, Phaser.GameObjects.Sprite>` keyed by simulation id; create, update and destroy views as ids appear and vanish.
- For many short-lived sprites, `this.add.group({ maxSize })` with `group.get(x, y, key)` and `group.killAndHide(sprite)` reuses objects. The cap belongs to presentation; the simulation enforces its own entity cap.
