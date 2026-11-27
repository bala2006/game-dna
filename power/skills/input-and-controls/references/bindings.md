# Default bindings, gamepad indices and remapping

## Defaults per genre

| Genre | Keyboard and mouse | Gamepad (standard mapping) | Touch |
|---|---|---|---|
| Driving | W/S or arrows throttle and brake, A/D steer, Space drift, C camera, R reset, P pause | RT throttle, LT brake, left stick steers, A drift, Y camera, View reset, Menu pause | Horizontal floating stick left; GAS and BRAKE pedals right, DRIFT above GAS, CAM and RESET top right |
| 3D on foot | WASD relative to the camera, mouse look, Space jump, Shift sprint, E interact, V view, Esc or P pause | Left stick moves, right stick looks, A jump, LS click sprints, X interact, Y view, Menu pause | Floating stick left, drag the free right side to look, JUMP, RUN and USE right |
| 2D platformer | Arrows or A/D, Space or W jump, Shift special, R restart | D-pad or left stick, A jump, B or RB special, Menu pause | Horizontal stick or two arrow buttons left, JUMP and the special right |
| Top-down shooter | WASD move, mouse aims, left button fires, Space dashes | Left stick moves, right stick aims, RT fires, A dashes | Move stick left, aim-and-fire stick right |

`BINDINGS.driving` and `BINDINGS.onFoot` implement the first two rows; `TOUCH_LAYOUTS` holds their overlays. Platformers and shooters build their own `Bindings` and `TouchLayout` from the same types.

## Standard gamepad indices

Buttons: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, View 8, Menu 9, LS 10, RS 11, D-pad 12 to 15 (up, down, left, right). Axes: 0 LS X, 1 LS Y, 2 RS X, 3 RS Y. Stick up reads -1, so invert vertical movement (`pad: { axis: 1, invert: true }`). Confirm is A and back is B on every platform the browser exposes; do not swap them by guessing the pad brand.

## Remapping

- Store only the player's overrides, keyed by action and device, next to a bindings version: `{ v: 1, keys: { jump: ['KeyK'] }, pad: { jump: [1] } }`. Merge over the defaults at load; drop entries whose action no longer exists.
- Capture a key with one `keydown` listener that reads `event.code`. Esc cancels the capture and is never bindable, so the menu always stays reachable.
- Refuse a binding that another action in the same context already uses, or offer a swap. Menu actions and gameplay actions are separate contexts.
- Keep a visible "reset to defaults" and rebuild the input after any change, so `prompt()` labels update at once.

## Test shape

```ts
// check: compile
import { BINDINGS, TOUCH_LAYOUTS, auditTouchLayout, createRawState, resolveFrame, touchLayoutRects, type Bindings } from '@gamedna/kit/input';

const onFoot = {
  ...BINDINGS.onFoot,
  buttons: { ...BINDINGS.onFoot.buttons, interact: { keys: ['KeyF'], pad: [2], touch: 'use' } },
} satisfies Bindings;

// A press and release inside one tick leaves the key only in `taps`; it must still count.
const raw = createRawState();
raw.taps.add('Space');
if (!resolveFrame(onFoot, raw).held.has('jump')) throw new Error('sub-tick tap lost');

for (const viewport of [{ w: 667, h: 375 }, { w: 844, h: 390 }, { w: 932, h: 430 }]) {
  const problems = auditTouchLayout({ controls: touchLayoutRects(TOUCH_LAYOUTS.onFoot, viewport), viewport });
  if (problems.length > 0) throw new Error(problems.join('\n'));
}
```

`touchLayoutRects` ignores safe-area insets, so repeat the audit in a browser with `measureTouchLayout()` on a notched viewport.
