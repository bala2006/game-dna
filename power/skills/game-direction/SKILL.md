---
name: game-direction
description: Turn a game idea into a small, coherent design with a core loop, player verbs, protected rules and a GameDNA design record. Use when starting a new game, choosing between concepts, or scoping a game jam entry.
---

# Game direction

## When to use

- The user describes a game in plain words ("a robot that flips gravity").
- The user asks for concepts, scope, or "what should this game be".
- A project has no `.gamedna/project.json` yet.

## Step 1: Find the core loop

Write one sentence: **verb → challenge → reward → repeat**. Example: "Run and flip gravity to cross hazards, collect keys, open the exit."

- List 2-4 player verbs. More than four verbs in a first slice usually means the scope is too large.
- Each verb needs a reason to exist in every level. A verb used once is a gimmick; cut it or design levels around it.

## Step 2: Offer 3 distinct directions

Offer three concepts that differ in loop or feel, not just theme. For each give: loop sentence, verbs, a style pack (`gd_get_style_pack`), one risk, and what is cut. Let the user choose. Do not pick for them.

| Trade-off | Lean option | Rich option |
|---|---|---|
| Levels | 3 hand-made short rooms | Procedural generation (defer) |
| Combat | One attack with cooldown | Combos, weapons (defer) |
| Progression | Per-level goal | Meta progression (defer) |

## Step 3: Name the protected rules

Protected rules are what must never break, written as testable statements with IDs:

- `MOVE-01` A normal jump cannot be repeated in midair.
- `WIN-01` The exit completes the level only when all keys are held.

Each rule links to a requirement in the Kiro spec (`.kiro/specs/game/requirements.md`, IDs like `REQ-2`). Each rule gets a scenario later (see the playtesting skill).

## Step 4: Write the design record

Create `.gamedna/project.json`. Required fields: `schemaVersion` (1), `projectId`, `name`, `engine`, `design` (genre, coreLoop, stylePack, experienceGoals), `tuningFile`, `viewport`, `constraints`, `parameters`, `commands`, `metrics`. Optional: `requirementsFile`, `harness` (enables fast headless scenario runs).

- Put every tunable number in the tuning file (for example `src/game/tuning.json`) and list it under `parameters` with `unit`, `min`, `max`.
- Mark rule parameters `"protected": true` so experiments cannot change them.
- `commands` may only name `package.json` scripts: `{ "dev": { "script": "dev", "kind": "dev", "url": "http://127.0.0.1:5173/" } }`.

Then call `gd_validate_design`. Fix every error; reconcile every reported conflict with the user.

## Step 5: Keep the code engine-native

Put rules in a deterministic fixed-step simulation class (no `Math.random`, no wall-clock time). Phaser draws state. This is what lets GameDNA replay input exactly and run scenarios headless.

## Measuring success

- The loop sentence fits on one line and every verb is used in every level.
- Every protected rule has an ID, a requirement link and (later) a scenario.
- `gd_validate_design` returns `valid: true`.

## Sources

- Swink, *Game Feel* (2008), for verbs and real-time control as design material.
- Pichlmair and Johansen, *Designing Game Feel: A Survey*, IEEE Transactions on Games (2021), doi:10.1109/TG.2021.3072241.
