# GameDNA 2.0: pending work

This file is the plan for finishing the GameDNA 2.0 migration on branch `feature/gamedna-2.0-adaptive-intelligence` ([PR #3](https://github.com/bala2006/game-dna/pull/3), draft). Delete it when the PR is ready for review.

**State on 2026-11-27, commit `d2a9134`:** phases 0 to 9 of the specification are implemented and verified. CI is green on every job: typecheck, knowledge validation and unit tests on Node 22 and 24, the build, and the browser tests of all four games. The Kiroween submission period closes on 2026-12-04 at 2:00 pm PT.

## Part 1: blocking ready-for-review

Do these in order. Each item lists its acceptance check.

### 1.1 Phase 10: documentation, steering and capability catalog

These files still describe the removed 1.x MCP workflow (gd_* tools, workbench, experiments, dev bridge):

- [ ] `README.md`: rewrite for 2.0. Cover:
  - what GameDNA is and is not;
  - the architecture in brief, linking `docs/ARCHITECTURE.md`;
  - installation through `integration/kiro/installation/install.mjs`;
  - the demo apps;
  - the commands, including `check:knowledge`, `check:eval` and `install:kiro`;
  - the current test counts and the CI table.

  Remove the refinement-loop section, the workbench image and the MCP rows.
- [ ] `docs/INSTALL.md`: cover:
  - installing into a project, with and without `--kit` and `--no-agents`;
  - uninstalling;
  - importing `power/` as a skills-only Power;
  - per-surface use: the IDE and CLI select `gamedna-director`, while Web uses the steering file and the Director skill;
  - a troubleshooting note that Kiro Web may not discover skills added in the middle of a session, so start a new session after installing.
- [ ] `docs/ORIGINALITY.md`: a provenance record with these parts:
  - external architectural inspiration (the two studied repositories, ideas only; see `docs/COMPETITIVE_RESEARCH.md`);
  - work developed independently on this branch;
  - 1.x code retained: starter, assets, the core scenario runner, the original 8 Kit modules and the four apps;
  - competition-period dates: the repository started on 2026-11-24 and this branch on 2026-11-26;
  - third-party dependencies;
  - a statement that the competitor's skills were used only in an isolated sandbox folder and never entered this repository.
- [ ] `docs/DEPENDENCY_INVENTORY.md` and `docs/THIRD_PARTY_NOTICES.md`:
  - remove `@modelcontextprotocol/sdk`, `react`, `react-dom`, `scheduler`, `@vitejs/plugin-react` and `esbuild`;
  - list `playwright` 1.65.1 as a root devDependency;
  - confirm `zod` is still used by `@gamedna/core`.

  Check every entry against `package-lock.json`.
- [ ] `docs/GameDNA_PRD_v1.1_Kiroween.md` and `.kiro/specs/gamedna-mvp/*.md`: add one note at the top marking each superseded by `docs/ARCHITECTURE.md` and `.kiro/specs/gamedna-2/`. Keep the rest as history.
- [ ] `.kiro/steering/product.md`, `structure.md`, `tech.md` and `clean-slate.md`:
  - describe the 2.0 packages, `integration/` and `evaluations/`;
  - drop the MCP server rules;
  - update the command list and the CI description.
- [ ] `apps/gravity-shift/.kiro/steering/game-development.md`, `apps/neon-survivor/.kiro/steering/game-development.md` and both apps' `.kiro/specs/game/tasks.md`: remove the MCP and experiment references.
- [ ] `.github/pull_request_template.md`: list the 2.0 checks: typecheck, test, `check:docs`, `check:knowledge`, `check:eval`, build, and `test:e2e` when games change.
- [ ] New `docs/CAPABILITIES.md`: a capability catalog in four groups. It must follow `docs/rules.md`, which requires an icon per H2 heading, a reading key and a diagram. Suggested classification:

  | Group | Capabilities |
  |---|---|
  | Implemented and verified | Fingerprint (8 tests); Game Contracts (Kit tests plus two apps); 16 new Kit modules (unit tests); demo migration (differential replay, browser tests); knowledge validator (CI); installer (7 tests); native sub-agent delegation on Kiro Web (one observed full-game run); routing dataset and scorer (CI) |
  | Implemented, not fully verified | Per-specialist `skill://` scoping (not enforced on Kiro Web; not checked on IDE or CLI); Director as the main custom agent on IDE and CLI (not run); importing `power/` through the Powers panel (not run on 2.0); `stage.dispose` (checked once in Chromium with a throwaway harness) |
  | Experimental | Quality governor and frame sampler (no app uses them); routing results (simulated selection, one judge run) |
  | Planned | Engines beyond Phaser 3.90 and three.js 0.170; the Kit follow-ups in Part 2 |
- [ ] `.kiro/specs/gamedna-2/tasks.md`: check task 15 when this item is done.

**Acceptance:** `npm run check:docs` passes. This search returns only `docs/MIGRATION.md`, `docs/ARCHITECTURE.md`, `docs/COMPETITIVE_RESEARCH.md`, `evaluations/` and the files marked superseded:

```bash
git grep -lE "gd_[a-z]|workbench|MCP server|phaser-adapter|__GAMEDNA__|A/B/C" -- ':!package-lock.json'
```

### 1.2 Benchmark configuration 2: Kiro with Awesome Gamedev Agent Skills

It was not run. Their 80 skills, copied into the workspace `.kiro/skills/` in the middle of the session, were listed as 0 skills by Kiro Web. Reformatting their folded YAML descriptions did not help, and a known-good GameDNA skill placed next to them was not discovered either. The cause is therefore mid-session discovery, not their files.

- [ ] Start a **new session**. Clone `gamedev-skills/awesome-gamedev-agent-skills` at commit `c6ca6c4` (Apache-2.0) into a folder outside this repository. Copy each `SKILL.md` folder into the workspace `.kiro/skills/` **before** the session that runs the benchmark starts.
- [ ] Confirm discovery first: a sub-agent that lists its `skill::` catalog entries should report 80.
- [ ] Create an empty project like the others: `three` 0.170.0, `vite` 7.3.8, `vitest` 4.1.12, `typescript` 5.9.3 and `.npmrc` with `legacy-peer-deps=true`. Send it the brief from `evaluations/development-quality/README.md` unchanged.
- [ ] Re-run `tsc`, `vitest` and `vite build` yourself. Run the Chromium smoke check, collect the same metrics, and record the skills it opened.
- [ ] Fill in the configuration 2 column in `evaluations/development-quality/README.md` and section 3 of `docs/EVALUATION.md`.
- [ ] Delete the competitor files from the workspace afterwards. Never copy them into this repository.

### 1.3 Blind game-quality review

Two review runs were cancelled before scoring.

- [ ] Gather the builds. They exist only in the sandbox of the session that made them and may not survive a new session:

  | Build | Path |
  |---|---|
  | Ordinary Kiro | `/projects/sandbox/baseline-game` |
  | Knowledge without delegation | `/projects/sandbox/bench-c3` |
  | Complete GameDNA | `/projects/sandbox/trial-game` |
  | Configuration 2 | from step 1.2 |

  If they are gone, rebuild them with the protocol in `evaluations/development-quality/README.md`.
- [ ] Copy each build to `blind/<letter>/` without `.gamedna/`, `.kiro/` and READMEs. **Assign fresh random letters**; the letters used in the earlier attempt are known, so they no longer blind anyone.
- [ ] Give a reviewer that did not build any of them only the blind folders and `evaluations/development-quality/rubric.md`. The procedure: run the three commands, drive each build in Chromium (screenshots at about 0, 20 and 60 s of game time, moths near a lantern, and the end screen), score the 11 criteria with evidence, and list defects by severity.
- [ ] Record the scores, defects and the letter mapping in `evaluations/development-quality/` and `docs/EVALUATION.md`.
- [ ] Draw a quality conclusion only from these scores, and state that they are model-judged, not human playtesting.

### 1.4 Phase 11: final integration and delivery

- [ ] Review the full diff (`git diff origin/main...HEAD`) and the commit history.
- [ ] Check for obsolete references (the search in 1.1) and for secrets or generated files: `git diff --stat origin/main...HEAD`, and confirm no `.env`, `.scratch/`, `dist/` or session data.
- [ ] Run the final verification: `npm ci`, `npm run typecheck`, `npm test`, `npm run check:docs`, `npm run check:knowledge`, `npm run check:eval`, `npm run build`, `npm run test:e2e`.
- [ ] Rewrite the PR description with the final numbers. Delete this file and check task 16 in `.kiro/specs/gamedna-2/tasks.md`.
- [ ] Mark PR #3 ready for review in the GitHub UI. In this sandbox, `gh pr` subcommands fail, and the REST API cannot clear the draft flag. Do not merge.

## Part 2: follow-ups that do not block the PR

Specialist agents reported these Kit and starter gaps while building and reviewing. They were not independently verified. Fix them only with tests, and keep the demo games' behavior identical unless the change is the point.

- [ ] `stepGround`: no slope limit, step height, snap-down limit, coyote time or jump buffer.
- [ ] Platformer controller: no separate fall gravity. `moveAndCollideTiles`: no one-way tiles.
- [ ] `SimScene`:
  - its clock is fixed at 60 Hz and ignores `sim.tickRateHz`;
  - `renderState` receives no interpolation alpha;
  - the starter's `shake` also moves the HUD;
  - `bootGame` leaves gamepad and multi-touch input off.
- [ ] `onFirstGesture` listens only to `pointerdown` and `keydown`, so audio may stay locked on phones. Ridgeline Racer's engine sound never calls `resume()`. Ridgeline's shake ignores reduced motion.
- [ ] `stage.render` aims the sun at `ahead` and does not snap the shadow box, so shadows shimmer. Quality is fixed when the stage is created.
- [ ] `createPathIndex.nearest` is slow for points far from the path, reported at about 1.9 s per pass over Ridgeline's terrain vertices.
- [ ] Height field and terrain:
  - `createHeightField` fixes octaves at 5;
  - `heightfieldGeometry` has no chunk offset and leaves seams in its edge normals;
  - there is no streaming or level-of-detail module.
- [ ] `scatter` stops near 0.7 points per spacing² without reporting the shortfall. `gaitPose` assumes flat ground.
- [ ] Behavior trees: `cooldown` counts tree ticks, so it stretches when updates are staggered. `parallel` never reruns a settled child.
- [ ] Missing helpers: perception, attack tokens, wave budgets, suspension, an audio mixer with a voice limit, a texture-memory estimator and a 2D camera helper.
- [ ] Outside this repository the Power ships only `power/kit`, so projects there have no `@gamedna/starter` or `@gamedna/core` (no `SimScene`, no `runScenario`).
- [ ] The Phaser apps have no `?dev` hook, so their browser test only checks that they boot. No app uses `createQualityGovernor` or `createFrameSampler`.
- [ ] `tools/single-file.mjs` does not inline `public/` assets, so the Phaser games break when packed as one HTML file.
- [ ] Gravity Shift's landing squash lifts the feet about 4 px. The starter's HUD text renders at about 11 px on 667 px phones.

## Part 3: evaluation follow-ups

- [ ] Judge each held-out batch at least three times, ideally with a second model, and report the spread.
- [ ] Check on Kiro IDE and CLI whether `skill://` resources narrow startup discovery, as they did not on Kiro Web.
- [ ] Measure token consumption per agent where a Kiro surface exposes it.
- [ ] Analyze the scoped-discovery misses: recall 0.964 and combined 0.833 against targets of 0.97 and 0.90, and module recall 0.845 against 0.940 with global discovery. Improve descriptions only against the development split, never the held-out split.
- [ ] Record more observed native runs (skills actually opened during real tasks), not only simulated selection.

## Open decision

The PDF asks to show that GameDNA supports a new game outside its examples. The evidence is the Lantern Keeper trial in `/projects/sandbox/trial-game`, which is not in this repository and is summarized in `evaluations/delegation/README.md`. Decide whether to keep only that summary, or to archive the trial's source as evidence. Adding it as a fifth demo app conflicts with the PDF's instruction to improve the existing demos rather than add many apps.
