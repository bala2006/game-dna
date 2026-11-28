# <span style="color:#B84D73">🧬 GameDNA 2.0 evaluation results</span>

This document reports what was measured for GameDNA 2.0, how, and what was not measured. Raw data is in `evaluations/`.

Reading key:

| Symbol | Meaning |
|---|---|
| 📊 | Measured results |
| 👥 | Delegation |
| 🧪 | Game builds |
| 🚧 | Not measured or not met |

## <span style="color:#B84D73">📊 1. Skill selection</span>

The dataset has 495 original scenarios in 11 categories: 297 development cases written by three authors and 198 held-out cases written by a fourth author who did not see the development cases. A judge model read only the discovery metadata a role would see, plus each scenario without its answer, and chose skills, a specialist and modules. Each batch was judged once by a fresh Kiro sub-agent on 2026-11-27.

> [!CAUTION]
> These are simulated selections from discovery metadata, not observed native skill activation. The judges, the authors and GameDNA's skills were all produced in the same Kiro environment, which can inflate agreement. Treat them as regression baselines, not as proof of quality.

### <span style="color:#9A7B5F">1.1 Held-out results</span>

`scoped` shows each specialist only its own skills' descriptions; `global` shows every role all 25 descriptions, which is what Kiro Web displayed in practice (section 2).

| Metric | Scoped | Global | Target |
|---|---|---|---|
| Precision | 0.985 | 0.884 | 0.97 |
| Recall | 0.964 | 0.979 | 0.97 |
| F1 | 0.975 | 0.929 | |
| Exact skill set | 0.965 | 0.894 | |
| Near-miss rejection | 1.000 | 0.944 | 0.95 |
| Combined, exact | 0.833 | 0.944 | 0.90 |
| Mid-task, exact | 1.000 | 1.000 | 0.90 |
| Pivot, exact | 0.944 | 0.944 | |
| Cross-specialist, exact | 0.944 | 1.000 | |
| Engine mismatch rate | 0.000 | 0.000 | 0 |
| Unnecessary loads | 2 | 18 | |
| Missed loads | 5 | 3 | |
| Repeated reads | 0 | 0 | |
| Specialist accuracy | 0.975 | 0.975 | |
| Module recall | 0.845 | 0.940 | |
| Discovery header, estimated tokens | 1,868 to 2,097 | 3,983 | |

Scoped discovery met the precision, near-miss, mid-task and engine targets, and missed recall (0.964) and combined selection (0.833). Global discovery met recall, mid-task and engine, and missed precision (0.884) and near-miss rejection (0.944). Narrow catalogs cut unnecessary loads from 18 to 2 but lost some recall. Three of the five missed loads are combined cases, two of them Director cases where the scoped header shows other skills by name only. Module recall also falls, from 0.940 to 0.845; the cause was not analyzed.

The development split (297 cases, scoped, judged before the Director prompt stated that its own skill is already loaded) scored precision 0.938, recall 0.980 and exact 0.946. Six of its 13 unnecessary loads were the Director reopening its own skill; the prompt builder now states that the skill is loaded.

### <span style="color:#9A7B5F">1.2 Discovery size</span>

All 25 GameDNA names and descriptions total 8,435 characters, about 2,109 estimated tokens. The published Awesome Gamedev Agent Skills catalog is 31,059 characters for 80 skills, about 7,500 to 9,000 tokens, measured from their public files (`docs/COMPETITIVE_RESEARCH.md`). The two catalogs cover different engine ranges; this is a size comparison, not a quality comparison.

## <span style="color:#B84D73">👥 2. Delegation, observed</span>

Two native runs on Kiro Web are recorded in `evaluations/delegation/README.md`.

- The Director built a new game outside this repository by delegating to eight specialists as native sub-agents. Each opened only skills in its own domain. Every scope check reported 0 out-of-scope writes, and the quality specialist found 4 defects that were then fixed.
- `skill://` resources did not narrow what Kiro Web showed at startup: a specialist listed all 25 GameDNA skills. Per-role scoping is therefore a configuration intent on that surface, and the global column in section 1.1 is the realistic one there.

## <span style="color:#B84D73">🧪 3. Game builds</span>

The same brief was built under three of four planned configurations (`evaluations/development-quality/README.md`). All three passed the definition of done when re-run independently and ran in Chromium without page errors.

| Metric | Ordinary Kiro | GameDNA knowledge, no delegation | Complete GameDNA |
|---|---|---|---|
| Tests | 22 | 32 | 183 |
| Game source lines | 1,946 | 1,361 | 3,885 |
| Kit modules imported | 0 | 13 | 15 |
| Wall-clock span, s | 1,215 | 2,759 | 6,113 |

The complete configuration took about five times the wall-clock span of ordinary Kiro. No quality conclusion is drawn because the blind review was not completed.

## <span style="color:#B84D73">🚧 4. Not measured or not met</span>

- Token consumption for any configuration: not exposed to agents in this environment.
- Kiro with Awesome Gamedev Agent Skills: not run. Their skills, installed mid-session, were not discovered by Kiro Web.
- Blind game-quality scores: two review runs were cancelled before scoring.
- Recall and combined-selection targets with scoped discovery; precision and near-miss targets with global discovery.
- Human playtesting: none.
- Each held-out batch was judged once, so run-to-run variance is unknown.
