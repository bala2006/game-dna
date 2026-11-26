---
name: game-mechanics
description: Systems that force decisions. Loop phases, risk shown before commitment, capacity limits, graded consequences, several solutions, clue-to-lock progress. Use when a game lacks depth or tension, or when adding an economy, alert, stealth or puzzle system.
---

# Game mechanics

A mechanic earns its place when it forces a choice. Start from the game-direction skill for the core loop. This skill builds the systems that make the loop worth repeating.

## Step 1: Model the loop as phases

Write the loop as phases with entry and exit conditions, for example `prepare`, `commit`, `pressure`, `release`, `payoff`.

- Store the phase as one field in the simulation. One transition function changes it.
- Each phase needs a different pace and mood. Change the sound bed, light and camera distance per phase (feedback-and-ui, light-and-color and camera skills).
- Each transition gets a scenario that asserts the phase with `stateAtEnd`.

## Step 2: Pick decision patterns

Use one or two patterns per slice. Each creates a choice and needs a rule that must never break.

| Pattern | The choice it creates | Same pattern in other games | Rule to protect |
|---|---|---|---|
| Risk shown before commitment: risk level, reward range, requirement | Which challenge, and when | A door shows its difficulty and reward tier; a puzzle shows its par | The real reward stays inside the shown range |
| Carry limit: gains are safe only once secured | Push on or secure it now | Run currency kept only at camp; cargo that fills a hold | Carried value never exceeds capacity |
| Graded, delayed response: pressure rises in steps and the world answers after a delay | Act fast or act quietly | A creature that hunts by noise; a storm front; an alarm | No response fires before the delay |
| Counterplay in layers: several ways to lower pressure | Which tool to spend | Hide, change route, use a decoy | A trivial action lowers nothing |
| Several solutions: a quiet one found by exploring, a loud one that costs pressure or resources | Time against risk | Find the key or break the wall; sneak past or fight | Both work; only the loud one raises pressure |
| Clue to lock: the lock opens only with a found clue | Where to search | A symbol order painted on a mural; a combination in a diary | No open without the clue |
| Safety is a place: leave the danger area and stay out for a hold time | Which route | Outrun a storm; break line of sight and hide | Pressure clears only after the full hold outside |
| Variation on a template: each instance adds or removes one option | A new plan per instance | Each floor removes one exit; each island adds one hazard | No two instances share the same option set |

## Step 3: Make consequences readable

- Use 3-5 grades, not on and off. Each grade changes something the player can see, such as more pursuers or a wider danger area.
- The delay must feel caused. Use 1-3 s after a loud act and longer for slow buildup. Name the cause in the notice.
- Every rising state has a visible way down and a clear end message.
- The game stores what the player found. Pin found answers and goals until they are used. Finding is the challenge; remembering is not.

## Step 4: Write the rules down

Add each rule to `.gamedna/project.json` `constraints` with an ID and put its numbers in the tuning file:

- `CAP-01` Carried value never exceeds `inventory.capacity`.
- `PRESSURE-01` A response never fires before `pressure.responseDelayMs` after the triggering act.
- `LOCK-01` A lock never opens without its clue or its loud solution.

Mark rule parameters `"protected": true`. Then call `gd_validate_design`.

## Verify

| Rule | Scenario and assertion |
|---|---|
| Capacity | Collect past the cap; `stateAlways` on `carried` with `lte` and the capacity |
| Delay | One scenario ends just before the delay with `eventCount` of `response` eq 0; another ends after with eq 1 |
| Clue to lock | Try the lock with no clue; `eventCount` of `lockOpen` eq 0 |
| Several solutions | One scenario per solution; both `lockOpen` eq 1; `stateAtEnd` on `pressure.level` differs |
| Reward range | Call `gd_run_scenario` with several `seed` values; `stateAtEnd` reward within the shown bounds each time |
| Template variation | A unit test over level data that compares option sets |

Run `gd_verify` after every rule change.

## Anti-patterns

- A dominant solution. If one path is always best, cut it or give it a cost.
- Hidden penalties. Every consequence shows its cause.
- Memory chores. Store found information for the player.
- Several new systems at once. Add one, playtest it, then add the next.

## Sources

- Adams and Dormans, *Game Mechanics: Advanced Game Design* (2012): feedback loops and internal economies.
- Hunicke, LeBlanc and Zubek, "MDA: A Formal Approach to Game Design and Game Research" (AAAI workshop, 2004).
- Cook, "The Chemistry of Game Design" (Gamasutra, 2007): skill atoms and loops.
