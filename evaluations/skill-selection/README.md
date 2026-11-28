# Skill-selection evaluation

This evaluation asks a broader question than "which skill matches this prompt": which GameDNA knowledge should an agent open at a given moment of real implementation work, given its role, the project, what it already has in context and what it is doing. All scenarios were written for GameDNA; none come from another project.

## Files

| Path | What it is |
|---|---|
| `dataset/dev-a.jsonl`, `dev-b.jsonl`, `dev-c.jsonl` | Development split (297 cases from three authors, split by category). Use it to improve skill descriptions. |
| `dataset/heldout.jsonl` | Held-out split (198 cases), written by a fourth author without access to the development files. Score it once per release; never tune against it. |
| `build-prompts.mjs` | Writes judge batches: the discovery metadata a given role would see, plus the scenario without its expected answer. |
| `score.mjs` | Scores predictions against the dataset. Deterministic. |
| `results/` | One folder per recorded run with predictions, scores and the model used. |

## Scenario format

One JSON object per line:

```json
{
  "id": "dev-implicit-007",
  "split": "dev",
  "category": "implicit",
  "role": "gamedna-simulation",
  "context": {
    "profile": { "engine": "three", "version": "0.170.0", "support": "tested", "dimension": "3d" },
    "task": "Walker movement for an on-foot exploration game",
    "loaded": ["character-movement"],
    "notes": "src/sim.ts already uses stepGround"
  },
  "request": "The walker sometimes ends up inside the bakery wall after sprinting into its corner.",
  "expected": {
    "skills": ["collision-and-response"],
    "forbidden": ["camera-systems"],
    "specialist": null,
    "modules": ["kit/collision"]
  }
}
```

| Field | Meaning |
|---|---|
| `category` | One of `explicit`, `implicit`, `near-miss`, `combined`, `no-skill`, `engine`, `project-context`, `mid-task`, `pivot`, `cross-specialist`, `reuse` |
| `role` | `director` for the coordinating or main agent, or a specialist agent name |
| `context.profile` | The project fingerprint facts that matter, or `null` for a new project with no code |
| `context.task` | What the agent is in the middle of, or `null` at the start of a request |
| `context.loaded` | Skills already in the agent's context. Opening one again is a repeated read |
| `context.notes` | Short facts from the code the agent has already seen |
| `expected.skills` | Exactly the skills the agent should open now. Empty when no skill is needed |
| `expected.forbidden` | Plausible wrong skills; selecting one fails near-miss rejection |
| `expected.specialist` | For `director` cases, the specialist to delegate to, or `null` to do it directly. For specialist cases, the specialist to hand the work to when it belongs to another owner, else `null` |
| `expected.modules` | Kit, starter, assets or core modules the agent should reuse, for example `kit/nav` |

## Categories

| Category | Tests |
|---|---|
| `explicit` | The request names the capability |
| `implicit` | The request describes a symptom or a feeling, not the technique |
| `near-miss` | The words point at one skill, the need belongs to another |
| `combined` | Two or three skills are genuinely needed |
| `no-skill` | Ordinary programming; no skill should load |
| `engine` | The right engine skill for the installed engine and version, or none for unsupported engines |
| `project-context` | The answer depends on the profile or existing code, not on the wording |
| `mid-task` | A new requirement appears while implementing something else |
| `pivot` | The implementation changes direction and needs different knowledge |
| `cross-specialist` | A specialist meets a dependency in another domain |
| `reuse` | An existing module solves the problem; the agent must find it |

## Running an evaluation

```bash
node evaluations/skill-selection/build-prompts.mjs --split dev --mode scoped --out .scratch/eval/dev-scoped
# give each batch file to a judge (a fresh Kiro sub-agent or any model) and save its JSON predictions
node evaluations/skill-selection/score.mjs --split dev --predictions .scratch/eval/dev-scoped/predictions.json
```

`--mode scoped` shows each specialist only its own skills' descriptions and the names of the rest, which is what the agent configuration requests. `--mode global` shows every role the full catalog, which is what Kiro Web was observed to do.

> Results from this procedure are **simulated selection**: a model reads discovery metadata and says what it would open. Observed native behavior (skills Kiro actually activated during real work) is recorded separately in `evaluations/delegation/`.
