# Delegation evaluation

Two kinds of evidence are kept apart here.

| Kind | Source | What it can show |
|---|---|---|
| Simulated | `evaluations/skill-selection/`, cases with role `director` | Whether the Director picks the right specialist, or none, from discovery metadata |
| Observed | Native Kiro runs recorded below | Whether Kiro actually starts the agents, what they open, whether they stay in scope |

## Simulated specialist selection

Each skill-selection case has an `expected.specialist`. For Director cases it is the specialist the work belongs to, or `null` when the Director should make the change itself. For specialist cases it is the owner to hand over to when the work is outside the specialist's domain. The scorer reports `specialistAccuracy` over all cases; the latest numbers are in `docs/EVALUATION.md`.

## Observed runs

All runs used Kiro Web on 2026-11-26 and 2026-11-27, with the default model of the session. GameDNA was installed with `integration/kiro/installation/install.mjs` into the workspace root of the sandbox, outside this repository, and removed afterwards.

### Run 1: one specialist, read-only question

- **Request:** "Can the Gravity Shift player tunnel through a one-tile floor at the maximum fall speed?", sent to `gamedna-simulation` directly.
- **Started natively:** yes.
- **Discovery:** the agent listed all 25 GameDNA skill descriptions as visible at startup, not only its six `skill://` resources. On Kiro Web, agent `resources` therefore did not narrow discovery.
- **Opened:** `collision-and-response` only, no references.
- **Answer:** correct. It found the 20 px per tick fall against 32 px tiles and the sub-stepping in `moveAndCollideTiles`, then confirmed with 4,000 scripted falls.

### Run 2: complete game through the Director

- **Request:** the Lantern Keeper brief in `evaluations/development-quality/README.md`, sent to `gamedna-director` in an empty three.js project outside this repository.
- **Fingerprint and contracts:** the Director ran `fingerprint.mjs` (profile missing, generated, then fresh; three 0.170.0, tested). It wrote `src/contracts.ts`, `.gamedna/contract.md` and a contracts test.
- **Specialists started natively:** world, simulation, motion, visual, interaction (twice; the second run fixed a camera jump on pointer lock), experience, gameplay, quality (twice). It did not start performance; the Director put budgets in the contracts instead.

  The skills each specialist opened, as it reported them:

  | Specialist | Opened |
  |---|---|
  | world | `world-generation`, `level-design` |
  | simulation | `character-movement`, `collision-and-response` |
  | motion | `character-animation` |
  | visual | `rendering-and-lighting`, `art-direction` |
  | interaction | `input-and-controls`, `camera-systems` |
  | experience | `hud-and-menus` |
  | gameplay | `enemy-ai`, `game-mechanics` |
  | quality | none on the first run, `game-verification` on the second |

  No specialist opened a skill owned by another domain.
- **Write scope:** every `scope-check.mjs` run reported 0 files outside the packet's owned paths. 62 files changed after the contracts commit, all in scope.
- **Independent review:** the first quality pass found 4 defects. The interaction specialist fixed one, the Director fixed three in `main.ts`, and the second quality pass confirmed all four fixed.
- **Result:** `tsc`, 183 Vitest tests and `vite build` pass. The game imports 15 Kit modules. 16 commits; wall-clock span between the first and last commit was 6,113 s.

### What the observed runs establish

- Native custom agents and sub-agents work with the installed files, without any GameDNA runtime.
- Ownership held in practice: domain-specific opens and zero out-of-scope writes in run 2.
- Scoped discovery did **not** reduce what Kiro Web shows at startup. Per-role catalogs are a configuration intent that Kiro Web does not enforce; the global catalog is small (about 2,100 estimated tokens for 25 skills), which limits the cost.
- Token consumption per agent is not exposed to the agents in this environment, so it was not measured.

## Running it again

1. `node integration/kiro/installation/install.mjs --target <workspace>` in a fresh session (skills installed mid-session were not always picked up by Kiro Web; see `docs/EVALUATION.md`).
2. Send the brief to `gamedna-director`, and ask for the list of agents started and the skills each opened.
3. Run `scope-check.mjs --since <first commit> --owned "<all packet globs>"` at the end.
