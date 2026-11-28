# Requirements: GameDNA for every engine (v0.2)

Source: the owner's direction after v0.1. GameDNA is passive software that makes Kiro better at building games. Kiro controls all of it. It supports Godot, Unity, Unreal Engine, Android with Kotlin, Android with C++, and HTML, CSS and JavaScript games, plus any other engine that implements the bridge protocol. iOS and macOS targets are out of scope. Acceptance criteria use EARS phrasing.

## Introduction

v0.1 measured Phaser games only. Its scenario engine, assertions, metrics, experiments and decisions do not depend on Phaser. Only three parts do: engine detection, the in-page bridge, and the command runner that accepts npm scripts only. v0.2 replaces those three parts with engine-neutral ones and adds one small dev-only adapter per engine.

## Requirement 1: Passive

1. The MCP server SHALL start a process, open a listener, or write a file only while it handles a tool call that asks for that.
2. A session or workbench SHALL stay open until `gd_stop_session` or server exit, and SHALL do nothing between tool calls except answer requests.
3. An adapter SHALL send only its `hello` message and replies to requests. It SHALL NOT act on the game unless a request tells it to.
4. An adapter SHALL stay inert unless the game is a development build AND the launch passed a bridge address.
5. No tool SHALL rank variants or infer the user's choice.

## Requirement 2: Kiro controls GameDNA completely

1. Every GameDNA capability SHALL be reachable through an MCP tool, including detection, adapter installation, engine tool paths, sessions, input, stepping, scenarios, experiments, choices, verification and reports.
2. No step SHALL require the user to run a GameDNA command or edit a GameDNA file by hand.
3. The user SHALL make only subjective choices: concept, style and variant.

## Requirement 3: Engine detection

1. WHEN Kiro calls `gd_project_status` THEN the system SHALL return the engine id, version, runtime kind, adapter state, the engine tools it resolved, and whether that engine's adapter is verified.
2. The system SHALL detect Godot 4, Unity, Unreal Engine 5, Android Kotlin, Android C++, Phaser, three.js and plain web games from project files alone.
3. IF a folder has an Xcode project or workspace and no supported engine THEN the system SHALL return `UNSUPPORTED_ENGINE` and say that iOS and macOS are out of scope.
4. WHERE `.gamedna/project.json` declares `engine.id: "custom"` the system SHALL accept the project and use its declared runtime and commands.

## Requirement 4: One bridge protocol

1. Every adapter SHALL implement the same protocol v1 and its 7 methods: `reset`, `advance`, `snapshot`, `events`, `parameters`, `control` and `screenshot`.
2. Native and Android games SHALL speak it as newline-delimited JSON over loopback TCP. Browser games SHALL expose it as `window.__GAMEDNA__.call`.
3. Scenario semantics, assertions, metrics and reproducibility SHALL stay in TypeScript. An adapter SHALL implement only the protocol methods.
4. The system SHALL validate every adapter reply with a schema before use.

## Requirement 5: Commands

1. The system SHALL run only commands declared in `.gamedna/project.json`, as an npm script or an argument list.
2. An argument list's executable SHALL be a tool that the engine profile allows. It SHALL never be a shell or script interpreter.
3. The system SHALL never pass a command through a shell. WHEN Windows needs `cmd.exe` to run a `.cmd` or `.bat` file THEN every argument SHALL match a safe character set.
4. Engine tool paths SHALL come from the environment, `PATH`, known install folders, or `gd_configure_tool`. They SHALL never be written into the game repository.

## Requirement 6: Sessions on every runtime

1. WHEN Kiro starts a session for a native game THEN the system SHALL listen on `127.0.0.1` on a free port, launch the declared command with the address and a one-time token, and wait for a `hello` with that token.
2. WHEN the game is an Android app THEN the system SHALL forward the port with `adb reverse`, pass the address and token through `debug.gamedna.*` system properties, and launch the declared activity.
3. WHEN the session's `hello` does not arrive within the command's ready timeout THEN the system SHALL return `ADAPTER_MISSING` and stop the process it launched.

## Requirement 7: The same scenarios on every engine

1. `gd_run_scenario`, `gd_observe`, `gd_compare_experiment` and `gd_verify` SHALL accept a session on any runtime.
2. A scenario file SHALL mean the same thing on every engine.
3. A conformance test SHALL run one fixture scenario through the TypeScript reference loop and through each adapter, and SHALL require identical samples and events.

## Requirement 8: Assets

1. `gd_generate_asset` SHALL write to the engine's default asset folder unless Kiro passes `dir`.
2. WHERE the target folder is an Android resource folder the asset id SHALL match `[a-z0-9_]+`.

## Requirement 9: Adapters ship with the Power

1. The Power SHALL ship each adapter's source in `power/adapters/<engine>/`.
2. `gd_install_adapter` SHALL copy the adapter into the project's development-only location and return the wiring lines that Kiro must add.
3. An adapter SHALL be excluded from release builds by the engine's own mechanism: `OS.is_debug_build()` in Godot, `DEVELOPMENT_BUILD` or `UNITY_EDITOR` in Unity, `!UE_BUILD_SHIPPING` in Unreal, the `debug` source set on Android, and the dev guard on the web.

## Requirement 10: Honest support claims

1. An engine SHALL count as verified only after its conformance test passes against the real engine.
2. `gd_project_status`, the README and the skills SHALL label every other engine "unverified".
