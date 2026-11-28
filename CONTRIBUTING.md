# Contributing to GameDNA

GameDNA is three things that change together: skills (`power/skills/`), agents (`integration/kiro/agents/`) and tested game code (`packages/`). A change to one usually needs a check of the other two. This file is the authoring standard for all three.

## Ground rules

- Write everything fresh in this repository. Do not copy, translate or paraphrase skills, prompts, routing tables, evaluation prompts or code from other projects. Record any inspiration in `docs/ORIGINALITY.md`.
- Pin exact dependency versions and record each new dependency with its license in `docs/DEPENDENCY_INVENTORY.md`.
- Game rules live in fixed-step simulation code with seeded randomness. No `Math.random()` or clock reads in rules.
- Use Conventional Commits (`feat(kit): ...`, `fix(skills): ...`). One coherent change per commit, with its tests.
- Before a pull request: `npm run typecheck`, `npm test`, `npm run check:docs`, `npm run check:knowledge`, `npm run build`. Run `npm run test:e2e` when a game or the Kit's browser code changed.

## Skills

A skill is the knowledge an agent needs to make one area's decisions correctly. It is not a tutorial and it does not repeat what a capable model already does well. If a sentence would be true of any software project, cut it.

### Folder

```text
power/skills/<name>/
  SKILL.md              portable guidance, 300 to 800 tokens
  references/<topic>.md deeper or engine-specific material, loaded only when SKILL.md points to it
  scripts/              optional dependency-free Node scripts
```

References link only from `SKILL.md`, never from other references. A reference over 100 lines starts with a short contents list.

### Frontmatter

Only fields Kiro documents are used. `metadata` values are strings.

```yaml
---
name: collision-and-response
description: One or two sentences on what it decides and when it is needed, ending with what it does not own. Not for X (other-skill) or Y (other-skill).
license: MIT
metadata:
  owner: simulation
  topics: collision detection, collision response, broad phase
  engines: portable, three@0.170, phaser@3.90
  kit: kit/collision, kit/controller
---
```

| Field | Rule |
|---|---|
| `name` | Folder name, lowercase words joined by single hyphens, at most 64 characters |
| `description` | 100 to 330 characters (about 25 to 80 tokens), one line, no `": "` or `" #"`. States the capability and the situations that need it, then a `Not for` clause naming the neighboring skills in parentheses |
| `metadata.owner` | The one role that owns the skill: `director`, `gameplay`, `simulation`, `world`, `visual`, `motion`, `interaction`, `experience`, `performance`, `quality` or `engine` |
| `metadata.topics` | Comma-separated topics only this skill owns. No topic may appear in two skills |
| `metadata.engines` | `portable`, `three@0.170`, `phaser@3.90`. List an engine only when the skill or a reference has guidance for it |
| `metadata.kit` | Comma-separated modules the skill relies on: `kit/<module>`, `starter`, `starter/phaser`, `assets`, `core`. Each must be a real package export |

### Body

Use these H2 sections in this order. Keep each tight.

1. `## Scope`: what the skill owns, then what nearby skills own instead, each by name. A neighbor is mentioned with a condition: "when the camera clips through walls, use `camera-systems`".
2. `## Decisions`: the choices that matter in this area, with numbers where numbers exist (rates, ranges, budgets), and the invariants that must hold.
3. `## Mistakes`: specific failure modes and how to recognize them in play or in code.
4. `## Reuse`: the GameDNA modules that already solve parts of the problem, with the exact exports to call. Say what stays in the game.
5. `## Engines`: one line per supported engine pointing at its reference, for example "three.js 0.170: read `references/three.md` when wiring this into a three.js scene".
6. `## Verify`: the checks that prove the work, as commands or test shapes.

### Rules the validator enforces

`npm run check:knowledge` runs `scripts/validate-knowledge.mjs`. It fails on:

- a name that does not match its folder, or a duplicate name;
- frontmatter fields or metadata keys outside the table above, an unknown owner or engine;
- a description outside 100 to 330 characters, without a `Not for` clause, or not YAML-safe;
- a topic claimed by two skills;
- a `references/` or `scripts/` path that does not exist, a reference no `SKILL.md` links to, or a reference that links to another reference;
- a `metadata.kit` entry or an `@gamedna/...` import that is not a package export, or an imported name the module does not export;
- the same paragraph or bullet (60 characters or more) in two skills;
- a sentence that tells the agent to load, read or open another skill without a condition (`when`, `if`, `only`, `unless`, `for`);
- an engine version in the text that disagrees with the pinned dependency;
- obsolete APIs in code samples (removed three.js and Phaser 2 APIs, the removed `gd_*` tools, `Math.random()` in rules);
- a code block whose first line is `// check: compile` that does not type-check;
- a missing required body section, or a body over 1,600 estimated tokens;
- agent files with undocumented fields, inline `hooks`, unresolved `skill://` or `file://` resources, a specialist with a `subagent` tool, or a domain skill that no specialist or more than one specialist discovers.

Token figures are estimates: characters divided by four.

## Agents

Agents are Markdown files with frontmatter in `integration/kiro/agents/`. Use only documented fields: `name`, `description`, `tools`, `resources`, `model`, `includeMcpJson`, `includePowers`, `permissions`, `welcomeMessage`. Do not add `hooks`; the IDE ignores agents that contain it.

- The Director lists the specialists as `subagent/<name>` tools. Specialists never get `subagent`.
- A specialist's `resources` list its own skills and the two engine skills as `skill://.kiro/skills/<name>/SKILL.md`.
- A specialist prompt stays between 150 and 400 tokens.

## Kit modules

- One job per module, a small surface, a doc comment that states units, axes and assumptions, one line per export.
- Portable modules import nothing outside `packages/kit` and never touch the DOM. three.js modules import `three` 0.170.0.
- Add the module to `packages/kit/package.json` exports, the module table in `packages/kit/README.md`, and a test file in `packages/kit/tests/`. Then run `npm run build:power` and commit the refreshed `power/kit/`.
- When a game uses a new module, keep its behavior identical unless the change is the point, and say which.

## Evaluations

Routing scenarios live in `evaluations/skill-selection/dataset/`. Never tune skill descriptions against the `heldout` split. Add development cases instead, and record each scored run in `evaluations/skill-selection/results/` with the model and date.
