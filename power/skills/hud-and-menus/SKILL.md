---
name: hud-and-menus
description: HUD readouts, prompts, notifications, pause and settings menus that stay readable on phones and desktops, with safe areas, text sizes and accessibility settings. Use when players miss information, the HUD clutters or menus fail on a device. Not for controls (input-and-controls) or impact effects (game-feel).
license: MIT
metadata:
  owner: experience
  topics: hud, menus, responsive ui, pause and settings, notifications, accessibility
  engines: portable, phaser@3.90
  kit: kit/input, kit/loop, starter, starter/phaser
---

# HUD and menus

## Scope

Owns what the screen tells the player outside the world: readouts, prompts, notices, overlays, pause and settings, and their accessibility. When bindings or touch buttons are the question, use `input-and-controls`; for flash or shake on a hit, `game-feel`. When the player must be led somewhere, use `pacing-and-onboarding` before adding a marker; for palette and type style, `art-direction`.

## Decisions

- **Three channels.** What happened: a notice in the tick of the event. What can I do: a prompt at the object while the action is possible, verb plus device label. What state am I in: a persistent element that changes, never a popup.
- **Placement.** Readouts in the top corners and bottom center; on touch, keep the bottom 40% of both sides free for thumbs. Offset fixed elements by `env(safe-area-inset-*)` plus 16 to 20 px, with `viewport-fit=cover`; landscape iPhone insets are about 47 to 59 px.
- **Text size.** At least 14 CSS px, 16 for anything read during action, 11 to 12 only for spaced capital labels. A canvas scaled to fit shrinks its text: 16 px at 960 design width renders near 11 on a 667 px phone. Size canvas text at least `14 * designWidth / smallestViewportWidth`.
- **Contrast.** 4.5:1 for text, 3:1 for icons; a shadow or plate over 3D scenes; `tabular-nums` for changing numbers.
- **Notices.** One line per event, newest first, 1.5 to 3 s each, at most 4 visible, repeats merged ("+3"). Center banners last 1 to 1.5 s and replace each other. Routine events never pause or open a modal.
- **Pause.** Esc, P, pad Menu and a touch button of at least 48 px all pause. Pause on blur, on hidden tabs and when pointer lock drops. Pausing stops the simulation clock and resets it on resume, so no burst of catch-up ticks kills the player. Resume needs an explicit action.
- **Menus.** Every overlay works with keyboard, pad (D-pad or stick, repeat after 400 ms then every 80 to 120 ms) and touch. Focus starts on the first item with a visible ring; A or Enter confirms, B or Esc goes back. Open and close in 150 to 250 ms, one shared look, at most two levels below pause.
- **Settings** cover volumes, mute, reduced motion (default from `prefers-reduced-motion`), look sensitivity, invert-Y, remapping, text size and captions, saved per game on every change.
- **Never color alone**: pair it with shape, icon, text or motion. Hints follow the last device; touch players see no key names.

## Mistakes

- A readout under a touch button or the notch.
- Proportional digits: the speedometer jitters sideways as it changes.
- Banners driven by wall-clock `setTimeout` keep firing during pause; guard them by game phase, as Ridgeline Racer's finish card does.
- Menus that only respond to clicks; a pause that resumes on any key.

## Reuse

`createInput` from `@gamedna/kit/input` gives `prompt(action)` and an `onDevice` callback to rewrite hints, as Ridgeline Racer's `updateHint` does. `measureTouchLayout('.hud')` collects visible `.hud` readouts as `avoid` rects for `auditTouchLayout`. `onPageHidden` from `@gamedna/kit/loop` triggers pause. `loadSettings(gameId)` and `saveSettings(gameId, s)` from `@gamedna/starter` persist `reducedMotion` and `muted`; `SimScene` from `@gamedna/starter/phaser` holds `uiMode` (`title`, `playing`, `paused`), steps only while `playing` and offers `toggleSetting`. The game keeps its markup, copy and layout.

## Engines

- Portable DOM HUD over any canvas: read `references/layout.md` when building the HUD skeleton, zones or settings screen.
- Phaser 3.90: read `references/phaser.md` when the HUD or menus render inside Phaser.

## Verify

- `auditTouchLayout(measureTouchLayout())` returns nothing at 667x375, 844x390 and 932x430 with a notch inset.
- Screenshot title, play, pause and end at 667x375, 1280x720 and 1920x1080; every text line measures at least 14 CSS px (DOM `getBoundingClientRect`, or canvas font size times the scale).
- Scenario: the prompt is visible only in range (`stateAlways` on the prompt flag out of range), and notices never set `paused`.
- Hide the tab for 5 s and return: the pause overlay shows, and the first frame back runs at most `maxStepsPerFrame` ticks.
