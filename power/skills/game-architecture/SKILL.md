---
name: game-architecture
description: How game code is organized. Update order, flow states, scene setup and teardown, entity records, gameplay events, asset loading, data-driven content, saves and migrations. Use when restarts leak state, systems call each other mid-update or saves break. Not for the timestep (fixed-step-simulation) or rule design (game-mechanics).
license: MIT
metadata:
  owner: gameplay
  topics: game loop structure, scene lifecycle, state machines, entity architecture, gameplay events, resource loading, data-driven content, save and load, serialization and migration
  engines: portable, three@0.170, phaser@3.90
  kit: kit/fsm, kit/events, kit/save, kit/contracts, kit/pool, starter
---

# Game architecture

## Scope

Owns what runs in what order inside a tick, flow between title, play, pause and results, clean level start and teardown, how entities, content and events are represented, and saves. When the tick rate or interpolation is the question, use `fixed-step-simulation`; for what the rules should be, use `game-mechanics`; for enemy decision structures, use `enemy-ai`.

## Decisions

- **One update order.** List systems in the contract's `simulation.order` (`input, ai, movement, collision, combat, rules`) and call them in that order; `simulation.owners` names each field's one writer. Systems react to each other through events, never by calling in mid-update.
- **Flow is one state machine**: `title`, `playing`, `paused`, `gameOver`, `victory`. Timed states use `timeInState` in ticks. Stray events are rejected and counted. Every terminal state has an exit.
- **Restart equals a fresh start.** One `reset(seed)` rebuilds every field, timer, collection and stream, and the constructor calls it too, as in Neon Survivor's `startRun`.
- **Entities are plain records** in arrays, with a `kind` and a stats table keyed by kind (Neon Survivor's `ENEMY_STATS`). Ids come from a counter and are never reused in a run; events and saves use ids. Mark the dead during the tick and compact once at its end. An ECS pays off only past thousands of entities or dozens of component types. Pool spawned objects with a hard cap: refuse gameplay spawns when full, recycle the oldest effect.
- **Events are deferred.** Systems `emit`; one `flush` at the end of the tick dispatches in emission order; handlers' emits wait for the next flush. Payloads are plain data with ids. Names come from the contract's `events`.
- **Load before the first tick.** The simulation never awaits, and rules never read texture or model sizes.
- **Content is data**: levels, kinds, items, waves, quests and dialogue in typed tables or JSON with stable string ids, validated at load (unique ids, resolving references, numbers in range). Tunables live in one tuning file read through `num`.
- **Save what cannot be rebuilt**: progress ids, inventory, flags, flow state with `timeInState`, `rng.state()`. Save at checkpoints and on `onPageHidden`. Bump the version on every format change and add a migration; never edit a shipped one. See `references/save-and-load.md`.

## Mistakes

- The second run is easier: collected keys or last wave's enemies survive the restart.
- After three restarts one key press fires four times: listeners added on start, never removed.
- `splice` inside the enemy loop skips the next enemy.
- Pause as a flag some systems check, so other timers keep running.
- A saved `Set` loads as `{}`; `Infinity` loads as `null`.
- Saved array indices load the wrong items after a content update.
- The first explosion stalls because its assets load on demand.

## Reuse

- `@gamedna/kit/fsm`: `createStateMachine({ initial, transitions, onEnter, onExit })`, `send`, `tick`, `timeInState`, `reset(state, ticks)`.
- `@gamedna/kit/events`: `createEventQueue<Events>({ capacity, allowed })`, `emit`, `on`, `flush`, `drain`.
- `@gamedna/kit/save`: `createSaveSystem({ key, version, migrations, storage, validate })`, `read` names the failure, `memoryStorage` for tests.
- `@gamedna/kit/contracts`: `defineContracts`, `assertEvent`. `@gamedna/kit/pool`: `createPool({ create, reset, max, whenFull })`.
- `@gamedna/starter`: `FixedStepSimulation` with `onReset`, `update`, `snapshot`, `emit`.

The game keeps its systems, content formats and save schema.

## Engines

- three.js 0.170: read `references/three.md` when tearing down levels, loading models or mapping records to meshes.
- Phaser 3.90: read `references/phaser.md` when using scene restarts, the loader or the JSON cache.

## Verify

- `snapshot()` after a restart equals `snapshot()` after `reset` with the same seed.
- Every flow state reaches `playing` again; unknown events only raise `rejected`.
- A full scenario ends with the event queue's `dropped` and `rejected` at 0.
- `decode(encode(state))` round-trips; a fixture per shipped version migrates and validates.
- A unit test loads every level and table and resolves every id.
