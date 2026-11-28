# Game feel in Phaser 3.90 starter games

## Shake

The starter's `shake(scene, px, ms, reducedMotion, capPx)` calls `cameras.main.shake(ms, px / scale.width)`. Phaser picks a new uniform random offset every frame, scales the vertical offset by the view height, and moves everything the main camera draws, HUD included. Keep it for bursts of 80 to 120 ms, as both starter games do.

For trauma shake, give HUD objects `setScrollFactor(0)` and shake through the scroll of a camera that is not following anything:

```ts
// renderState(deltaMs)
const o = this.trauma.update(deltaMs / 1000); // createShake({ seed, maxOffset: 8, maxAngle: 0, reducedMotion })
this.cameras.main.setScroll(this.baseScrollX + o.x, this.baseScrollY + o.y);
```

A following camera rewrites its scroll after `update`, so compute the follow yourself and add the offset after it. Leave `maxAngle` at 0 unless the HUD lives in its own scene, because camera rotation turns scroll-fixed text too.

## Flashes

- Target flash: `sprite.setTintFill(0xffffff)` while the timer runs, then `clearTint()`, as Neon Survivor does with `enemy.flashTicks`. `setTint` multiplies, so a white tint on a light sprite shows nothing.
- Screen flash: `cameras.main.flash(90, r, g, b)`, skipped under reduced motion.

## Squash and stretch

Draw the sprite with `setOrigin(0.5, 1)` at the feet so scaling keeps them planted; under reversed gravity use `setOrigin(0.5, 0)` at the head side that touches the surface. Gravity Shift scales around the center, so its feet lift by about 4 px at the top of a landing squash. Decay the squash in `renderState` with `deltaMs`.

## Hit-stop in a `FixedStepSimulation`

Hold a `HitStop` in the simulation. At the start of `update(input)`, copy the edges you must keep into buffers (a jump press into the jump buffer), then `if (this.stop.consume()) return;`. The `InputLatch` clears edges at every step, so a press during the freeze is lost unless it is buffered first. Emit a `hitstop` event with the same `hitId` so metrics can see it.

## Tweens

Phaser tweens run on scene time and keep running through hit-stop and the starter's pause mode. Use them for HUD pops; drive anything that must line up with rules from simulation ticks.
