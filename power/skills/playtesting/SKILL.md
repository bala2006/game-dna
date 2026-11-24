---
name: playtesting
description: Observe the running game, write scenarios with scripted input and assertions, capture screenshots and traces, check reproducibility, and catch regressions in protected rules. Use when testing a game, checking that a change broke nothing, or reproducing a bug.
---

# Playtesting with GameDNA

## Step 1: Check the project

Call `gd_project_status` with `projectPath`. It reports the engine, adapter, headless harness, scenarios and constraints. Fix anything marked missing first.

## Step 2: Install the dev-only adapter (once per game)

The adapter exposes `window.__GAMEDNA__` in development builds only.

```ts
// src/main.ts
if (import.meta.env.DEV) {
  void import('./dev/gamedna-adapter.js').then((m) => m.installGameDNA(game, scene));
}
```

`src/dev/gamedna-adapter.ts` calls `installBridge({ projectId, sim, specs, baseline, setControlled, onReset, engine, viewport })` from `@gamedna/phaser-adapter`. See `apps/gravity-shift/src/dev/gamedna-adapter.ts`. After `npm run build`, run `node scripts/check-prod-bridge.mjs dist`; it fails if the bridge leaked into production.

## Step 3: Write scenarios

Scenarios live in `.gamedna/scenarios/<id>.json`:

```json
{
  "id": "double-jump-coyote",
  "description": "Press jump repeatedly in midair; only one jump may happen.",
  "seed": 42,
  "maxTicks": 120,
  "setup": { "level": "lab-flat" },
  "inputs": [{ "tick": 10, "key": "jump", "down": true }, { "tick": 12, "key": "jump", "down": false }, { "tick": 13, "key": "jump", "down": true }],
  "assertions": [{ "type": "eventCount", "checkId": "MOVE-01", "event": "jump", "where": { "extraAirJump": true }, "op": "eq", "value": 0 }]
}
```

Assertion types: `eventCount`, `stateAlways`, `stateAtEnd`, `minEventInterval` (use `minMsFromParam` for cooldowns), `eventUnique`. `checkId` must be a constraint ID from `project.json`. Use `checkpoints` (ticks) to capture screenshots in browser runs.

## Step 4: Run

- Fast and headless: `gd_run_scenario` with `projectPath` and `scenarioId`. Runs the same simulation code in Node.
- Real browser with screenshots: `gd_start_session` with `commandId: "dev"`, then `gd_run_scenario` with `sessionId` and `screenshots: true`.
- Reproducibility: `repeat: 5`. Any divergence marks the result `unstable`. Report it; do not hide it.
- Live look: `gd_observe` with `screenshot: true` and selected `fields`.

## Step 5: Read results honestly

- `passed`, `failed`, `not_tested`, `unsupported`, `unstable` are different. Never describe `not_tested` as passing.
- On `failed`, report `firstFailure` (check, tick, observation) and the reproduction (scenario, seed, params).
- Fix the cause in source, rerun the same scenario, then run `gd_verify` for all protected checks.

## Seeded faults (demos only)

Parameters marked `"fault": true` (for example `fault.coyoteAfterJump`) switch on a labeled bug. Pass them only through `gd_run_scenario` `params` to prove a scenario catches the bug. Never ship them enabled.

## Bounded regression

After a task, run the game's `npm test` (the project hook does this) and `gd_verify` for the affected checks. Full browser runs are for task boundaries, not every keystroke.
