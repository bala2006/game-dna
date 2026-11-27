# Cameras in Phaser 3.90 games

## Follow without frame-rate drift

`cameras.main.startFollow(target, roundPixels, lerpX, lerpY, offsetX, offsetY)` applies its lerp once per rendered frame, so the same value follows faster on a 144 Hz screen. Set it every frame from a time constant instead:

```ts
const k = 1 - Math.exp(-deltaMs / 120); // 120 ms time constant
this.cameras.main.setLerp(k, k);
```

## Dead zone, bounds and look-ahead

- `setDeadzone(width, height)`: 10 to 20 percent of the view wide; the lerp still applies at its edges.
- `setBounds(0, 0, worldWidth, worldHeight)` keeps the void outside the level off screen.
- `setFollowOffset(x, y)` is subtracted from the target position, so a lead to the right is a negative x. Ease the lead toward `-velocityX * 0.3` and cap it at about a fifth of the view width.
- With `pixelArt`, pass `roundPixels` true to `startFollow`, or sprites shimmer by one pixel as the camera moves.

## Platformer vertical follow

Follow a proxy `{ x, y }` object instead of the sprite. Copy `x` every frame; move `y` only when the player lands, or when they leave a band of about a quarter of the view height. Jumps then stop bobbing the whole level.

## Smooth targets

The starter's simulation steps at 60 Hz. On faster screens, store each body's previous position and draw at `prev + (now - prev) * this.clock.alpha` in `renderState`, then let the camera follow the drawn position.

## Zoom, pans and cuts

- `zoomTo(zoom, durationMs)` for 200 to 400 ms push-ins on precise moments; `pan(x, y, durationMs, 'Sine.easeInOut')` for a one-time reveal that player input cancels.
- Cut between rooms or scenes behind `fadeOut(250)`, and continue on the camera's `camerafadeoutcomplete` event.
- Zoom and shake move everything the main camera draws, including text with `setScrollFactor(0)`. When the HUD must stay still, render it from a separate scene; when laying that out, use `hud-and-menus`.
