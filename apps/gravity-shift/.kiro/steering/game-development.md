---
inclusion: always
---

# Working on this game

- Game rules live in `src/game/sim.ts`. Keep them deterministic: use `this.rng`, never `Math.random()` or wall-clock time.
- Tuning values live in `src/game/tuning.json`; every tunable value must also be in `.gamedna/project.json` "parameters" with a unit and range.
- Every protected constraint in `.gamedna/project.json` needs a scenario in `.gamedna/scenarios/` that asserts it.
- Run `npm test` in this folder after changing rules. Use GameDNA `gd_run_scenario` for evidence and `gd_verify` before calling a change done.
- Do not apply an experiment variant until the user has chosen it in the workbench or stated it in chat.
