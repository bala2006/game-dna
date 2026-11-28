# Rendering in Phaser 3.90

Everything here needs the WebGL renderer. Under Canvas, lights and FX silently do nothing; check `game.renderer.type === Phaser.WEBGL` before relying on them.

## 2D lights

- `this.lights.enable().setAmbientColor(0x303040)`, then `sprite.setPipeline('Light2D')` on each lit sprite and `this.lights.addLight(x, y, radius, color, intensity)` per lamp.
- Normal maps make lights read as shape: load `this.load.image('wall', ['wall.png', 'wall_n.png'])`.
- At most `render.maxLights` lights (default 10) affect a camera at once. Put one light at each visible lamp sprite and fake the rest with additive glow sprites.
- Ambient by area type: tween the ambient color as the player crosses an area boundary, over 300-800 ms.

## FX

- `postFX` on a camera or game object runs after it renders; `preFX` on a texture-based object runs on its texture. `addBloom`, `addGlow`, `addVignette`, `addShadow`, `addColorMatrix`.
- Each FX is an extra full pass over its target. Put bloom or glow on the few sources that need it, not on the camera.
- Raster-pixel games: no bloom or blur, which smears pixels.

## Blend modes

- `Phaser.BlendModes.ADD` for glows, sparks and light shafts.
- An area tint without lights: a full-screen rectangle with `Phaser.BlendModes.MULTIPLY` whose color and alpha tween on area change.

## Particles

`this.add.particles(x, y, texture, config)` returns an emitter. For bursts, set `emitting: false` and call `emitter.explode(count, x, y)` on the simulation event, as Gravity Shift does for dust.

A generated `particles` asset from `@gamedna/assets` maps onto the config:

| Asset field | Emitter config |
|---|---|
| `speed.min`, `speed.max` | `speed: { min, max }` |
| `angle` | `angle: { min, max }` |
| `lifetimeMs` | `lifespan: { min, max }` |
| `scale.start`, `scale.end` | `scale: { start, end }` |
| `gravity` | `gravityY` |
| `colors` | `tint` (as numbers) |
| `blend: 'add'` | `blendMode: 'ADD'` |
| `count` | `explode` count |
| `reducedMotion` | Count and speed multiplier when reduced motion is on |

Each emitter pools its own particles. Cap `maxParticles` so a burst storm cannot grow without limit.
