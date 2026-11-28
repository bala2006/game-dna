# <span style="color:#B84D73">🧬 Competitive research and positioning</span>

This document records what was learned from two public projects before GameDNA 2.0 was designed, how GameDNA differs, and which claims are not made. Observations are paraphrased summaries of architecture. No prompts, skill text, routing tables, evaluation prompts or code were copied.

Reading key:

| Symbol | Meaning |
|---|---|
| 🔎 | Studied project |
| 🥊 | Positioning |
| 🧾 | Originality boundary |

## <span style="color:#B84D73">🔎 1. Awesome Gamedev Agent Skills</span>

Source: [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills), Apache-2.0, release 2.0.0 of 2026-11-11, studied on 2026-11-26.

| Area | Observation |
|---|---|
| Breadth | 79 skills plus a router, grouped by engine (12 ecosystems), discipline, genre and workflow |
| Router | One large entry skill: detect engine and version from project files, classify the task, choose a minimal skill set, compose, fall back |
| Engine version | Read from project metadata and lockfiles; existing projects keep their pinned version |
| Boundaries | Each description ends with a clause naming the neighboring skill; the router holds an ownership table |
| Disclosure | Name and description at startup, body on selection, references on demand |
| Executable parts | Read-only Python project checkers, a few tuners, one engine starter, an asset manifest workflow |
| Evaluation | 366 prompts (should-trigger, near-miss, combination, none); a model sees names and descriptions and returns a skill list; precision and recall published |
| Discovery size | All descriptions total 29,866 characters, matching the figure in their results file; names and descriptions together are 31,059 characters, roughly 7,500 to 9,000 tokens |

Their published routing numbers come from single runs of a model choosing skills from descriptions. GameDNA treats them as reference evidence, not verified results, and does not compare its own numbers against them because the datasets, models and scoring differ.

## <span style="color:#B84D73">🔎 2. pstack</span>

Source: [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/pstack), MIT, version 0.15.48, studied on 2026-11-26.

| Area | Observation |
|---|---|
| Activation | Almost every skill is excluded from automatic selection; one entry skill matches a playbook and reads other skills by path when a step needs them |
| Context isolation | Delegates run in the background in their own worktree or output folder; briefs pass file pointers; retries get fresh agents |
| Delegation | Roles map to configured models; fan-out, races judged against a rubric, and adversarial review are separate workflows |
| Ownership | One owner per output or pull request; verifiers never check their own work; the parent reviews the diff and writes the summary |
| Communication | Workers return a short status with evidence; long logs go to files |

## <span style="color:#B84D73">🥊 3. Positioning</span>

GameDNA borrows no structure from either project. Established ideas they also use, such as progressive disclosure, context isolation, task decomposition and specialist delegation, are general techniques and are not presented as GameDNA inventions.

| Dimension | Studied projects | GameDNA 2.0 |
|---|---|---|
| Discovery scope | One global catalog for every agent, or slash-only skills | Per-specialist catalogs through native `skill://` resources; the Director sees agent descriptions |
| Activation timing | Prompt classification at the start of a task | Re-evaluation at defined implementation events, evaluated with mid-task, pivot and cross-specialist cases |
| Executable knowledge | Checkers and a starter | Typed, tested game modules that skills point to, used by four demo games |
| Integration | Ownership by convention | Game Contracts in typed source plus a scope-check command after each delegated task |
| Engines | 12 ecosystems | Two, Phaser 3.90 and three.js 0.170, each tested in two games |
| Evaluation | Prompt-level skill selection | Selection across eleven categories, including reuse discovery and specialist choice, with development and held-out splits |

> [!CAUTION]
> These are design differences, not measured superiority. GameDNA claims an improvement only where `docs/EVALUATION.md` reports a controlled measurement.

## <span style="color:#B84D73">🧾 4. Originality boundary</span>

- Neither repository was cloned into this one or added as a dependency.
- Their skill text, router content, ownership tables, evaluation prompts, agent configurations and scripts were not copied, translated or paraphrased into GameDNA.
- The only figures reused are their published counts and the description size measured from their public files, cited above.
- Comparative trials that load their skills run in isolated temporary folders outside this repository and are described in `docs/EVALUATION.md`.
