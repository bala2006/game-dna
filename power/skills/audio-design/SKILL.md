---
name: audio-design
description: Sound effects, generated sound, adaptive music, mixing buses, ducking, spatial audio and the browser audio unlock. Use when a game is silent on phones, sounds stack into noise, music fights effects or positional sound misleads. Not for visual impact (game-feel) or caption and settings screens (hud-and-menus).
license: MIT
metadata:
  owner: experience
  topics: sound effects, generated sound, adaptive music, audio mixing, spatial audio, audio unlock
  engines: portable, three@0.170, phaser@3.90
  kit: kit/loop, kit/random, assets, starter, starter/phaser
---

# Audio design

## Scope

Owns what plays, how loud, from where, and when audio may start. Sounds react to simulation events and never decide rules. When a hit also needs freeze or shake, use `game-feel`; when captions or sliders need a place on screen, `hud-and-menus`; when sound must match a style pack, `art-direction`.

## Decisions

- **Unlock.** An `AudioContext` starts suspended until a user activation. Activation comes from `keydown` (not Esc), a mouse `pointerdown`, or a touch `pointerup` or `touchend`; a touch `pointerdown` does not count. Create one context per page, `resume()` it in such a handler, retry on later gestures until `state === 'running'`, and suspend it on hidden tabs.
- **Buses.** Effects, music, ambience and UI gains feed a master gain and a limiter (threshold about -6 dB, fast attack), so piled hits cannot clip. Start at effects 0.8, UI 0.6, music 0.35 to 0.5.
- **Levels above the ambient bed.** Major event +10 to +14 LU, medium +4 to +8, minor 0 to +3, a sustained alarm +3 to +6. Pause and map screens lower the world by 10 dB or more; UI sounds stay.
- **Voices.** At most 3 or 4 copies of one sound, stealing the oldest; ignore retriggers within 30 to 50 ms. Eight enemies hit in one tick play one louder hit, not eight identical samples in phase.
- **Variation.** Pitch within 3 to 6 percent and gain within 1 to 2 dB per play from a seeded generator, or rotate 3 or 4 variants made from different seeds.
- **Ducking.** Music drops 6 to 10 dB under a major event or a voice line, attack 50 to 100 ms, release 300 to 800 ms. Move gains with `setTargetAtTime`; writing `.value` mid-sound clicks.
- **Adaptive music.** Layers of one tempo start together and cross-fade over 1 to 2 bars on bar lines as intensity changes, holding each state 4 to 8 s at least. Intensity comes from simulation state; stingers mark events.
- **Spatial.** 3D: listener on the camera, or at the character with camera orientation in third person; reference distance 2 to 5 m, rolloff 1, inverse model; HRTF only for a few key sources. 2D: pan by screen position, never past 0.7.
- **Accessibility.** Separate sliders and a mute; every sound that carries a rule (a warning, an off-screen attack) also has a visual or caption.

## Mistakes

- Context created at load and never resumed, or resumed only on `pointerdown`: silent on phones while desktop works.
- Gain jumps and hard starts or stops without a 5 ms ramp: clicks.
- Sounds triggered from state diffs in render: doubled when two ticks run in one frame, missed when none do.
- Music restarted on every level reload, so two tracks overlap.
- Audio playing on a hidden tab or under pause; a mute that leaves running loops audible.

## Reuse

`onFirstGesture(start)` and `onPageHidden(cb)` from `@gamedna/kit/loop`; the first listens to `pointerdown` and `keydown` only, so also resume on `pointerup` for touch. `synthesizeSfx(kind, seed, style)` from `@gamedna/assets` returns a deterministic 16-bit mono WAV at `SFX_SAMPLE_RATE` (22,050 Hz) for each kind in `SFX_KINDS` (jump, land, hit, pickup, explosion, pulse, ui, death, win); the style picks square, saw or sine. `createRng(deriveSeed(seed, 'audio'))` from `@gamedna/kit/random` seeds variation. `loadSettings` and `saveSettings` from `@gamedna/starter` persist `muted`; `SimScene.toggleSetting('muted')` applies it to Phaser. Ridgeline Racer's `src/audio.ts` is a synthesized engine loop. The game keeps its event-to-sound map and its mix.

## Engines

- three.js 0.170: read `references/three.md` when adding a listener, positional sounds or decoding generated buffers.
- Phaser 3.90: read `references/phaser.md` when loading, unlocking, ducking or panning through Phaser's sound manager.
- Bus graph, limiter and ducking code for any engine: `references/mixing.md`.

## Verify

- Browser, touch context: tap once and assert `ctx.state === 'running'` through the dev hook.
- Hit eight targets in one tick: the dev hook shows at most the voice cap of that sound playing.
- Hide the tab: the context reports `suspended`; pause: world buses read at least 10 dB down.
- Capture a session and run `ffmpeg -i capture.wav -af ebur128 -f null -`; momentary peaks per event tier fall in the level table, and no sample clips.
