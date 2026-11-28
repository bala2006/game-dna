# HUD and menus in Phaser 3.90 games

## A HUD that does not shake

Camera shake, zoom and rotation move every object the main camera draws, including text with `setScrollFactor(0)`. For a still HUD, run it as its own scene with its own camera: `this.scene.launch('hud')` from the game scene, and send it values through `this.events` or a shared state object. The starter games draw HUD text in the game scene, so their HUD moves with each shake.

## Size under `Scale.FIT`

`bootGame` uses `Phaser.Scale.FIT` with `autoCenter: CENTER_BOTH`, so the canvas and all its text scale to the window and letterbox. Gravity Shift's 16 px HUD at 960 px wide draws at about 11 CSS px on a 667 px phone and its 14 px hint near 10. Choose canvas font sizes from the smallest supported width, or move text into DOM elements over the canvas, which stay at their CSS size.

## Overlays

- The starter's `uiMode` is `title`, `playing` or `paused`; `SimScene` stops stepping and resets its clock outside `playing`. Draw the overlay from `uiMode` in `renderState` so it can never disagree with the mode.
- Bind pause to both `keydown-P` and `keydown-ESC`, as the starter games do, and add the pad Menu button and a touch button when those devices are supported.
- On a WebGL renderer, `cameras.main.postFX.addColorMatrix().saturate(-0.6)` on open and `cameras.main.postFX.clear()` on close give every overlay the same "world is waiting" look.
- Replace banners instead of stacking them: `this.tweens.killTweensOf(banner)` before starting the next fade, as both starter games do.

## Focus for keyboard and pad

Phaser has no focus system. Keep a selected index per menu, move it on arrow keys and the pad D-pad, confirm on Enter, Space or pad A, go back on Esc or pad B, and draw a ring or arrow on the selected item. Make each item an interactive zone of at least 48 px for touch with `setInteractive()` and `pointerup`.
