---
name: input-and-controls
description: Maps keyboard, mouse, gamepad and touch onto semantic actions sampled per tick, with latched taps, dead zones, touch overlays, remapping and device prompts. Use when adding a device or when input feels missed, laggy or awkward. Not for look feel (camera-systems), movement (character-movement) or HUD layout (hud-and-menus).
license: MIT
metadata:
  owner: interaction
  topics: input abstraction, semantic actions, keyboard and mouse, gamepads, touch controls, input latching, dead zones, remapping, device prompts
  engines: portable, three@0.170, phaser@3.90
  kit: kit/input, kit/loop, kit/contracts, starter, starter/phaser
---

# Input and controls

## Scope

Owns the path from a device event to an action the rules read: bindings, sampling, latching, dead zones, touch overlays, remapping and prompt labels. When look feels floaty or recenters too soon, use `camera-systems`. When a move is slow to start or stop, use `character-movement`. When HUD readouts collide with thumb zones, use `hud-and-menus`.

## Decisions

- **Rules read actions, never devices.** Declare each action with its kind and devices in the interaction contract; bindings map onto those names, and scenarios script the same names.
- **Latency.** Press to first visible response under about 100 ms, of which browser and display take 40 to 70. Act in the tick that sampled the press; never defer, debounce or smooth a game button.
- **Latch every press.** A press and release between two samples still gives `pressed` for one tick. Compute edges when sampling, not in event handlers. Read look per rendered frame; per tick it judders on 120 and 144 Hz screens.
- **Keyboard:** bind `KeyboardEvent.code`, add arrows beside WASD, ignore `repeat`, prevent the default only for bound keys, release all on `blur` and `visibilitychange`.
- **Mouse:** pointer lock from a click, 0.0015 to 0.003 rad per pixel, raw `movementX`, no acceleration or smoothing, invert-Y option. Losing the lock pauses; Chrome refuses a new lock for about a second after Esc.
- **Gamepad:** poll every tick; trust indices only when `mapping === 'standard'`. Radial dead zone 0.1 to 0.2 rescaled to full range, since worn sticks rest at 0.05 to 0.12. Triggers stay analog; above 0.5 counts as a press.
- **Touch:** floating stick in the left 45%, travel 55 to 65 px, dead zone about 0.12. Buttons at least 48 CSS px (primary 64 to 88), 10 px apart, offset by `env(safe-area-inset-*)`, with a pressed state. Track fingers by `pointerId` with pointer capture.
- **Remapping and prompts:** overrides saved per game, conflicts refused within a context, reset to defaults. Labels follow the bindings and the last device used. No chords; holds can become toggles; no mashing.

## Mistakes

- `event.key` bindings: Shift turns `w` into `W` and AZERTY scatters the movement keys.
- Per-axis dead zones snap diagonals to the axes; without the rescale, speed jumps from 0 to 15% at the edge.
- A key held through alt-tab keeps the character running.
- Single-pointer touch code: pressing GAS drops the steering stick.

## Reuse

`@gamedna/kit/input`: `createInput({ element, bindings, touchLayout, mouseLook, onDevice })` returns `sample()` per tick (`axes`, `held`, `pressed`, `released`, `device`), `takeLook(dt)` per frame, `prompt(action)` and `dispose()`. `BINDINGS` and `TOUCH_LAYOUTS` hold tested `driving` and `onFoot` sets; extend them by spreading. For tests: `createRawState`, `resolveFrame`, `radialDeadzone`, `promptLabel`, `touchLayoutRects`, `auditTouchLayout`, `measureTouchLayout`. `onPageHidden` from `@gamedna/kit/loop` pauses on blur. Phaser starter games bind keys with `SimScene.bindKeys` into the starter's `InputLatch`. The game keeps its action list and settings screen.

## Engines

- three.js 0.170: read `references/three.md` when wiring pointer lock, picking or camera-relative movement.
- Phaser 3.90: read `references/phaser.md` when a starter game needs gamepad, multi-touch or layout-safe keys.
- Default bindings per genre, gamepad indices and the remap format: `references/bindings.md`.

## Verify

- Unit: a key only in `raw.taps` resolves as held, so a sub-tick tap fires `pressed` once.
- Unit: `radialDeadzone` is 0 inside the zone, continuous at its edge and 1 at full diagonal deflection.
- Layout: `auditTouchLayout` is empty at 667x375, 844x390 and 932x430, from `touchLayoutRects` and from `measureTouchLayout()` in the built game.
- Browser: the stub pad from `openGame` in `tests/e2e/kit-browser.ts` switches `device` and prompts; two CDP touch points hold the stick and a button together.
