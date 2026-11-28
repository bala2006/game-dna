# Recorded runs

| Run | Split | Mode | Judge | Batches | Notes |
|---|---|---|---|---|---|
| `2026-11-27-dev` | dev (297) | scoped | Kiro Web sub-agents, session default model (not reported to the agent) | 12 batches, 4 judges | Judged before the prompt said the Director's own skill is already loaded |
| `2026-11-27-heldout` | heldout (198) | scoped and global | Kiro Web sub-agents, session default model | 11 scoped and 6 global batches, 5 judges | Each batch judged once |

Every run is simulated selection. `score-*.json` includes the failing cases; rescore with `node ../score.mjs --split <split> --predictions predictions-<mode>.json --failures`.
