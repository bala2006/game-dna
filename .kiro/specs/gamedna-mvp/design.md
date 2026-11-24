# Design: GameDNA MVP (v0.1)

Requirements: `.kiro/specs/gamedna-mvp/requirements.md`. Product brief: `docs/GameDNA_PRD_v1.1_Kiroween.md`.

## 1. Technology decision

The user asked for the stack with the best speed, latency and reliability, and asked that Rust and other languages be considered. The latency that matters to a developer comes from three places: MCP call overhead, browser round trips while running a scenario, and simulation cost. The comparison below scores each option against those and against install reliability.

| Option | Strengths | Weaknesses for GameDNA | Verdict |
|---|---|---|---|
| Rust (`rmcp` official SDK, CDP crate for the browser) | Fast cold start, low memory, strong type safety | Phaser games and the adapter are JavaScript, so the scenario evaluator would be written twice (Rust and TS) or shipped as WASM. Browser control would rely on a community CDP crate instead of official Playwright. A Power install from GitHub would need prebuilt binaries for each OS and CPU. | Rejected for v0.1. Revisit for CPU-heavy asset work. |
| Go (official MCP SDK, chromedp) | Fast start, single binary | Same duplication and per-platform binary problem as Rust | Rejected |
| Python (official MCP SDK, Playwright) | Official Playwright | Slower start, second runtime to install, duplicated evaluator | Rejected |
| Bun | Fast start | Playwright support on Bun is less proven; Kiro users already have Node | Rejected |
| TypeScript on Node.js 22 LTS | One language for game, adapter, evaluator, MCP server and workbench. Official MCP SDK and official Playwright. The same evaluator code runs in Vitest, in the browser and in the server. | Larger cold start than a native binary | **Chosen** |

Latency comes from the architecture more than the language, so the design does the following:

- **One round trip per scenario.** The MCP server sends the whole scenario to the page in one `page.evaluate` call. The adapter runs every tick in-page and returns the trace. Driving each tick over CDP would cost one round trip per tick.
- **Pure fixed-step simulation.** Game rules live in plain TypeScript classes that Phaser only draws. A 600-tick scenario runs in milliseconds, runs headless in Vitest, and replays exactly.
- **Single-file server bundle.** esbuild bundles the MCP server, Zod and the MCP SDK into `power/server/gamedna-mcp.mjs`, so start-up does not resolve hundreds of modules.
- **Warm browser per session.** A session keeps one Chromium page open; tools reuse it.
- **Measured, not promised.** `npm run bench:mcp` measures p95 latency for status and validation calls (PRD 10.2 target: under 250 ms).

Reliability choices: Zod schemas at every trust boundary, typed error codes, atomic file writes (write to a temp file, then rename), bounded inputs, process-group cleanup on exit, and no generic shell tool.

## 2. Packages

| Path | Role | Runs in |
|---|---|---|
| `packages/core` | Schemas, errors, seeded PRNG, scenario runner and assertions, trace comparison, metrics, experiments, decisions, reports | Node and browser |
| `packages/core/src/node` | Path guard, revision hashing, atomic JSON store | Node |
| `packages/assets` | Style packs, SVG/PNG/WAV generators, validation | Node and browser (PNG encoder is Node) |
| `packages/starter` | Shared lean game skeleton: fixed-step loop, input, tuning access, synth audio, Phaser boot helpers | Browser |
| `packages/phaser-adapter` | Dev-only `window.__GAMEDNA__` bridge | Browser (dev build only) |
| `packages/mcp` | stdio MCP server, sessions, browser runner, workbench HTTP server | Node |
| `packages/workbench` | React comparison UI served by the MCP server | Browser |
| `apps/gravity-shift`, `apps/neon-survivor` | Demo games | Browser |
| `power/` | Kiro Power: `plugin.json`, `mcp.json`, skills, bundled server | Kiro |

## 3. Harness contract

Each game exposes a `GameHarness` around its simulation:

```ts
interface GameHarness {
  readonly tickRateHz: number;
  reset(seed: number, params: ParameterValues, setup: ScenarioSetup): void;
  setInput(key: string, down: boolean): void;
  step(): void;
  snapshot(): FlatState;
  drainEvents(): RawEvent[];
  currentTick(): number;
}
```

`runScenario(harness, scenario, params)` in core drives the harness, records inputs, samples and events, and evaluates assertions. The same function runs in Vitest (headless) and in the page (through the adapter).

## 4. Data files per game project

- `.gamedna/project.json`: design record, constraints, parameter allowlist with ranges, approved commands, metric families.
- `src/game/tuning.json`: the parameter values the game reads. This is native game configuration and the file Kiro edits when applying a decision.
- `.gamedna/scenarios/*.json`: scenarios.
- `.gamedna/experiments/<id>.json`: experiment, variants, evidence and selection.
- `.gamedna/decisions.json`: decision records.
- `.gamedna/evidence/`: traces and screenshots (git-ignored).
- `.gamedna/assets-manifest.json`: generated asset provenance.

Baseline revision is the SHA-256 of `project.json` plus the tuning file. Any change to either makes an older experiment stale.

## 5. Decision lifecycle

`proposed → selected → applied → verified`, with terminal `rejected`, `stale`, `failed` and `reverted`. Transitions are validated in `packages/core/src/decisions.ts`. A selection is created only by the workbench (user click) or by `gd_record_selection` carrying the user's own words from chat.

## 6. Workbench security

- Binds to `127.0.0.1` on a random port.
- Per-process token, passed in the URL fragment so it never reaches server logs, then sent as `X-GameDNA-Token`.
- `Host` must be the loopback host and port. `Origin` must match on state-changing requests.
- CSP limits frames to the game origin from the active session.

## 7. Testing strategy

- Core: schema validation, PRNG determinism, assertion evaluation, trace comparison, decision transitions, experiment validation, stale baseline, path guard (traversal and symlink escape).
- Assets: byte determinism per generator, validation diagnostics, palette membership.
- Games: fast-check properties for protected rules, scenario files executed headlessly, seeded faults detected.
- MCP: tool handlers against temporary project folders, unsupported engine, command allowlist.
