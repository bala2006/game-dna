---
name: feedback-and-ui
description: HUD, prompts, notices, menus and sound levels that tell the player what happened and what to do next. Use when players miss information, ask "what now", or the HUD is cluttered.
---

# Feedback and UI

Every action gets an answer. Every available action gets a hint. Every ongoing state has a place on screen. For hit flash, hit-stop and shake, use the game-feel skill.

## Three questions

| Question | Answer with | Rule |
|---|---|---|
| What just happened? | Event feedback: sound, particles, a short text line | Same tick as the event; size matches the event |
| What can I do? | A prompt at the object | Only while the action is possible |
| What state am I in? | A persistent element changes: tint plus icon, shape or pulse | No popup for a state; popups are for events |

## Prompts

- Anchor the prompt to the object in world space and let it follow the object. Fade it in over 100-150 ms when the action becomes possible.
- Show the verb, not only the key. List only verbs that work right now. Context decides the list: target type, held item, companion present.
- Use hold-to-confirm for costly or irreversible acts, with progress drawn at the anchor.

## Event lines and notices

- One line per reward event, stacked newest first, each fading after 1.5-3 s, with a running total beside the stack. Merge lines when more than 4 arrive per second.
- Consequence notices are small and stay in the flow. No pause and no modal. Name the cause.
- Every state that starts with a notice also ends with one.

## States

- Put states on elements the player already watches: the minimap, a health ring, the avatar.
- Pair color with a second cue. Pulse urgent states at 1-2 Hz. Never flash more than 3 times per second.
- Show carried load and gear on the avatar, not only in a menu.

## Remember for the player

- Pin found codes, targets and objectives on screen until they are used. Keep a log the player can reopen.
- Show progress as a checklist on the planning or pause screen.

## Menus

- Give every overlay the same look and timing, so the look itself means "the world is waiting". With WebGL in Phaser 3.60+: `cam.postFX.addColorMatrix().saturate(-0.6)` and `cam.postFX.addBlur()` on open, `cam.postFX.clear()` on close.
- Route all overlays through one helper. Copies drift.

## Guidance

Use the cheapest cue that works: light, leading lines, signs and landmarks first (pacing-and-guidance skill). If a marker is needed, use a small card with the next step and a distance that counts down. Avoid arrows floating over the play area.

## Sound hierarchy

Starting levels for peaks above the ambient bed:

| Tier | Examples | Level above the bed |
|---|---|---|
| Major event | Explosion, level clear | +10 to +14 LU |
| Medium event | Hit, valuable pickup | +4 to +8 LU |
| Minor event | Footstep, UI tick | 0 to +3 LU |
| Ongoing state | Alarm, chase layer | +3 to +6 LU, sustained |
| Planning or menu screen | Map, pause | Bed lowered by 10 LU or more |

- Generate effects with `gd_generate_asset` (`type: "sfx"`) and set levels with the `volume` option of `this.sound.add`.
- Duck the world for menus by tweening each world sound's `volume`.
- Measure a capture: `ffmpeg -i capture.wav -af ebur128 -f null -`. Read the momentary `M:` values at each event.

## Accessibility

- Text is at least 14 px with high contrast (technical-art skill).
- Every color cue has a shape, icon or text cue.
- Important sounds have a visual or caption.

## Verify

| Behavior | Scenario assertion |
|---|---|
| Prompt only in range | Out-of-range scenario: `stateAlways` on `promptVisible` eq false |
| One line per pickup | `eventCount` of `feedLine` and of `pickup`, both eq the same expected count |
| Notices do not pause | `stateAlways` on `paused` eq false while the notice shows |
| Tips show once | `eventUnique` on `tipShown` with `key: "tipId"` |

For layout and readability, take browser screenshots at `checkpoints` and review them at the target viewport.

## Sources

- Norman, *The Design of Everyday Things* (revised edition, 2013): signifiers, feedback and mapping.
- Collins, *Game Sound* (2008): sound as information in games.
- EBU R 128: loudness measurement in LUFS and LU.
- Jonasson and Purho, "Juice It or Lose It" (GDC Europe, 2012).
