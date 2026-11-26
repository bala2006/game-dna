---
name: controls-and-input
description: Keyboard, mouse, gamepad and touch mapped to actions. Default bindings, mouse look, on-screen sticks and buttons, latched taps, prompts and rebinding. Use when adding controls or mobile support, or when input is missed or awkward.
---

# Controls and input

The simulation reads actions, never devices. Devices map to actions through one data table.

## The data shape

```js
const bindings = {
  axes: { steer: { keys: [['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']], pad: { axis: 0 }, touch: 'stickX' } },
  buttons: { jump: { keys: ['Space'], pad: [0], touch: 'jump' } },
  look: { mouse: 0.0022, touch: 0.006, pad: { x: 2, y: 3, speed: 2.6 }, invertY: false },
};
```

- An axis is -1 to 1, or 0 to 1 for triggers and pedals. Key lists are `[negative, positive]`.
- Sample actions once per fixed tick: `held`, `pressed` and `released`. Latch every press until the next sample, so a tap shorter than a tick still counts.
- Look is camera presentation. Read it once per rendered frame, apart from the tick.
- `@gamedna/kit/input` implements this for the browser: `createInput({ element, bindings, touchLayout, mouseLook })` returns `sample()`, `takeLook(dt)`, `prompt(action)` and `device`. `BINDINGS.driving`, `BINDINGS.onFoot` and the matching `TOUCH_LAYOUTS` hold the driving and 3D-on-foot rows below; extend them by spreading. The pure `resolveFrame` and `resolveLook` take the raw state, so they work in tests.
- In a GameDNA Phaser project, send action names, not key names, through `setInput(action, down)`. The starter's `InputLatch` keeps the edges, and scenarios script the same action names.

## Default bindings

Give every action two keyboard bindings when the keyboard has room, such as WASD and arrows.

| Genre | Keyboard and mouse | Gamepad (standard mapping) | Touch |
|---|---|---|---|
| Driving | W/S or arrows to throttle and brake, A/D to steer, Space to drift, C for camera, R to reset, P to pause | LT brake, RT throttle, left stick steers, A drift, Y camera, Menu pauses | Floating steer stick left; GAS and BRAKE pedals right; DRIFT above GAS; CAM and RESET top right |
| 3D on foot | WASD relative to the camera, mouse look, Space jump, Shift sprint, C or Ctrl crouch, E interact, mouse buttons act, Esc pause | Left stick moves, right stick looks, A jump, X interact, RT and LT act, LS click sprints | Floating move stick left, drag the right half to look, jump and action buttons right |
| 2D platformer | Arrows or A/D, Space or Z jump, X act, Shift dash | D-pad or left stick, A jump, X act, RB dash | Left and right buttons left, jump and act right |
| Top-down | WASD move, mouse aims, left button fires, Space dashes | Left stick moves, right stick aims, RT fires | Move stick left, aim-and-fire stick right |

Gamepad indices: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, View 8, Menu 9, LS 10, RS 11, D-pad 12-15. Up on a stick reads -1, so invert the vertical move axis.

## Keyboard

- Use `event.code`, which names the physical key, so WASD works on any layout. Show labels from it.
- Prevent the browser default only for bound keys. Ignore `event.repeat`.
- Release everything on `blur` and on `visibilitychange`. Otherwise a key stays held after the player switches windows.
- No action needs a chord. Holds can become toggles in settings.

## Mouse

- Mouse look needs pointer lock: call `requestPointerLock()` from a click. Esc releases it. Say "click to look" in the hint.
- Sensitivity is radians per pixel; start at 0.0022. Offer a slider and an invert-Y option. No smoothing or acceleration on aim.
- Strategy and menu-heavy games use drag-to-look (`mouseLook: 'drag'`) instead of lock.
- The wheel zooms or cycles. Block the context menu on the canvas.

## Gamepad

- Poll `navigator.getGamepads()` every tick. Pads connect and disconnect at any time.
- Apply a radial deadzone of 0.12-0.2 to each stick, then rescale to the full range.
- Triggers are analog: use them for throttle, brake and aim strength.

## Touch

Show touch controls when `(pointer: coarse)` matches or on the first touch. Hide them when another device is used.

- Movement goes under the left thumb as a floating stick: it appears where the thumb lands in the left 45% of the screen. Base 120-140 px, travel radius 55-65 px.
- Actions go under the right thumb. Primary buttons are 64-88 px, secondary ones at least 48 px, with 10 px or more between them. Pedals are taller than wide.
- Dragging the free right half of the screen looks around.
- Track each finger by `pointerId` with `setPointerCapture`, so a stick and two buttons work at once.
- Set `touch-action: none` and `user-select: none` on the overlay, and add `viewport-fit=cover` to the viewport meta. Offset every control by `env(safe-area-inset-*)`.
- Keep the HUD clear of the thumb zones: move readouts to the top corners and the bottom center. No button may cover a HUD readout.
- Show a pressed state on every button. Vibrate 8-10 ms where `navigator.vibrate` exists.
- Wide games ask for landscape; they do not force it.

## Prompts and device switching

The last device used decides the prompt labels and whether the touch overlay shows. Labels come from the bindings, so a rebinding changes them too. `input.prompt('jump')` returns "Space", "A" or the touch label.

## Rebinding and accessibility

- Bindings are data. Save the player's changes in `localStorage` per game, and offer a reset to defaults.
- Every action is reachable with one hand on one device. No timed button mashing.
- Pause on blur on all platforms.

## Verify

| Check | How |
|---|---|
| Keyboard actions | Playwright `keyboard.down`, then assert the state through a dev-only `window.__game` hook |
| Quick taps latch | `keyboard.press` one frame apart; the action fires once |
| Gamepad | `addInitScript` that replaces `navigator.getGamepads` with a stub pad you set from the test |
| Touch, multi-finger | A context with `hasTouch: true, isMobile: true`, then CDP `Input.dispatchTouchEvent` with two touch points |
| Touch layout | `auditTouchLayout(measureTouchLayout())` at 667x375, 844x390 and 932x430: no button under 48 px, closer than 10 px, off screen or over a HUD readout. `touchLayoutRects` runs the same audit in a unit test |
| Mouse look | Add to the raw look delta through the hook; the camera moves, then recenters |

`tests/e2e/kit-browser.ts` has the stub gamepad, the touch helper and a static server for a built game. In a Phaser project, a scenario's input lines use the same action names, so `gd_run_scenario` covers the rules.

## Sources

- W3C, *Gamepad* (standard gamepad mapping); W3C, *Pointer Lock 2.0*; W3C, *Pointer Events Level 3*.
- W3C, *WCAG 2.2*, success criteria 2.5.5 and 2.5.8 (target size).
- Game Accessibility Guidelines (gameaccessibilityguidelines.com): remapping, one-handed play, no mashing.
- Apple *Human Interface Guidelines* and Google *Material Design*: 44 pt and 48 dp minimum touch targets.
