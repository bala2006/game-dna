---
name: game-feel
description: Impact feedback with numbers. Hit-stop, trauma screen shake, hit flashes, knockback, squash and stretch and easing, keyed to simulation events and honoring reduced motion. Use when hits feel weak, landings flat or effects chaotic. Not for jump arcs (character-movement), damage rules (game-mechanics) or sound (audio-design).
license: MIT
metadata:
  owner: experience
  topics: game feel, hit-stop, screen shake, impact feedback, knockback feel, squash and stretch
  engines: portable, three@0.170, phaser@3.90
  kit: kit/feedback, kit/contracts, starter, starter/phaser
---

# Game feel

## Scope

Owns how an impact, landing or pickup reads in the moment: freeze, shake, flash, push, squash and the curves between. When jumps feel floaty or acceleration slow, use `character-movement`. When damage or invulnerability rules change, use `game-mechanics`. When the hit needs sound, use `audio-design`; particles or new art, `procedural-assets`; a damage number, `hud-and-menus`.

## Decisions

- **Events, same tick.** The simulation emits `hit`, `land` or `pickup` with an id and every layer keys off it, so feedback latency is 0 ticks. Never infer impacts from state diffs in render code.
- **Hit-stop is simulation time.** 40 to 60 ms for a light hit, 80 to 120 ms for a heavy one, up to about 150 ms for a rare finisher (2 to 9 ticks at 60 Hz). Freeze attacker and victim together. A longer request replaces a shorter one, requests never add up, runs are capped, and input is still buffered during the freeze.
- **Shake is trauma.** Add about 0.3 per hit and 0.6 to 1 per explosion, clamp to 1, decay 1 to 2 per second, offset = trauma squared times the maximum. Maximum 4 to 10 px at 540 px tall, 0.05 to 0.3 m in 3D, roll at most 0.05 rad. Use smooth noise at 15 to 25 Hz. Shake follows events, never states; a rumble is a separate, much smaller layer.
- **Apply shake last**, to the rendered camera in camera space; never to stored camera state, world objects or the HUD.
- **Flash** the target solid white for 60 to 100 ms. Screen flashes stay under 40 percent opacity and 150 ms, at most 3 per second.
- **Knockback** is a rules impulse; it reads as 0.1 to 0.25 s of travel away from the attacker, less for heavy bodies, with stun at least as long as the hit-stop. A knocked-back player blinks every 4 ticks through 0.5 to 1 s of invulnerability.
- **Squash and stretch** keeps area (`scaleX = 1 + s`, `scaleY = 1 / (1 + s)`): landing 0.1 to 0.25 recovering over 100 to 200 ms, jump stretch 0.1 to 0.15. Scale the sprite around its feet, never the collision shape.
- **Add layers one at a time**: flash, sound, hit-stop, knockback, particles, shake. Offer a subtle level; stop once the target gets hard to see.
- **Reduced motion** zeroes shake and screen flashes and cuts particles to a few; hit-stop and target flashes stay.

## Mistakes

- Hit-stop by `setTimeout` or pausing the render loop: input drops and replays differ. Unbounded stacking freezes for a second when eight enemies are hit.
- Shake added to `camera.position` and never removed: the view drifts away. Linear trauma: a graze shakes like an explosion.
- Uniform random shake per frame reads as a rendering bug. Squash around the sprite center lifts the feet off the floor.
- A multiply tint as the hit flash on a light sprite shows nothing; a flash on a shared 3D material lights every enemy.

## Reuse

`@gamedna/kit/feedback`: `createShake({ seed, maxOffset, maxAngle, decay, frequency, reducedMotion })` with `add` and `update(dt)` returning `{ x, y, angle }`; `HitStop(cap)` with `request(ticks)` and `consume()` once per tick; `Flash` and `flashLevel(remaining, duration)` for plain-data timers like `enemy.flashTicks`; `Tween` and `EASINGS` (`linear`, `quadOut`, `cubicOut`, `backOut`, `elasticOut`). Convert milliseconds with `ticksFor(contracts, ms)` from `@gamedna/kit/contracts`. Phaser games call `shake(scene, px, ms, reducedMotion, capPx)` from `@gamedna/starter/phaser` and read `reducedMotion` from `loadSettings(gameId)` in `@gamedna/starter`, which defaults to `prefers-reduced-motion`. The game keeps its event-to-layer map and `feedback.*` tuning.

## Engines

- Phaser 3.90: read `references/phaser.md` when wiring shake, flashes, squash or hit-stop into a `SimScene`.
- three.js 0.170: read `references/three.md` when applying shake to a rig camera or flashing meshes.

## Verify

- Unit: two `HitStop.request` calls in one tick freeze for the longer one, and no run exceeds `cap`.
- Unit: `createShake` with `reducedMotion` returns zero offsets while trauma decays; one seed and `dt` sequence give one result.
- Scenario: `computeMetrics` from `@gamedna/core` reports `combat.feedbackLatency` 0 ms and a `combat.hitstopTotal` that grows with landed attacks, as Neon Survivor's `combat-feel` scenario measures.
- Browser: screenshots right after a hit, reduced motion on and off, show the HUD in the same place.
