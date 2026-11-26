# Requirements: GameDNA 2.0, adaptive game-development intelligence

Source brief: the GameDNA 2.0 implementation specification supplied by the project owner on 2026-11-26. Design: `design.md`. Architecture: `docs/ARCHITECTURE.md`. Acceptance criteria use EARS phrasing.

## Introduction

GameDNA 2.0 removes the 1.x experiment and MCP stack and gives Kiro scoped game-development knowledge, tested reusable game code and a small set of specialist agents coordinated by a compact Director. Kiro keeps reasoning, implementation, delegation and verification.

## Requirement 1: No redundant execution infrastructure

1. The repository SHALL NOT contain a GameDNA MCP server, browser session manager, observation pipeline, experiment engine, comparison workbench or decision lifecycle.
2. The deterministic scenario runner, assertions, traces, metrics and PRNG SHALL remain available to tests.
3. The demo games SHALL build and run without any GameDNA development bridge.
4. Ordinary browser tests of the games SHALL remain.

## Requirement 2: Project fingerprint

1. WHEN `fingerprint.mjs` runs on a project THEN it SHALL record engine, installed engine version, language, build tool, dimension, rendering, physics, input devices, GameDNA modules and entry points, each with file evidence.
2. WHEN `--app <dir>` is given in a monorepo THEN it SHALL fingerprint that application's dependencies, not the repository root's.
3. It SHALL NOT infer the engine from file extensions alone.
4. WHEN `--check` is given THEN it SHALL report whether the stored profile is stale by comparing an input hash.
5. IF the engine is detected but not supported THEN the profile SHALL say `supported: false`.

## Requirement 3: Game Contracts

1. `@gamedna/kit/contracts` SHALL let a game declare spatial, simulation, interaction, performance and event contracts in typed source and SHALL reject invalid values.
2. A Markdown template SHALL cover gameplay, visual and integration constraints in one compact file.
3. At least two demo games SHALL declare contracts that their simulation and presentation code import.

## Requirement 4: Reusable foundation

1. The Kit SHALL provide tested modules for collision, character controllers, vehicle handling, state machines, behavior trees, utility AI, steering, grid A*, gameplay events, versioned saves, inventory, procedural rooms, pooling, frame budgets, feedback timers and three.js disposal.
2. Each module SHALL document its units, axes and assumptions and SHALL depend on no workspace package.
3. The demo games SHALL use these modules where they replace app-local code, and their existing tests SHALL keep passing.

## Requirement 5: Knowledge system

1. Each skill SHALL have a unique name, a description of at most 400 characters that says what it does not own, one owning role, a topic list, supported engines and Kit modules in `metadata`.
2. Engine-specific API detail SHALL live in references, not in the portable body.
3. No two skills SHALL claim the same topic.
4. Cross-skill load instructions SHALL be conditional.

## Requirement 6: Director and specialists

1. The Director SHALL be available as a custom agent and as a skill.
2. Nine specialist agents SHALL each list only their own skills and the engine skills as `skill://` resources.
3. Specialists SHALL NOT have the `subagent` tool.
4. A delegation packet and result format SHALL be documented, and `scope-check.mjs` SHALL report writes outside a packet's owned paths.
5. The installer SHALL copy agents and skills into a target project without overwriting files it did not install.

## Requirement 7: Validation

1. `scripts/validate-knowledge.mjs` SHALL check identifiers, metadata, descriptions, references, Kit modules, duplicate guidance, ownership, conditional dependencies, engine versions, TypeScript examples and agent configuration.
2. CI SHALL run it on every pull request.

## Requirement 8: Evaluation

1. An original dataset of 400 to 600 scenarios SHALL cover explicit, implicit, near-miss, combined, no-skill, engine, project-context, mid-task, pivot, cross-specialist and reuse cases, split into development and held-out sets.
2. A deterministic scorer SHALL compute precision, recall, F1, exact-set accuracy, near-miss rejection, unnecessary and missed loads, specialist accuracy, reuse discovery and discovery-context size.
3. Results SHALL state whether they come from simulated selection or observed native behavior.
4. A benchmark protocol SHALL define the four configurations, controls, tasks and rubric.

## Requirement 9: Delivery

1. All work SHALL be on a feature branch with phased Conventional Commits and a pull request to `main`.
2. Documentation SHALL distinguish verified, unverified, experimental and planned capabilities.
