# Phaser version notes

Every statement below was checked against the installed `phaser` 3.90.0 source and its bundled `types/phaser.d.ts`.

## Checking an installed version

1. `npm ls phaser`: one copy. Phaser ships its own typings, so there is no separate types package to match.
2. Read the profile's `engine.version` and `engine.support`. For `untested-version`, grep `node_modules/phaser/types/phaser.d.ts` for each API in the table below before using it.
3. Read the Phaser change log for every release between the tested one and the installed one, and list each change to an API the game or the starter uses.
4. Run `npm run typecheck`, the scenario tests and the Phaser browser smoke test. Report the version, what was checked, and what was not.

Do not bump or roll back `phaser` to silence an error. Changing the pin is the user's decision, and after it every scenario, property and browser test runs again.

## APIs the starter and apps rely on

| API | Used by | Note in 3.90 |
|---|---|---|
| `new Phaser.Game(config)` with `type: Phaser.AUTO` | `bootGame` | WebGL with a Canvas fallback |
| `scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }` | `bootGame` | The game config has no `resolution` field; text has `resolution` in its style |
| `pixelArt` | `bootGame` | Also turns on `roundPixels` |
| `fps: { smoothStep }`, `game.loop.rawDelta` | timing | `delta` is clamped and averaged over `deltaHistory` (10) frames; `rawDelta` is not |
| `this.input.keyboard.addKey(name, true)` | `SimScene.bindKeys` | `this.input.keyboard` is typed `KeyboardPlugin \| null`; `true` captures the key so arrows and space do not scroll the page |
| `this.add.particles(x, y, texture, config)` | both apps | Returns a `ParticleEmitter`; the emitter-manager class from older 3.x releases is gone |
| `this.load.svg(key, url, { width, height })` | both apps | Rasterizes the SVG once at that size |
| `Graphics.generateTexture(key, w, h)` | both apps | Draws into the existing canvas texture when `key` already exists |
| `map.createLayer(id, tileset, x, y)` | tilemaps | Returns `TilemapLayer \| null`; named `createDynamicLayer` before 3.50, and `createStaticLayer` is gone |
| `map.addTilesetImage(name, key, tileWidth, tileHeight, tileMargin, tileSpacing)` | tilemaps | Returns `Tileset \| null` |
| `this.sound.locked`, `Phaser.Sound.Events.UNLOCKED` | audio | Web Audio unlock on the first touch, mouse or key event |
| `Phaser.Scenes.Events.SHUTDOWN`, `DESTROY` | lifecycle | Scene system events on `this.events` |
| `Phaser.Loader.Events.FILE_LOAD_ERROR`, `PROGRESS`, `COMPLETE` | loading | Loader events on `this.load` |

## Behaviors that surprise

- `this.physics` is typed as always present but exists only when the game or scene config names a physics system. `bootGame` names none.
- A missing texture key draws Phaser's `__MISSING` texture without a warning.
- The loader silently skips a file whose key is already in the texture manager or cache.
- `scene.restart()` reruns `init`, `preload` and `create` on the same instance; the constructor and field initializers do not run again.

## Not covered

- Phaser 4: a new renderer and changed APIs, not tested with GameDNA. Treat it as `untested-version` at best and verify every call against its typings.
- Matter physics, the Spine plugin, `this.add.dom` elements and FX pipelines (`preFX`, `postFX`, WebGL only): present in 3.90, not used or tested by the starter.
