---
name: game-feel
description: Jump arcs, coyote time, input buffering, hit-stop, knockback, flash and shake, with numbers. Use when jumping or combat feels floaty, stiff, sluggish or weak.
---

# Game feel

Game feel is tuned, not guessed. Translate the user's adjective into parameters, propose 2-3 alternatives, measure them, and let the user play and choose (refinement skill).

## Vocabulary to parameters

| The user says | Likely cause | Parameters to vary |
|---|---|---|
| "floaty" | low gravity, long airtime | `movement.gravity` up, `movement.jumpVelocity` up to keep height |
| "stiff", "sluggish" | slow acceleration or turn | `movement.acceleration`, `movement.deceleration` |
| "slippery" | low deceleration | `movement.deceleration` up |
| "I pressed jump and nothing happened" | no buffer or coyote time | `movement.jumpBufferMs` 80-150, `movement.coyoteTimeMs` 60-120 |
| "hits feel weak" | no feedback on impact | `feedback.hitStopMs` 30-80, `feedback.knockback`, `feedback.flashMs` |
| "too chaotic" | feedback too strong | lower `feedback.shakePx`, fewer particles |

## Recipe: jump arc from target height and time

For constant gravity, a target apex height H (px) and time to apex T (s) give:

- gravity g = 2H / T²
- jump velocity v = 2H / T

Example: H = 90 px, T = 0.33 s gives g ≈ 1650 px/s² and v ≈ 545 px/s. This is a starting estimate. Fixed-step integration, jump cut and collisions change the real arc, so always measure with the `jump-arc` scenario (`jump.apexHeight`, `jump.timeToApex`, `jump.airtime`).

## Recipe: three movement directions

| Direction | Change from baseline | Trade-off |
|---|---|---|
| Snappy | gravity +30%, jump velocity +15%, deceleration +60% | Precise, less hang time, harsher on mistakes |
| Forgiving | coyote time 120-140 ms, jump buffer 150-180 ms | Fewer "missed" jumps; can feel less exact |
| Floaty | gravity -30%, jump velocity -10%, air control -25% | Calm, more hang time; can feel imprecise |

## Recipe: combat feedback ladder

Add one layer at a time and compare: (1) hit flash 60-100 ms, (2) knockback, (3) hit-stop 30-80 ms, (4) particles, (5) shake 2-6 px. Each layer must stay linked to the hit (same `hitId`), so `combat.feedbackLatency` stays at 0 ms.

## Anti-patterns

- More shake, particles or speed is not automatically better. Offer a subtle option.
- Do not change protected rules (cooldown, damage, health) while tuning feel.
- Do not tune several unrelated systems in one experiment.

## Accessibility and comfort

- Shake and flashes must turn off with reduced motion. Never flash the full screen faster than 3 times per second.
- State changes need a non-color cue (shape, sound, text).

## Sources

- Pichlmair and Johansen, *Designing Game Feel: A Survey* (2021): tuning, juicing and streamlining.
- Hicks, Dickinson, Holopainen and Gerling, *Good Game Feel: An Empirically Grounded Framework for Juicy Design*, DiGRA 2018.
- Phaser 3 Arcade Physics docs for engine-native movement when not using a custom simulation.
