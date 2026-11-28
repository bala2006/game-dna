# Tasks: GameDNA for every engine (v0.2)

Requirements: `requirements.md`. Design: `design.md`. A checked item is implemented and covered by a test. "Verified" means the conformance test passed against the real engine.

## Phase 1: protocol, commands, process sessions, Godot

- [x] 1.1 `packages/core/src/bridge.ts`: protocol v1 schemas, `advanceHarness` reference loop, `ScenarioRecorder`, async `runScenarioOn` (Req 4, 7)
- [x] 1.2 `ScenarioExecution` and `runScenario` rebuilt on the recorder with unchanged results (Req 7.2)
- [x] 1.3 `CommandSchema` with `argv`, `cwd`, kinds `run`, `headless`, `install`; `ADAPTER_ERROR` code (Req 5)
- [x] 1.4 `packages/mcp/src/engines.ts`: the engine table, detection, iOS and macOS refusal (Req 3)
- [x] 1.5 `packages/mcp/src/commands.ts`: tool resolution, shell refusal, safe `.cmd` spawning (Req 5)
- [x] 1.6 `packages/mcp/src/bridge-server.ts`: loopback listener, token check, one request at a time, reply validation (Req 4, 6)
- [x] 1.7 Process sessions; `gd_observe`, `gd_run_scenario`, `gd_verify` and `gd_compare_experiment` through `RemoteDriver` (Req 6, 7)
- [x] 1.8 `gd_install_adapter` and `gd_configure_tool` (Req 2, 9)
- [x] 1.9 Godot adapter in `power/adapters/godot/` and a fixture game (Req 9)
- [x] 1.10 Conformance: one fixture scenario through the TypeScript loop and through Godot 4 headless, with identical samples and events (Req 7.3, 10)

## Phase 2: browser games on protocol v1

- [ ] 2.1 Plain web adapter `gamedna-bridge.js` and an HTML fixture
- [ ] 2.2 Phaser adapter moved onto protocol v1, and the in-page `ScenarioExecution` deleted
- [ ] 2.3 three.js apps wired to the web adapter

## Phase 3: Android

- [ ] 3.1 Kotlin adapter in the `debug` source set, with a no-op `release` stub
- [ ] 3.2 C++ adapter for NDK games
- [ ] 3.3 Android sessions: `adb reverse`, `setprop`, install, launch, stop
- [ ] 3.4 Emulator conformance for both adapters

## Phase 4: Unity and Unreal

- [ ] 4.1 Unity adapter (C#, `DEVELOPMENT_BUILD || UNITY_EDITOR`)
- [ ] 4.2 Unreal adapter (C++ plugin, `!UE_BUILD_SHIPPING`)
- [ ] 4.3 Conformance once an editor is available; "unverified" until then

## Phase 5: experience and docs

- [ ] 5.1 Workbench "Play" action for native variants
- [ ] 5.2 Engine skills and `gamedna-mode` build targets for every engine
- [ ] 5.3 Steering, README, install guide and a PRD addendum
- [ ] 5.4 Godot conformance in CI
