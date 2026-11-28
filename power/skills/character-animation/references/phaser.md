# Character animation in Phaser 3.90

## Sprite-sheet cycles

- Readable poses run at 8-12 frames per second (the `pixel-adventure` pack uses 8); the simulation keeps its full tick rate.
- Typical frame counts: idle 2-4 frames at 4-6 fps, walk 6-8, run 6-8, jump split into rise, apex and fall frames chosen from vertical speed rather than played as a loop.
- Match the cycle to ground speed so feet do not slide in side view: `sprite.anims.timeScale = speed / authoredSpeed`, where `authoredSpeed` is the stride drawn in the sheet times the frame rate over the frame count.
- Pick the animation from simulation state each frame and call `sprite.anims.play(key, true)`; the `true` keeps a cycle running instead of restarting it.
- Stand sprites on their feet with `setOrigin(0.5, 1)`, so a squash scales from the ground.

## Cutout rigs

- Build a body from a `Container` with one `Image` per segment, each with its origin at the joint (`setOrigin(0.5, 0)` for a limb hanging from its top), nested as the joint hierarchy.
- In side view, the Kit's gait angles apply directly: `gaitPose(layout, phase, speed)` returns hip, knee, ankle, shoulder and elbow angles in the swing plane. Set each segment's `rotation` from them and advance phase with `advanceGait`. The module imports `three`, so the game must install it even though nothing is drawn with it.
- Draw the far-side limbs first and tint them 15-25% darker, so the two legs read apart.

## Squash, stretch and anticipation

- Keep area: `setScale(1 + s, 1 - s)`. Gravity Shift squashes 0.18 on landing and decays it over 400 ms.
- Stretch along velocity at take-off, 0.1-0.15, for one or two frames.
- NPC anticipation as a tween: `this.tweens.add({ targets: sprite, scaleY: 0.85, duration: 80, yoyo: true, ease: 'Quad.easeOut' })` before the attack starts.
- Follow-through on attached parts (a scarf, ears): a child image that rotates toward the opposite of the body's velocity with a damped spring, clamped to about 30°.
