# Input in Phaser 3.90 games

## Keys follow the layout

Phaser's keyboard plugin matches `event.keyCode`, which follows the active layout for letter keys. A binding to `W` lands on a different physical key on AZERTY. Always pair letters with arrows, as the starter games do (`left: ['LEFT', 'A']`), or read the keyboard through the Kit's `createInput`, which binds `event.code`.

## What `bootGame` leaves off

- Gamepads: `bootGame` sets no `input.gamepad`, so `this.input.gamepad` is unavailable. Either pass your own Phaser config with `input: { gamepad: true }`, or read pads through the Kit's `createInput`, which polls `navigator.getGamepads()` itself.
- Multi-touch: Phaser tracks one touch pointer by default (`input.activePointers` is 1). Call `this.input.addPointer(2)` in `create` before showing a stick and two buttons, or use the Kit overlay, which tracks every `pointerId` on its own DOM layer.

## Kit input in a starter scene

`SimScene` polls only the keys given to `bindKeys` and feeds them to `sim.setInput(action, down)`. To add pad and touch, create `createInput({ element: this.game.canvas, bindings, touchLayout })` in `create`, override `update(time, delta)`, and before calling `super.update(time, delta)` forward every button action with `sim.setInput(name, frame.held.has(name))` from one `input.sample()`. The starter's `InputLatch` keeps the press edge until the next simulation step, so a tap still lands when a frame runs several ticks. `setInput` carries booleans only; an analog axis needs its own field on the simulation that the game sets the same way. Route each action through one source: bound in both `bindKeys` and the Kit, one source releases what the other holds.

The Kit's `TOUCH_LAYOUTS` cover driving and on-foot play. A platformer needs its own layout, such as `{ stick: 'x', buttons: [{ id: 'jump', label: 'JUMP', size: 80, right: 30, bottom: 36 }] }`, and `auditTouchLayout` against the HUD.

## Scale and pointer coordinates

With `Phaser.Scale.FIT`, read `pointer.worldX` and `pointer.worldY` (or `pointer.x` and `pointer.y` for screen space in game pixels). Do not use `event.clientX` on the canvas; it ignores the letterbox and the scale.
