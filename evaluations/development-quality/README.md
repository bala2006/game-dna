# Development-quality benchmark

Offline product research comparing how well Kiro builds a game under four configurations. It is not part of the GameDNA user workflow.

## Configurations

| # | Configuration | How it is set up |
|---|---|---|
| 1 | Ordinary Kiro | Empty project, nothing installed |
| 2 | Kiro with Awesome Gamedev Agent Skills | Their skills copied into the workspace `.kiro/skills/` in an isolated folder outside this repository; nothing of theirs enters GameDNA |
| 3 | GameDNA knowledge and Kit, no delegation | `install.mjs --no-agents --kit`; the agent is told not to start sub-agents |
| 4 | Complete GameDNA 2.0 | `install.mjs --kit`; the brief goes to `gamedna-director` |

Controls: the same brief, the same empty project (`three` 0.170.0, `vite` 7.3.8, `vitest` 4.1.12, `typescript` 5.9.3, `legacy-peer-deps`), the same sandbox and the session's default model. Kiro Web does not let the agent choose the model or the reasoning budget, and does not report token use to the agent.

## Brief (task `lantern-keeper`)

> Build a new small game called Lantern Keeper. At dusk, a lighthouse keeper (a person at real scale, third-person camera) walks a small seeded island with about 8 lanterns. Moths spawn at the shore in waves, fly toward the nearest lit lantern and dim it while they hover there. The keeper relights a lantern by standing next to it and pressing interact, and scatters nearby moths with a short pulse that has a cooldown. You lose when every lantern is dark; you win by surviving 3 minutes. Keyboard and mouse plus gamepad. A HUD shows lanterns lit, time left and pulse cooldown. Definition of done: `npx tsc --noEmit`, `npx vitest --run` (deterministic tests for relight reach, moth dimming, pulse cooldown, lose and win) and `npx vite build` pass; `?dev` exposes `window.__game`; Enter starts.

Configuration 4 received the same game description; its wording asked for the Director process and a report of agents and skills.

## Measurements

| Metric | How |
|---|---|
| Definition of done | Re-run `tsc`, `vitest`, `vite build` by the benchmark owner, not taken from the agent's report |
| Runtime smoke | Production build served statically, driven in headless Chromium: Enter, walk, interact, pulse; page errors recorded |
| Code shape | Non-test TypeScript lines and files outside `src/kit/`; test lines |
| Reuse | Kit modules imported |
| Wall-clock span | Seconds between the first and last commit in the game repository |
| Quality | Blind review with `rubric.md`; builds are renamed `x`, `y`, `z` and stripped of `.gamedna/`, `.kiro/` and READMEs |
| Tokens | Not available in this environment |

## Results, 2026-11-27

| Metric | 1 Ordinary | 2 Competitor | 3 Knowledge, no delegation | 4 Complete GameDNA |
|---|---|---|---|---|
| Definition of done | Pass | Not run | Pass | Pass |
| Tests | 22 | Not run | 32 | 183 |
| Runtime smoke, page errors | 0 | Not run | 0 | 0 |
| Game source lines (files) | 1,946 (10) | Not run | 1,361 (9) | 3,885 (28) |
| Test lines | 356 | Not run | 450 | 5,105 |
| Kit modules imported | 0 | Not run | 13 | 15 |
| Skills opened | 0 | Not run | 14 | 13 distinct across 8 specialists |
| Commits | 2 | Not run | 3 | 16 |
| Wall-clock span, s | 1,215 | Not run | 2,759 | 6,113 |
| Blind quality score | Not completed | Not run | Not completed | Not completed |

Notes:

- **Configuration 2 was not run.** The competitor's 80 skills were copied into the workspace `.kiro/skills/` mid-session, but Kiro Web listed 0 skills afterwards, also after reformatting their folded YAML descriptions and after adding a known-good GameDNA skill next to them. One build ran in that state; it opened no skills, so it was an ordinary-Kiro run and was discarded. Earlier in the same session, GameDNA skills installed mid-session were discovered. The failure is in mid-session discovery, not in their skills. Rerun it in a fresh session with the skills present at session start.
- **Design behavior, not counted as defects yet:** configuration 4's Director reported that relighting is instant and unlimited, so a player can hold one lantern by pressing interact repeatedly; it left that unchanged because the brief did not ask for a limit. Configuration 3 added a rule that a lantern cannot be relit while moths hover on it. Configuration 1 reported that its scripted bot won all 20 seeds.
- **Higher cost:** configuration 4 took about five times the wall-clock span of configuration 1 and produced twice the game code and fourteen times the test code. Whether that buys quality is the question the blind review must answer.
- **Blind review not completed.** Two review runs were cancelled before scoring. Screenshots of the two finished configurations at the same moment (start of play, low quality) are the only visual evidence so far, and they are not a quality score.

## Reproducing

1. Create four empty projects as above; install per configuration in a fresh session.
2. Send the brief; save the agent's final report.
3. Re-run the three commands, the runtime smoke and the metrics yourself.
4. Copy each build to `blind/<letter>/` without `.gamedna/`, `.kiro/` and READMEs, shuffle letters, and have a reviewer who did not build them score with `rubric.md`.
