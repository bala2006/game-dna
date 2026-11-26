---
name: refinement
description: Offer 2-3 playable variants, record the user's explicit choice, verify the change and log the decision. Use when the user wants options to compare, or wants to revert a past choice.
---

# Refinement loop

The user chooses. Kiro proposes, measures, applies and verifies. Never pick a subjective winner for the user.

## Step 1: Baseline

Call `gd_project_status`. Note `baselineRevision`, current parameter values and protected constraints. Run the relevant scenarios once (`gd_run_scenario`) so you know the baseline metrics.

## Step 2: Propose one focused experiment

Pick one question ("Which jump feel suits the game?"). Design 2-3 variants that differ in one system (see the game-feel skill). For each variant write a short label, the rationale and the trade-off. Never include protected or fault parameters; the tool rejects them.

```json
{
  "projectPath": "apps/gravity-shift",
  "question": "Which jump feel suits Gravity Shift?",
  "scenarioIds": ["jump-arc", "double-jump-coyote"],
  "protectedChecks": ["MOVE-01"],
  "variants": [
    { "id": "A", "label": "Snappy", "rationale": "Short fast arc", "parameters": { "movement.jumpVelocity": 600, "movement.gravity": 2000 } },
    { "id": "B", "label": "Forgiving", "rationale": "More coyote time and buffer", "parameters": { "movement.coyoteTimeMs": 130, "movement.jumpBufferMs": 180 } },
    { "id": "C", "label": "Floaty", "rationale": "Long hang time", "parameters": { "movement.jumpVelocity": 460, "movement.gravity": 1000 } }
  ]
}
```

Call `gd_create_experiment`. Nothing in the project changes.

## Step 3: Measure and hand over

Call `gd_compare_experiment` (pass `sessionId` if a browser session is running). Share `workbenchUrl` with the user. Summarize metric deltas in raw units and protected-check status per variant. Do not rank fun.

The workbench shows every variant as a playable iframe with the same seed and viewport, a reset button, keyboard focus control, blind mode, the evidence table and the choose / reject buttons.

## Step 4: Get the choice

Call `gd_get_selection`. If `pending`, wait. If the user states a choice in chat instead ("go with B"), call `gd_record_selection` with their exact words in `userStatement`. If rejected, stop; the project stays as it was.

## Step 5: Apply and verify

1. `gd_prepare_change` returns `patch.set` for the tuning file, or `STALE_BASELINE` if files changed since the experiment. On stale, create a new experiment.
2. Edit the tuning file with normal edit tools. Change only the listed keys.
3. `gd_verify` with `decisionId` (and `sessionId` if available). It checks the file, the running game's effective parameters, every protected scenario check and the project tests.
4. Only an all-`passed` result marks the decision `verified`. Report any `failed` or `not_tested` check plainly.

## Limits

- At most two automatic repair attempts for a failed verification. Then stop, show the evidence and ask the user.
- To undo: `gd_prepare_change` with `mode: "revert"`, edit the file, then `gd_verify` with `revert: true`.
- Decisions live in `.gamedna/decisions.json`; read them at the start of a new session instead of relying on chat history.
