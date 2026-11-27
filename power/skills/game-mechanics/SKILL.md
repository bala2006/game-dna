---
name: game-mechanics
description: Rules players act through. Core loop, verbs, protected rules, combat, progression, inventory, equipment, rewards, economy, difficulty, quests, dialogue and objectives. Use when deciding what players do and how the game answers. Not for hit feedback (game-feel), enemy behavior (enemy-ai) or tutorials (pacing-and-onboarding).
license: MIT
metadata:
  owner: gameplay
  topics: core loop, player actions, game rules, combat, progression, inventory, equipment, rewards, economy, difficulty balancing, quests, dialogue, objectives
  engines: portable
  kit: kit/inventory, kit/random, kit/events, kit/contracts, starter, core
---

# Game mechanics

## Scope

Owns what the player can do, what the rules answer, and the numbers behind both. When the question is how a hit feels (flash, hit-stop, shake), use `game-feel`; for how enemies decide, use `enemy-ai`; for the order players meet mechanics, use `pacing-and-onboarding`; for where rule code lives and how it is saved, use `game-architecture`.

## Decisions

- **Core loop in one line**: verb, challenge, reward, repeat. Two to four verbs in a first slice, each needed in every level.
- **Rules have ids and tests.** Each must-never-break rule is a statement with an id (`CD-01` one attack per cooldown, `SCORE-01` a kill scores once, `HP-01` health never below 0). Its numbers live in the tuning file; a seeded fault parameter proves its scenario catches the bug.
- **Combat runs in ticks.** Light attacks wind up 3 to 6 ticks at 60 Hz, heavy ones 15 to 30. Cooldown counts from the attack, not from key release (Neon Survivor: 320 ms, 20 ticks). Player invulnerability after a hit lasts 0.5 to 1 s (Neon Survivor 700 ms). Each hit carries a `hitId` of tick and target so one swing damages a target once. Frame data and time-to-kill bands are in `references/balance.md`.
- **Derived stats are recomputed** from base plus equipment on every change: flat bonuses, then percentages summed within a category, then categories multiplied. Never add on equip and subtract on unequip.
- **Rewards.** Show the range before commitment and keep the result inside it. Drops come from `weightedPick` on a loot stream from `deriveSeed(seed, 'loot')`, with a pity counter: a 5 percent drop still misses 40 times in a row for 13 percent of players.
- **Economy.** List every faucet and sink with its rate per minute; faucets above sinks inflate prices. Currency and counts are integers, and carried value has a capped rule with an id.
- **Difficulty.** Change one knob at a time (counts, speeds, windups, spawn gaps) and judge it over 20 or more seeded runs. Dynamic difficulty stays within 10 to 20 percent and never hides behind invisible stat boosts.
- **Quests, objectives and dialogue are data.** Quest steps are conditions on gameplay events with rewards; dialogue is a graph whose choices carry conditions, flag effects and a `next`. One main objective is always visible, with at most three optional ones. Shapes are in `references/quests-and-dialogue.md`.

## Mistakes

- One swing scores a kill twice: damage applied twice with no `alive` guard (Neon Survivor's `fault.duplicateDamage`).
- Damage output follows mash speed: the cooldown is checked per press or per frame.
- Stats drift after unequipping or loading: equipment applied by increments.
- The same seed drops different loot after an AI change: loot shares the AI's stream.
- Quest progress never advances in headless tests: it counts UI or render events.
- One weapon or route always wins: no simulated comparison across options.

## Reuse

- `@gamedna/kit/inventory`: `createInventory({ items, slots, maxWeight })`; `add` returns what did not fit; `room`, `move`, `split`, `toJSON`, `load`.
- `@gamedna/kit/random`: `weightedPick`, `shuffle`, `deriveSeed`, `createRng`.
- `@gamedna/kit/events`: `createEventQueue`, with quest progress subscribed through `on`.
- `@gamedna/kit/contracts`: `ticksFor`. `@gamedna/starter`: `msToTicks`, `num`, `flag` for tuning and seeded faults.
- `@gamedna/core`: `runScenario` with `eventCount`, `stateAlways`, `minEventInterval` and `eventUnique`; `computeMetrics` for `combat.minAttackInterval`.

The game keeps its rules, numbers and content.

## Engines

Portable only: rules run in the simulation and read the same under every engine. When wiring them into an engine, use `threejs-kit` or `phaser-starter` for the project's engine.

## Verify

- Cooldown: hold attack every tick; `minEventInterval` on `attack` with `minMsFromParam: 'attack.cooldownMs'`.
- Score once: `eventUnique` on `score` keyed by `enemyId`. Health floor: `stateAlways` on `player.health` with `gte` 0.
- Each rule's scenario fails with its fault parameter on (`detectsFault`).
- Economy and difficulty: 20 headless seeds keep currency per minute and clear rate in their bands.
- Content: a unit test resolves every quest condition, reward id and dialogue `next`.
