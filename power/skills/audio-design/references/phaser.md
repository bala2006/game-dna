# Audio in Phaser 3.90 games

## Unlock

Phaser's Web Audio sound manager unlocks itself: it listens on the page body for `touchstart`, `touchend`, `mousedown`, `mouseup` and `keydown`, then resumes its context. Until then `this.sound.locked` is true. Sounds started while locked are scheduled on a suspended context and all fire together at the unlock, so skip effects while `this.sound.locked` and start music from the `Phaser.Sound.Events.UNLOCKED` event or after the first title-screen key, as the starter games do on Enter.

## Loading generated sounds

The starter games write WAV files at build time through `materializeAsset` from `@gamedna/assets/node` with `type: 'sfx'`, which calls `synthesizeSfx` (see `apps/gravity-shift/scripts/generate-assets.ts`), and load them with `this.load.audio(key, file)`. To generate at runtime instead, pass the bytes to `this.sound.decodeAudio(key, bytes.slice().buffer)` and play the key after the `decoded` event.

## Levels and buses

Phaser has no buses. Keep a category volume table (`sfx`, `music`, `ui`) and multiply it into the `volume` of each `this.sound.play(key, { volume })` call. Duck music by tweening the music instance: `this.tweens.add({ targets: music, volume: 0.2, duration: 80 })`, then back over 500 ms. `this.sound.mute` is the global mute that `SimScene.toggleSetting('muted')` sets.

Use `detune` (cents) in the play config for pitch variation: plus or minus 50 to 100 cents covers 3 to 6 percent.

## Panning and spatial sound

- Stereo: set `pan` in the play config from the source's screen position, `(x - cameraCenterX) / (halfWidth) * 0.7`, clamped to plus or minus 0.7.
- Positional: pass `source: { x, y, refDistance, follow }` in the sound config and call `this.sound.setListenerPosition(cam.midPoint.x, cam.midPoint.y)` each frame. Use a `refDistance` of about a quarter of the view width so on-screen sounds stay near full volume.

## Blur and pause

`this.sound.pauseOnBlur` is true by default, so Phaser suspends its audio context when the window loses focus and resumes it on focus. The starter's pause mode does not touch audio; duck or pause loops yourself when `uiMode` becomes `paused`.
