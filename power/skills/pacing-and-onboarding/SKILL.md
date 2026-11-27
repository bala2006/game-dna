---
name: pacing-and-onboarding
description: Session rhythm, the first minutes, contextual tutorials, guidance, wayfinding and environmental storytelling, with timings and checks. Use when players quit early, get lost, miss a rule or find a session monotonous. Not for room layout (level-design), difficulty values (game-mechanics) or HUD markers (hud-and-menus).
license: MIT
metadata:
  owner: experience
  topics: pacing, onboarding, tutorials, player guidance, wayfinding, environmental storytelling
  engines: portable
  kit: kit/events, kit/save, kit/input, kit/contracts
---

# Pacing and onboarding

## Scope

Owns the shape of a session, how the first minutes teach, and how the world leads the player and tells its story. When one room's teach, test and twist is the question, use `level-design`; for enemy counts or reward values, `game-mechanics`; for light that makes a goal stand out, `rendering-and-lighting`; for where a tip or marker sits on screen, `hud-and-menus`.

## Decisions

- **First minute budget.** One clear input to start within 10 s of load; the player moving within 20 to 30 s; a first success (pickup, kill, gate) within 60 s.
- **Teach at the point of need.** One verb per beat: introduce it where failure is cheap, test it with low stakes, then combine it with an earlier verb. Gravity Shift's first three levels do this.
- **Tips are one line** of at most 12 words, the device's label plus a verb ("A to jump"). A tip stays while its rule applies until the action is performed, and is then learned for that profile; it comes back only as a reminder after 3 failures at one spot or 10 to 15 s idle there.
- **One new thing at a time.** Raise one dimension per step: more threats, a new threat type alone before it mixes, one missing option, or one new requirement.
- **Rhythm.** Alternate build, peak and release: peaks of 30 to 90 s, valleys of 10 to 30 s, 3 to 5 s between waves. Change at least two of music layer, light, camera distance and density between phases.
- **Fast retry.** Back in control within 1 to 2 s of a death (Gravity Shift: 600 ms) and a restart key always available. Checkpoints sit right before the hard part.
- **Guidance ladder.** Cheapest cue first: light and contrast, leading lines, a landmark visible from the start, motion toward the goal, a sound source, a UI marker last. Each goal is visible or signposted from the previous one.
- **Environmental storytelling.** Arrange props to imply what happened, on main-path sightlines and where players slow down (doors, pickups, death spots), readable in silhouette at 20 to 30 m in 3D.
- **Measure.** Emit `phase` on every transition, and `tipShown` (first time), `tipReminder` and `tipLearned` per tip; time per phase and deaths per section come from the event log.

## Mistakes

- A front-loaded controls screen listing eight bindings, forgotten by the time each is needed.
- Tips that vanish after 2 s, or return on every restart because nothing saved them.
- Two new mechanics in one room: the player cannot tell which one killed them.
- A death that costs 5 s of reload and a long walk back.
- An always-on arrow: players stop reading the world, and a HUD-hidden playtest fails.
- Constant spawn pressure with no valley: fatigue by minute five.
- Hints naming keys on a touch device.

## Reuse

`createEventQueue` from `@gamedna/kit/events` stamps `phase` and `tipShown` events with ticks; declare their names in `defineContracts({ events })` from `@gamedna/kit/contracts` so a typo fails at startup. `createSaveSystem` from `@gamedna/kit/save` persists learned tips per profile. `input.prompt(action)` or `promptLabel(bindings, action, device)` from `@gamedna/kit/input` builds device-correct tip text. Gravity Shift's per-level `hint` field is the simplest form of teaching in place. The game keeps its beat plan, its tip list and its landmarks.

## Engines

Portable: the decisions do not depend on the engine. Read `references/onboarding.md` when planning the first five minutes or wiring tips that persist.

## Verify

- Scenario: `eventUnique` on `tipShown` with `key: "tipId"` proves no tip is introduced twice; `eventCount` on `phase` matches the beat plan.
- Time per phase: convert the tick gaps between `phase` events with the tick rate and compare with the planned range.
- Browser: the start input works within 10 s of navigation on a throttled phone profile, and the first tip names the control of the device in use.
- HUD-hidden playtest: record the time each tester needs to find the first goal; a goal no one finds in 60 s needs a stronger cue.
