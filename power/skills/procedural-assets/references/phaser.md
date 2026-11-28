# Generated assets in Phaser 3.90

## Loading generated files

- SVG at its manifest size: `this.load.svg('player', 'player.svg', { width: 24, height: 30 })`. Without `width` and `height`, Phaser rasterizes at the SVG's own size; a different size later blurs it.
- PNG sprite sheets: `this.load.spritesheet('hero', 'hero.png', { frameWidth: entry.width / entry.frames, frameHeight: entry.height })`, then `this.anims.create({ key: 'hero-walk', frames: this.anims.generateFrameNumbers('hero', { start: 0, end: entry.frames - 1 }), frameRate: pack.motion.animationFps, repeat: -1 })`.
- Load from `assets/generated/` with `this.load.setPath`, the folder `materializeAsset` writes to under `public/`.
- WAV sound effects: `this.load.audio('sfx-jump', 'sfx-jump.wav')`.

## Textures made at runtime

- Simple shapes: draw on a `Graphics`, call `generateTexture(key, width, height)`, then destroy the graphics. Gravity Shift makes its 8 px dust dot this way.
- Per-pixel art: `const tex = this.textures.createCanvas(key, w, h)`, then draw into `tex.getContext()`, or write a generated `rgba` payload with `tex.putData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0)`. Call `tex.refresh()` afterwards to upload it; `putData` alone does not.
- SVG text from `generateAsset` without writing a file: `this.textures.addBase64(key, 'data:image/svg+xml;base64,' + btoa(svg))`. It loads asynchronously; wait for the texture manager's `addtexture-<key>` event before using it.

## Filtering

`pixelArt: true` in the game config sets nearest filtering for every texture. For one crisp texture in an otherwise smooth game, call `texture.setFilter(Phaser.Textures.FilterMode.NEAREST)`.

## Origins

Characters stand on their feet: `setOrigin(0.5, 1)`. Tiles align to the grid with `setOrigin(0, 0)`. Hazard sprites flip for ceilings with `setFlipY(true)` rather than needing a second asset.
