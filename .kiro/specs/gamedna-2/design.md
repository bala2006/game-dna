# Design: GameDNA 2.0

Requirements: `requirements.md`. The full architecture with diagrams is `docs/ARCHITECTURE.md`; the classification of 1.x components is `docs/MIGRATION.md`. This file records the decisions that shape implementation.

## 1. Native Kiro mechanisms only

| Need | Mechanism | Why not something custom |
|---|---|---|
| Domain knowledge | Agent Skills with progressive disclosure | Kiro loads name and description first, body on match, references on demand |
| Specialists | Custom agents in `.kiro/agents/`, run as sub-agents | Native isolation of conversation and context per sub-agent |
| Role-scoped discovery | `skill://` resources per agent | Documented way to limit which skills a custom agent sees |
| Distribution | Skills-only Power plus an installer for agents | Powers carry skills and MCP servers only |
| Verification | `npm test`, builds, Playwright | Kiro runs these directly |

No MCP server, scheduler, queue, router model, embedding index or agent harness is added.

## 2. Canonical sources

- Skills: `power/skills/<name>/`. The installer copies them into `.kiro/skills/` of a target project because agents cannot reference skills inside a Power by path.
- Agents: `integration/kiro/agents/`. Copied into `.kiro/agents/` by the installer.
- Kit: `packages/kit`. `power/kit` is a generated copy checked for freshness in CI.
- Fingerprint and scope check: `power/skills/gamedna-director/scripts/`, plain dependency-free ESM so they run in any project with Node 18 or later.

## 3. Skill format

Frontmatter uses only fields Kiro documents: `name`, `description`, `license`, `compatibility`, `metadata`. `metadata` values are strings:

| Key | Content |
|---|---|
| `owner` | Owning role, for example `simulation` |
| `topics` | Comma-separated topics this skill alone owns |
| `engines` | `portable`, `three@0.170` and or `phaser@3.90` |
| `kit` | Comma-separated Kit, starter or assets modules the skill points to |

Body order: owns and does not own, when to look again, decisions and invariants, common mistakes, reuse, engine references, verification. Bodies target 300 to 800 tokens.

## 4. Agent format

Markdown with frontmatter: `name`, `description`, `tools`, `resources`. No `hooks` field, because the IDE ignores agents that contain it. The Director has `subagent` tools for the nine specialists; specialists have `read`, `write` and `shell` only.

## 5. Fingerprint

Detection order: targeted app `package.json`, then lockfile version, then imports in source under `src/`. Engines recognized: phaser, three, pixi.js, @babylonjs/core, kaboom, excalibur, playcanvas, plus Godot, Unity and Unreal project files. Only phaser and three are `supported: true`. The profile stores an input hash of the manifests and lockfile it read.

## 6. Evaluation

- Dataset: `evaluations/skill-selection/dataset/*.jsonl`, one scenario per line with split, category, context, request and expected skills, specialist and modules.
- Scorer: `evaluations/skill-selection/score.mjs`, deterministic, reads predictions JSON.
- Prompt builder: produces the role-scoped discovery metadata a judge sees, so any model or Kiro sub-agent can produce predictions.
- Results are labeled `simulated-selection` unless they come from observed native skill reads.

## 7. Testing

Each Kit module has its own test file. The fingerprint, scope check, installer and knowledge validator have tests under `tests/`. Demo games keep their scenario and property tests.
