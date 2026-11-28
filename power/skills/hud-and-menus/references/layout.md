# DOM HUD layout and the settings screen

## Skeleton

The three.js apps draw the HUD as fixed DOM over the canvas. The pattern:

- Viewport meta: `width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no`.
- `.hud { position: fixed; pointer-events: none; z-index: 10 }`, so readouts never swallow touches meant for the canvas or the touch overlay (the Kit's overlay sits at z-index 20).
- Anchor each block with `calc(16px + env(safe-area-inset-top, 0px))` and the matching side inset; centered blocks use `left: 50%; transform: translateX(-50%)`.
- Give every readout the class `hud` and an `id`. `measureTouchLayout` reads visible `.hud` elements with text as areas the touch buttons must not cover, so a hidden or empty element never fails the audit.
- `text-shadow: 0 1px 4px rgba(0, 0, 0, .55)` keeps white text readable over sky and snow alike.
- For notices a screen reader should hear, set `aria-live="polite"` on the notice element; give the canvas host an `aria-label` that says where the controls are listed.

## Zones on a landscape phone

| Zone | Use |
|---|---|
| Top left, top right | Persistent readouts: lap, time, score, health |
| Top center | View name, short state labels |
| Upper third center | Banners and notices |
| Bottom center | Speed or the one number watched during action |
| Bottom left 45%, bottom right 40% | Thumbs: stick and buttons only |

Trail Walk shifts its top-left block to 84 px because the touch pause button sits at 22 px with a width of 48.

## Breakpoints to check

667x375 (small phone, landscape), 844x390 and 932x430 (notched phones), 390x844 (portrait), 1280x720 and 1920x1080. Wide games in portrait show a short "rotate for the best view" line instead of forcing orientation.

## Settings screen contents

| Group | Items | Default |
|---|---|---|
| Audio | Master, music, effects sliders; mute | Music about 70% of effects |
| Comfort | Reduced motion (shake, flashes, FOV kicks, head bob) | `prefers-reduced-motion` |
| Controls | Look sensitivity, invert-Y, remap, hold or toggle for sprint and aim | Kit binding defaults |
| Display | Text size 100, 125, 150 percent; field of view for first person | 100 percent |
| Access | Captions for gameplay sounds, high-contrast HUD | Off, captions on when sound carries rules |

Save on every change and apply at once; a settings screen with an Apply button loses changes on a crash or a closed tab.
