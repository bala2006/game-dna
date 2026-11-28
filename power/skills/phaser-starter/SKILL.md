---
name: phaser-starter
description: Setting up a Phaser 3.90 game on the GameDNA starter. FixedStepSimulation and SimScene layout, scene lifecycle, loading, tilemaps, scaling, audio unlock and version checks. Use when starting, wiring or upgrading a 2D Phaser game. Not for 3D (threejs-kit), collision (collision-and-response) or generated art (procedural-assets).
license: MIT
metadata:
  owner: engine
  topics: phaser project setup, phaser scene lifecycle, phaser asset loading, tilemaps, phaser version compatibility, starter integration
  engines: phaser@3.90
  kit: starter, starter/phaser, kit/loop
---

# Phaser on the starter

## Scope

Owns how a Phaser game is assembled on `@gamedna/starter`. When bodies collide or tunnel, use `collision-and-response`; when sprites, tiles or sounds must be generated, use `procedural-assets`; when the game is 3D, use `threejs-kit`.

## Decisions

- **Tested: Phaser 3.90.0**, fingerprint `engine.support: "tested"`. For `untested-version`, use only APIs in the installed `phaser/types/phaser.d.ts`, check the Phaser change log for each API the game uses, never upgrade or downgrade without the user's authorization, and report the version and what was checked. Phaser 4 is not tested. PixiJS, Excalibur and Kaplay are `unsupported`: say so and do not port the starter.
- **Code source.** In this repo, `"*"` workspace dependencies on the starter, Kit and core, as in `apps/gravity-shift/package.json`. The Power ships only the Kit, so a project elsewhere copies its `kit/src/` to `src/kit/`, installs `phaser@3.90.0` and writes the simulation base on `FixedStepClock` and `createRng`.
- **Module layout**, as in both Phaser apps: `src/main.ts` calls `bootGame`; `src/game/sim.ts` is a `FixedStepSimulation` holding every rule, with no Phaser import; `src/game/scene.ts` is a `SimScene` that draws and plays sound; `levels.ts` and `tuning.json` hold data.
- **The scene drives the sim.** While `uiMode` is `playing`, `SimScene.update` feeds keys from `bindKeys` to `sim.setInput`, advances a 60 Hz `FixedStepClock` and passes drained events to `onSimEvents`. `renderState(deltaMs)` runs every frame and never changes the sim.
- **`bootGame`:** `Phaser.AUTO`, `Scale.FIT` with `CENTER_BOTH`, `pixelArt` switching antialiasing off and `roundPixels` on, Web Audio, no physics.
- **Load in `preload`** with a relative `this.load.setPath('assets/generated/')`; files queued later need `this.load.start()`.
- **Texture and audio keys are game-wide.** A key already cached is skipped silently, so prefix keys by level or atlas.

## Mistakes

- Overriding `update` without `super.update(time, delta)`: the game draws but nothing moves.
- Per-run state in class fields: `scene.restart()` reuses the instance. Reset in `create()`.
- Listeners on `this.scale`, `this.game.events` or `window` kept after shutdown pile up per restart. Remove them on `Phaser.Scenes.Events.SHUTDOWN`.
- `this.physics` in a starter game: typed, but undefined because `bootGame` names no physics.
- A mistyped texture key draws Phaser's missing-texture box and throws nothing.
- A sim `tickRateHz` other than 60: the scene's clock stays at 60 Hz, so play and scenarios disagree.
- Sounds fired before the first key press or tap all play at once on unlock. Skip them while `this.sound.locked`.
- HUD text looks soft on large screens because FIT scales the canvas with CSS; give HUD text styles `resolution: 2`.

## Reuse

- `@gamedna/starter`: `FixedStepSimulation` (`reset`, `setInput`, `step`, `snapshot`, `drainEvents`, `emit`, `dt`, seeded `rng`), `InputLatch`, `InputFrame`, `num`, `flag`, `msToTicks`, `FixedStepClock`, `loadSettings`, `saveSettings`, `ComfortSettings`.
- `@gamedna/starter/phaser`: `SimScene` (`bindKeys`, `initComfort`, `toggleSetting`, `uiMode`, `onSimEvents`, `renderState`), `bootGame`, `BootOptions`, `shake`, `KeyBindings`, `UiMode`.
- `@gamedna/kit/loop`: `exposeDevHook` for a `?dev` test hook.

The game keeps its rules, level data, art, sounds and HUD.

## Engines

- Phaser 3.90: read `references/phaser.md` when writing a scene, loading assets or building a tilemap level, and `references/compatibility.md` when the installed version differs or an API looks unfamiliar.

## Verify

- `npm ls phaser` shows one `phaser@3.90.0`; `npm run typecheck` passes.
- `grep -n "from 'phaser'" src/game/sim.ts` prints nothing, and the scenario tests run in Node.
- `npm run build -w <app>`, then the Phaser browser smoke test: canvas drawn, Enter starts play, no page or console errors.
- Restart the scene ten times in a dev session; `this.scale.listenerCount('resize')` and `this.children.length` stay flat.
