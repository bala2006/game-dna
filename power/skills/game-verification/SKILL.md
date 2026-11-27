---
name: game-verification
description: Proof that a game works. Scenario JSON runs, fast-check property tests, replay determinism, Playwright tests through the dev hook, screenshot review and regression runs. Use before claiming a change works or when chasing a regression. Not for frame budgets (performance-budgets) or rule design (game-mechanics).
license: MIT
metadata:
  owner: quality
  topics: scenario tests, property tests, replay determinism, browser tests, visual inspection, integration review, regression testing
  engines: portable, three@0.170, phaser@3.90
  kit: core, starter, kit/loop, kit/input
---

# Game verification

## Scope

Owns which evidence proves which claim, the tests that produce it, integration review and the report of what stayed unproven. What a rule should be belongs to `game-mechanics`; when a test needs frame-time or memory numbers, use `performance-budgets`; when the game has no fixed-step harness, use `fixed-step-simulation` first.

## Decisions

- **Match the evidence to the claim.**

| Claim | Counts | Does not count |
|---|---|---|
| Builds and loads | Production build plus a browser test with no page or console error | The dev server started |
| A rule holds | A `passed` scenario plus a property test over random input | A build, a screenshot, one manual run |
| Same input, same game | 3 to 5 identical-seed runs that `assessReproducibility` calls `stable` | One passing run |
| A device's controls work | Playwright drives the device and dev-hook state changes | Bindings in source |
| It looks right | Screenshots at named states, each opened and described | A screenshot file exists |
| It is fast enough | Frame times on a real GPU of the target class | SwiftShader frame rate |

- **Each protected rule gets two tests:** a scenario replaying the risky input, and a property test of 100 to 150 runs with a fixed seed.
- **Assert on events and flat `snapshot()` state** such as `player.x`, never on pixels. Each `checkId` is a constraint ID (`MOVE-01`) from `.gamedna/project.json`.
- **Prove a test can fail:** with its `"fault": true` parameter on, a `detectsFault` scenario must fail on the expected `checkId`.
- **Only `passed` passes.** Report `not_tested`, `unsupported` and `unstable` by name; `worstStatus` keeps a failure from hiding.
- **Browser tests run the production build** at `?dev&quality=low` and wait on `window.__game` state, never on a fixed sleep.
- **Integration review checks the seams:** contract values (`hz`, units, events) match their users, `render` never writes simulation state, every emitted event is declared, and writes stayed in the owned files.
- **Regression scope:** `npm run regression` tests the apps changed in `git status`; a change under `packages/` runs everything.

## Mistakes

- "Verified" after a build: the build plays nothing.
- An assertion on a field missing from `snapshot()` returns `unsupported`, which a quick summary misreads as fine.
- Inputs at or past `maxTicks` are never applied, silently.
- `unstable` reproducibility: `Math.random()`, a clock read or unordered iteration in rules; `firstDivergence` names the tick and field.
- Tests that set sim fields instead of calling `setInput` skip the input latch players go through.
- A dev-hook teleport used to prove the mechanic it skips.

## Reuse

- `@gamedna/core`: `ScenarioSchema`, `runScenario`, `resolveRunParameters`, `assessReproducibility`, `compareRuns`, `computeMetrics`, `worstStatus`, `ProjectRecordSchema`, `checkParameterOverrides`.
- `@gamedna/starter`: `FixedStepSimulation` implements the `GameHarness` the runner drives.
- `@gamedna/kit/loop`: `exposeDevHook`; `@gamedna/kit/input`: `auditTouchLayout`, `measureTouchLayout`.
- `tests/e2e/kit-browser.ts`: `serveDist`, `launchChromium`, `openGame`, `frames`, `touch`.

The game keeps its constraints, scenarios and dev-hook state shape. Read `references/scenarios.md` when writing scenario JSON or a property test.

## Engines

- three.js 0.170: read `references/three.md` when driving a three.js build in Chromium or wrapping its sim for scenarios.
- Phaser 3.90: read `references/phaser.md` when browser-testing a `SimScene` game.

## Verify

- `npx vitest --run apps/<app>`, `npm run typecheck`, then `npm run build` and `npm run test:e2e` after `npx playwright install chromium`.
- The report lists each command with its pass count, every non-`passed` status by `checkId` and tick, and an **Unverified** list: real-GPU frame rate, audio, feel, and any device or view no test drove.
