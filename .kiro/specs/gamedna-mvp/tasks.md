# Tasks: GameDNA MVP (v0.1)

Requirements: `requirements.md`. Design: `design.md`. Checked items are implemented and covered by `npm test` unless noted.

- [x] 1. Monorepo foundation written by hand: npm workspaces, strict TypeScript, Vitest, `.npmrc`, MIT license (Req 4)
- [x] 2. Technology decision recorded with Rust, Go, Python and Bun compared; latency benchmark script (`npm run bench:mcp`) (design section 1)
- [x] 3. `packages/core`
  - [x] 3.1 Zod schemas for project record, parameters, constraints, commands, scenarios, assertions (Req 3, 7)
  - [x] 3.2 Seeded PRNG and fixed-step scenario runner with checkpoints, bounded samples and events (Req 7, 11)
  - [x] 3.3 Assertions: eventCount, stateAlways, stateAtEnd, minEventInterval, eventUnique; five check statuses with worst-wins aggregation (Req 9.2)
  - [x] 3.4 Trace comparison (exact vs tolerance) and reproducibility (Req 7.3, 7.4)
  - [x] 3.5 Movement and combat metrics with units, method and resolution (Req 8.4)
  - [x] 3.6 Experiments, allowlist checks, selections, decisions and the PRD state machine (Req 8)
  - [x] 3.7 Design validation with requirement links and record/source conflicts (Req 3)
  - [x] 3.8 Node helpers: path guard with symlink checks, atomic JSON store, content revisions (Req 11.1, 8.6)
- [x] 4. `packages/assets`: three style packs, sprite/tile/background/icon/particle/sfx generators, PNG and WAV encoders, validation, manifest writer, committed samples (Req 5)
- [x] 5. `packages/starter`: fixed-step simulation base, input latch, comfort settings, Phaser scene glue shared by both games (Req 10.3)
- [x] 6. `packages/phaser-adapter`: dev-only bridge with snapshot, events, parameters, reset, step and scenario execution (Req 6.3)
- [x] 7. `packages/mcp`
  - [x] 7.1 Project detection, engine version, package manager, unsupported engines (Req 1)
  - [x] 7.2 Sessions limited to declared dev scripts or loopback URLs; Playwright loaded from the game project (Req 6.1, 6.2)
  - [x] 7.3 Headless runs through the project's Vite SSR loader (no browser needed)
  - [x] 7.4 All 14 P0 tools plus `gd_record_selection` for choices stated in chat
  - [x] 7.5 Workbench HTTP server: loopback, token, Host and Origin checks, CSP (Req 11.2)
- [x] 8. `packages/workbench`: playable side-by-side variants, reset, focus control, blind mode, evidence table, choose or reject (Req 8.3, 8.5)
- [x] 9. `power/`: `plugin.json`, `mcp.json`, six skills, bundled server via `npm run build:power` (Req 1, 2)
- [x] 10. Gravity Shift: three levels, lab rooms, scenarios for MOVE-01/DEAD-01/RESET-01/WIN-01, seeded fault, properties (Req 10.1, 10.4)
- [x] 11. Neon Survivor: five waves, three enemy types, scenarios for CD-01/SCORE-01/HP-01/RESET-01, seeded fault, properties (Req 10.2, 10.4)
- [x] 12. Production builds exclude the bridge (`scripts/check-prod-bridge.mjs`) and carry license texts (Req 9.4)
- [x] 13. Bounded regression hook (`scripts/regression-hook.mjs`, `.kiro/hooks/regression.json`) (Req 9.3)
- [x] 14. Docs: install, originality, dependency inventory, third-party notices, benchmarks (Req 4.3)
- [x] 15. End-to-end check through the bundled server over stdio: session, observe, browser scenario with screenshots, experiment, workbench selection, prepare, apply, verify, report (verified manually on 24 Nov 2026; see `docs/BENCHMARKS.md`)
- [x] 16. GitHub Actions CI on every pull request: typecheck, docs rules checker, unit tests on Node 22 and 24, build with bridge and Power-bundle freshness checks, browser end-to-end tests and the latency gate (Req 9.3, 9.4)
- [x] 17. Tests for the starter, the dev bridge and the repository scripts; browser end-to-end suite in `tests/e2e/`
- [ ] 18. Flagship experiments in each game with a real user choice, recorded in `.gamedna/decisions.json`
- [ ] 19. Clean-install check on a second machine and in Kiro IDE Powers panel (PRD 10.2)
- [ ] 20. Controlled comparison against ordinary Kiro and small user pilot (PRD 10.3)
- [ ] 21. Public game builds, demo video, entrant originality review and Devpost submission (PRD 14.3)
