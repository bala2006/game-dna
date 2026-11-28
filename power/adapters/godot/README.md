# GameDNA adapter for Godot 4

This adapter lets GameDNA drive a Godot 4 game tick by tick. It speaks GameDNA bridge protocol v1. GameDNA can reset the game with a seed and tuning values, step it with scripted input, and read back samples and events. The scenario, assertion and metric logic stays in the GameDNA MCP server. The adapter only runs the game's simulation and answers requests.

## Install

Copy `addons/gamedna/` into your project's `addons/` folder. Then add two lines.

1. In `project.godot`, register the autoload:

   ```ini
   [autoload]

   GameDNA="*res://addons/gamedna/gamedna.gd"
   ```

2. In the node that owns your simulation, register it as the harness, for example in `_ready`:

   ```gdscript
   GameDNA.register(self)
   ```

## Harness contract

The node you register must provide these methods.

| Method | Purpose |
|---|---|
| `gamedna_tick_rate() -> int` | Fixed ticks per second, usually `Engine.physics_ticks_per_second`. |
| `gamedna_reset(seed: int, params: Dictionary, setup: Dictionary)` | Restart the simulation. The same seed and params must give the same run. |
| `gamedna_set_input(key: String, down: bool)` | Latch one action. Live input and scripted input use the same latch. |
| `gamedna_step()` | Advance exactly one fixed tick. |
| `gamedna_snapshot() -> Dictionary` | Flat state with String keys and bool, int, float, String or null values, for example `"player.x": 12`. |
| `gamedna_drain_events() -> Array` | Events since the last call, each `{ "type": String, "data": Dictionary }`. |
| `gamedna_tick() -> int` | Ticks since the last reset. |
| `gamedna_parameters() -> Dictionary` | Current tuning values, including overrides from `reset`. |
| `gamedna_set_live(live: bool)` | `true`: the game steps itself from player input. `false`: only GameDNA steps it. |

Keep the rules deterministic. Use the seed for randomness and do not read the clock in `gamedna_step`. Godot's JSON parser turns every number into a float, so convert integer tuning values with `int()`.

## When it runs

The adapter does nothing unless all of these are true:

- The game runs as a debug build, for example from the editor binary. Release exports never connect.
- `GAMEDNA_BRIDGE` is set to `127.0.0.1:<port>`.
- `GAMEDNA_TOKEN` is set.

GameDNA sets both variables when it starts the game. The adapter then connects to the MCP server, sends one hello line, and waits for the server's welcome. After the welcome, it answers each request with one reply line. It never sends anything else. Problems go to the Godot log as warnings. Screenshots work only with a display. In a `--headless` run, `screenshot` returns `UNSUPPORTED`.
