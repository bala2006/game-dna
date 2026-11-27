# Wiring a Phaser 3.90 game

## Contents

- A complete SimScene game
- Scene lifecycle
- Loading
- Tilemaps
- Scaling
- Audio unlock
- Outside this repository

## A complete SimScene game

```ts
// check: compile
import Phaser from 'phaser';
import type { FlatState, RawEvent } from '@gamedna/core';
import { exposeDevHook } from '@gamedna/kit/loop';
import { FixedStepSimulation, num, type InputFrame } from '@gamedna/starter';
import { SimScene, bootGame, shake } from '@gamedna/starter/phaser';

// src/game/sim.ts: every rule, no Phaser import.
class DashSim extends FixedStepSimulation {
  x = 0;
  constructor() { super({ 'movement.speed': 180 }); }
  protected onReset(): void { this.x = 0; }
  protected update(input: InputFrame): void {
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    this.x = Math.max(-400, Math.min(400, this.x + dir * num(this.params, 'movement.speed', 180) * this.dt));
    if (input.wasPressed('right') || input.wasPressed('left')) this.emit('dash', { x: this.x });
  }
  snapshot(): FlatState { return { 'player.x': this.x }; }
}

// src/game/scene.ts: draws the sim and owns sound and HUD.
class DashScene extends SimScene<DashSim> {
  protected readonly gameId = 'dash';
  private hero!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;

  constructor() { super('dash'); }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => console.error(`asset failed: ${file.key}`));
    this.load.setPath('assets/generated/');
    this.load.svg('dash-hero', 'player.svg', { width: 24, height: 30 });
    this.load.audio('dash-sfx', 'sfx-jump.wav');
  }

  create(): void {
    this.initComfort();
    this.uiMode = 'title';
    this.sim = new DashSim();
    this.sim.reset(1, {});
    this.hero = this.add.image(480, 300, 'dash-hero');
    this.hud = this.add.text(12, 8, '', { fontSize: '16px', resolution: 2 });
    this.bindKeys({ left: ['LEFT', 'A'], right: ['RIGHT', 'D'] });
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.uiMode === 'title') this.uiMode = 'playing'; });
    const onResize = (): void => { this.hud.setPosition(12, 8); };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }

  protected onSimEvents(events: RawEvent[]): void {
    for (const e of events) {
      if (e.type !== 'dash') continue;
      shake(this, 4, 80, this.settings.reducedMotion, 6);
      if (!this.sound.locked && !this.settings.muted) this.sound.play('dash-sfx', { volume: 0.45 });
    }
  }

  protected renderState(): void {
    this.hero.x = 480 + this.sim.x;
    this.hud.setText(this.uiMode === 'playing' ? `x ${Math.round(this.sim.x)}` : 'Press Enter');
  }
}

// src/main.ts
const scene = new DashScene();
bootGame({ parent: 'game', width: 960, height: 540, backgroundColor: '#101418', scene });
exposeDevHook({ get state() { return { ui: scene.uiMode, ...scene.sim?.snapshot() }; } });
```

- The loader error goes to `console.error`, so browser tests that fail on console errors catch a missing file.
- The keyboard listener needs no cleanup: the scene's keyboard plugin drops its keys and listeners on shutdown. The `this.scale` listener does, because the scale manager belongs to the whole game.
- Restart a run with the sim's own restart rule and `sim.reset(...)`, as both Phaser apps do, and rebuild only the level's views. `scene.restart()` is for leaving the scene's state entirely.

## Scene lifecycle

| Call or event | When | Use it for |
|---|---|---|
| `init(data)` | Before loading, on every start and restart | Read `data`, reset plain fields |
| `preload()` | Before `create`, on every start | Queue files; the loader runs after it returns |
| `create(data)` | After loading | Build the sim, objects, input and listeners |
| `update(time, delta)` | Every frame while running | `SimScene` steps the sim here; call `super.update` when overriding |
| `Phaser.Scenes.Events.SHUTDOWN` | `scene.start` of another scene, `scene.stop`, `scene.restart` | Remove listeners on game-wide objects; destroy sounds made with `this.sound.add` |
| `Phaser.Scenes.Events.DESTROY` | Scene removed or game destroyed | Final cleanup |

Shutdown destroys the display list, tweens, timers and the scene's input listeners. It leaves textures, cached audio, the scale manager, `this.registry`, `this.game.events` and DOM listeners in place. `pause()` and `sleep()` stop `update` but keep all state.

## Loading

- Files under `public/` are copied to the build root. Load them with a relative `this.load.setPath('assets/generated/')`, never an absolute `/assets/`, so the build runs from a subfolder.
- `this.load.svg(key, file, { width, height })` rasterizes at that size, `this.load.image`, `this.load.spritesheet(key, file, { frameWidth, frameHeight })`, `this.load.atlas(key, png, json)`, and `this.load.audio(key, [ogg, m4a])`, which picks the first format the browser plays.
- Progress: `this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => bar.setScale(p, 1))` in a small loading scene that starts the game scene on `Phaser.Loader.Events.COMPLETE`.
- Files queued after `preload` load only after `this.load.start()`.
- A key that already exists is skipped without a warning, so a restart reuses the first file and two levels that share a key share one texture. `textures.exists(key)` is the check before generating a texture.

## Tilemaps

- Export from Tiled as JSON with tilesets embedded and layers in CSV or uncompressed Base64. Phaser 3.90 warns and skips external tilesets and compressed layers.
- Put the map in `src/game/maps/` and import it as JSON. The sim reads solidity from the same object, so scenario tests in Node see the real level, and the scene hands it to Phaser with `this.load.tilemapTiledJSON('level-1', level1Json)`.
- In the sim, mask Tiled's flip and rotation bits with `gid & 0x0fffffff`, subtract the tileset's `firstgid`, and read the tile's custom properties (for example `solid`) into a boolean grid for `moveAndCollideTiles`.
- In the scene: `const map = this.make.tilemap({ key: 'level-1' })`, `const tiles = map.addTilesetImage('terrain', 'terrain-tiles')` (the Tiled tileset name, then the texture key), `const ground = tiles ? map.createLayer('ground', tiles) : null`. Both return null on a name mismatch; throw with the level and layer name.
- Thin lines between tiles while the camera scrolls: extrude each tile by 1 px and pass `tileMargin` 1 and `tileSpacing` 2 to `addTilesetImage`, or boot with `pixelArt: true`.

## Scaling

`bootGame` uses `Scale.FIT` with `CENTER_BOTH`: the game keeps its logical size (960 x 540 in both apps) and the canvas is scaled with CSS and letterboxed. Lay out in game units from `this.scale.width` and `this.scale.height`; pointer coordinates arrive in game units. Give the parent element the full viewport, as both apps' `index.html` do. A layout that must fill any aspect ratio needs `Scale.RESIZE` and a custom config instead of `bootGame`.

## Audio unlock

Web Audio starts locked. Phaser unlocks it on the first touch, mouse button or key event on the page and then emits `Phaser.Sound.Events.UNLOCKED`. A title screen that waits for Enter or a tap doubles as the unlock. Start music in `this.sound.once(Phaser.Sound.Events.UNLOCKED, start)` when `this.sound.locked` is true, and apply the saved mute with `this.sound.mute = this.settings.muted`. When the sound design itself is the question, use `audio-design`.

## Outside this repository

The Power ships the Kit, not the starter or core. Copy the Power's `kit/src/` into `src/kit/` and write a small simulation base that keeps the same shape: `tickRateHz`, `reset(seed, params, setup)`, `setInput(key, down)`, `step()`, `snapshot()`, `drainEvents()`, `currentTick()`, with `createRng` from `./kit/random.js` for randomness. Drive it from the scene's `update` with `FixedStepClock` from `./kit/loop.js`. Keeping that shape lets the game adopt `@gamedna/core` scenario runs later without touching its rules.
