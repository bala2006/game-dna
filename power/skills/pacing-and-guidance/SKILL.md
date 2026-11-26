---
name: pacing-and-guidance
description: Session rhythm and wayfinding. Calm and tense beats, rules taught where they apply, guidance by light, signs and landmarks, rewards spread out. Use when a game feels monotonous or exhausting, or players get lost.
---

# Pacing and guidance

The level-design skill covers single rooms: teach, test, twist and fairness. This skill covers the whole session.

## Pacing

- Alternate intensity: plan (low), act (rising), peak, release, reward. A peak needs a valley on each side.
- Give each phase its own senses. Change at least two of: sound bed level, light, camera distance, music.
- Planning screens go quiet. Lower the world sound by 10 LU or more while the map or plan view is open.
- Limits make breaks. A carry limit or a return-to-base step ends a peak and starts a valley.
- Raise one difficulty dimension per step: more threats, a new threat type, one missing option, or one new requirement. Never two at once.
- A companion never sets the pace. It keeps up, waits at the next destination, and takes orders through the same prompt list as everything else.
- Measure loop time and time per phase in playtests. Record the target range in `.kiro/specs/game/design.md`.

## Teaching

- Teach at the point of need. Show a one-line tip the first time a rule applies, once per profile.
- State a rule where it acts. An inventory rule appears in the inventory.
- Let the world teach first: a lit door, a sign, a clue visible from the main path.
- No front-loaded tutorial screens.

## Information before commitment

Before a risky choice, show risk, a reward range and requirements. A range sets expectations without spoiling the result. See the game-mechanics skill for the rule that keeps the range honest.

## Attention direction

Use the cheapest cue that works, in this order:

1. Light: the brightest spot (light-and-color skill).
2. Leading lines: paths, edges, rows of props.
3. Landmarks visible from far away.
4. Signs and notices in the world.
5. Motion: a character or object moving toward the goal.
6. A sound source.
7. A UI marker, only as a last resort.

Test guidance with the HUD hidden.

## Exploration rewards

- Every side path pays something: a resource, a clue, a shortcut, a story detail or a joke.
- Space rewards so no area is barren.
- Prefer rewards that add options, such as a clue for a quiet solution, over gates that block progress.

## Verify

| Behavior | Check |
|---|---|
| Tips show once | `eventUnique` on `tipShown` with `key: "tipId"` |
| Time per phase | Emit a `phase` event on every transition. Read the event ticks from the trace file `.gamedna/evidence/traces/<traceId>.json` that `gd_run_scenario` returns, and convert ticks to seconds with the tick rate |
| Shown reward range is honest | Call `gd_run_scenario` with several `seed` values; `stateAtEnd` on the reward stays inside the range |
| Guidance works | HUD-hidden playtest with the user; record the time to find the goal |

## Sources

- Schell, *The Art of Game Design* (3rd edition, 2019): interest curves.
- Koster, *A Theory of Fun for Game Design* (2004): learning as the core of fun.
- Totten, *An Architectural Approach to Level Design* (2nd edition, 2019): landmarks, leading lines, wayfinding.
