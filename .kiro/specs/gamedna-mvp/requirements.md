# Requirements: GameDNA MVP (v0.1)

Source brief: `docs/GameDNA_PRD_v1.1_Kiroween.md`. Each requirement below names the PRD IDs it covers. Acceptance criteria use EARS phrasing. This spec covers the P0 hackathon MVP; P1 and P2 items are out of scope unless marked.

## Introduction

GameDNA extends Kiro with game-development expertise and local instruments. Kiro keeps all reasoning and code edits. GameDNA provides skills, a local MCP server, a development-only Phaser adapter, procedural assets, playable parameter experiments, a comparison workbench and verification. The MVP ships two newly authored demo games built from one shared starter.

## Requirement 1: Installable Power and project status (GD-001, GD-002, GD-003)

**User story:** As a developer, I want to install GameDNA as a Kiro Power so that Kiro gains game tools without a second AI provider.

1. WHEN the Power folder is imported into Kiro THEN the system SHALL register the `gamedna` MCP server and the game skills from `power/`.
2. WHEN Kiro calls `gd_project_status` on a folder with a supported Phaser dependency THEN the system SHALL return the engine id, resolved version, package manager, approved commands, adapter status, GameDNA record state and scenario IDs.
3. IF the folder has no Phaser dependency THEN the system SHALL return `UNSUPPORTED_ENGINE` with the detected engine, if any.
4. The MCP server SHALL NOT contact any LLM, model API or network service for deterministic tools.

## Requirement 2: Focused expert skills (GD-004)

1. The Power SHALL ship separate skills for game direction, game feel, technical art, level design, playtesting and refinement.
2. Each skill SHALL state when to activate, recipes, trade-offs, measurement guidance and sources.

## Requirement 3: Design record and requirement links (GD-005)

1. The system SHALL validate `.gamedna/project.json` against a versioned schema and return field-level errors.
2. WHEN a constraint references a requirement ID that does not appear in the project's requirements file THEN validation SHALL report the missing ID.
3. WHEN a parameter value in `project.json` differs from the tuning source THEN validation SHALL flag a conflict and SHALL NOT pick a winner.
4. Decisions SHALL persist in `.gamedna/decisions.json` and be readable without chat history.

## Requirement 4: Clean-slate provenance (GD-007, GD-008)

1. All first-party code, skills, assets, tests, docs and games SHALL be written in this repository during the eligible window.
2. The repository SHALL commit root `.kiro/` with real specs, steering and hooks, and SHALL NOT contain secrets.
3. `docs/ORIGINALITY.md` and `docs/DEPENDENCY_INVENTORY.md` SHALL list authored components and pinned dependencies with licenses.

## Requirement 5: Style packs and procedural assets (GD-010, GD-011, GD-012)

1. The system SHALL provide three style packs: `pixel-adventure`, `neon-arcade` and `layered-minimal`, which differ in palette, typography, scale, camera, motion and feedback.
2. WHEN `gd_generate_asset` runs twice with the same type, style, seed, size, parameters and generator version THEN the output bytes and SHA-256 hash SHALL match.
3. The system SHALL generate sprites, tiles, backgrounds, icons, particle definitions and sound effects.
4. Validation SHALL check dimensions, transparency, palette membership, sprite-sheet alignment and attribution, and SHALL return corrective messages.

## Requirement 6: Sessions and observation (GD-020, GD-021, GD-022)

1. `gd_start_session` SHALL accept only a command ID declared in `project.json` that maps to a `package.json` script, or a loopback URL.
2. The MCP server SHALL NOT expose a generic shell tool.
3. The adapter SHALL expose `reset`, `getSnapshot`, `getEvents`, `setExperimentParameters` and `step` in development builds only.
4. `gd_observe` SHALL return the sanitized snapshot, new events since a cursor and an optional screenshot saved with an artifact ID.
5. IF the browser runtime or adapter is missing THEN the tool SHALL return `SESSION_NOT_READY` or `ADAPTER_MISSING` with a fix.

## Requirement 7: Scenarios and traces (GD-023, GD-024)

1. A scenario SHALL define seed, tick limit, timed key transitions and assertions linked to check IDs.
2. Scenario execution SHALL record key transitions, revision, parameters, step mode and the first failure.
3. WHEN a scenario runs N times with the same seed THEN the system SHALL compare traces and SHALL mark the result `unstable` if any run diverges.
4. Trace comparison SHALL report whether a match is exact or within tolerance.

## Requirement 8: Experiments and preference (GD-030 to GD-036)

1. `gd_create_experiment` SHALL accept a baseline and 2 to 3 variants, each with a label, rationale and parameter overrides.
2. Overrides SHALL be limited to allowlisted parameters within declared ranges; protected and fault parameters SHALL be rejected.
3. Variants SHALL run in the same game with the same seed, controls and viewport, without editing the working tree.
4. Comparison SHALL report movement and combat metrics in raw units with baseline deltas and measurement resolution.
5. The workbench SHALL record an explicit user selection or rejection with optional rationale. The system SHALL NOT infer a selection.
6. `gd_prepare_change` SHALL return a parameter patch only when the current baseline revision matches the experiment revision, and SHALL return `STALE_BASELINE` otherwise.
7. `gd_verify` SHALL confirm effective parameters match the selected variant and rerun protected checks before marking a decision `verified`.
8. A rejected experiment SHALL leave project files untouched.

## Requirement 9: Verification and delivery (GD-040 to GD-044)

1. Each game SHALL include Vitest and fast-check tests for its protected rules.
2. Each check SHALL report `passed`, `failed`, `not_tested`, `unsupported` or `unstable`. A tool failure SHALL NOT be reported as a pass.
3. A bounded regression hook SHALL rerun relevant tests after changes, with a timeout and without calling the agent recursively.
4. Production builds SHALL exclude the adapter, and a check script SHALL fail if the bridge marker appears in `dist/`.
5. `gd_export_report` SHALL write a local report with revision, scenarios, seeds, results, metrics, decisions, limitations and asset provenance.

## Requirement 10: Two demo games (PRD section 11)

1. `apps/gravity-shift` SHALL be a gravity-reversing puzzle platformer with protected rules MOVE-01, DEAD-01, RESET-01 and WIN-01.
2. `apps/neon-survivor` SHALL be a top-down wave survival game with protected rules CD-01, SCORE-01, HP-01 and RESET-01.
3. Both games SHALL use `@gamedna/starter` and SHALL build and run without the MCP server, Kiro or the workbench.
4. Each game SHALL include a clearly labeled seeded fault that a scenario detects.

## Requirement 11: Security (PRD section 12)

1. All file access SHALL stay inside the registered project root after canonicalization, including symlink resolution.
2. The workbench SHALL bind to `127.0.0.1`, require a per-session token, check `Host` and `Origin`, and restrict frame sources to the game origin.
3. Runtime operations SHALL be bounded: tick limits, repeat count, variant count, screenshot size, trace size and timeouts.
