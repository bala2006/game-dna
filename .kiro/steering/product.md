---
inclusion: always
---

# Product: GameDNA

GameDNA is passive software that makes Kiro a specialist game developer. It acts only when Kiro calls one of its tools, and Kiro controls all of it. It ships as a Kiro Power (`power/`) with a local stdio MCP server, dev-only engine adapters, procedural style packs, a comparison workbench, the GameDNA Kit and four demo games.

- Engines: Godot, Unity, Unreal Engine, Android (Kotlin and C++), and HTML, CSS and JavaScript games (Phaser, three.js, plain web), plus any engine that implements bridge protocol v1. No iOS or macOS. An engine counts as supported only after its conformance test passes on the real engine; `ENGINES` in `packages/mcp/src/engines.ts` holds the `verified` flags.

- Kiro does all reasoning and code edits. GameDNA tools return observations, artifacts and diagnostics. No second AI provider, no model API, no credentials.
- The user chooses subjective outcomes. Tools never pick a winner or infer a preference.
- Finished games run without Kiro, the MCP server or the workbench.
- Source of truth for scope: `docs/GameDNA_PRD_v1.1_Kiroween.md`. Specs: `.kiro/specs/gamedna-mvp/` (v0.1) and `.kiro/specs/gamedna-engines/` (v0.2, every engine).
- Competition: Kiroween 2026, Skeleton Crew category. Build window ends December 4, 2026, 2:00 PM PST.
