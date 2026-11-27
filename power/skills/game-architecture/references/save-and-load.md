# Saves, serialization and migration

## Contents

- What goes into a save
- When to save
- Format and storage
- Migrations
- JSON traps
- A complete save slot

## What goes into a save

| Save | Rebuild instead |
|---|---|
| Level or room id, checkpoint id | Level geometry, nav grids, spatial hashes |
| Collected and unlocked ids, story flags, quest counters | Totals derived from them (keys held, completion percent) |
| `inventory.toJSON()`, equipped ids | Stats derived from equipment |
| Flow state and `timeInState`, simulation tick | Scene objects, sprites, meshes, sounds |
| `rng.state()` for every rule stream | Presentation streams (reseed with `deriveSeed`) |
| Settings, in their own key | Anything read from the tuning file |

Saved references are ids, never array indices or object references.

## When to save

- At checkpoints, room entries and level ends, when no projectiles, hit-stop or half-finished actions exist. Saving mid-action means serializing every transient object with its id and tick counters.
- On `onPageHidden`, because mobile browsers may kill a hidden tab without another event.
- Never every tick: Web Storage writes are synchronous and block the frame.

## Format and storage

`createSaveSystem` writes `gds:<version>:<checksum>:<json>` with a 32-bit FNV-1a checksum. The checksum catches truncation and hand edits by accident; it is not tamper protection. `save` returns false when storage refuses (quota, some private modes), so tell the player instead of failing silently. Web Storage holds about 5 MB per origin in most browsers. Keep one key per slot, plus a backup key written with the previous good save; when `read()` reports `checksum` or `malformed`, offer the backup.

## Migrations

- `migrations[v]` turns version `v` data into version `v + 1`. Each is a pure function of the old data.
- Bump the version for every format change, including renames and new required fields. Never edit a migration that has shipped; add the next one.
- Removed content needs a mapping: a migration replaces retired item ids with their successors or refunds them.
- Keep one fixture string per shipped version in the tests and assert each one migrates and passes `validate`.
- A save from a newer build reads as `future-version`. Refuse it rather than guess, so a downgrade does not destroy progress.

## JSON traps

- `Set` and `Map` serialize as `{}`. Store sorted arrays and rebuild.
- `Infinity`, `-Infinity` and `NaN` become `null`; `-0` becomes `0`; `undefined` fields disappear.
- Typed arrays become objects with numeric keys. Convert with `Array.from` and back.
- Class instances lose their methods. Save plain data and rebuild objects from it.
- Numbers round-trip exactly, so a saved and reloaded run stays deterministic if every rule stream's state is saved.

## A complete save slot

```ts
// check: compile
import { createSaveSystem, memoryStorage } from '@gamedna/kit/save';
import { createRng, deriveSeed, restoreRng } from '@gamedna/kit/random';
import { createInventory, type InventoryJSON } from '@gamedna/kit/inventory';
import { createStateMachine } from '@gamedna/kit/fsm';

type Flow = 'title' | 'playing' | 'paused' | 'gameOver';
type FlowEvent = 'start' | 'pause' | 'resume' | 'die' | 'restart';
const FLOWS: readonly Flow[] = ['title', 'playing', 'paused', 'gameOver'];

/** Version 2 renamed `keys` to `collected` and added the flow state and the rule stream. */
interface SaveV2 { level: string; collected: string[]; inventory: InventoryJSON; flow: Flow; flowTicks: number; rng: number }

const isSave = (d: unknown): d is SaveV2 => {
  const s = d as Partial<SaveV2> | null;
  return !!s && typeof s.level === 'string' && Array.isArray(s.collected) && FLOWS.includes(s.flow as Flow)
    && Number.isInteger(s.flowTicks) && Number.isInteger(s.rng) && typeof s.inventory === 'object';
};

const slot = createSaveSystem<SaveV2>({
  key: 'my-game.slot1',
  version: 2,
  storage: memoryStorage(), // pass localStorage in the browser
  migrations: {
    1: (d) => {
      const v1 = d as { level: string; keys: string[]; inventory: InventoryJSON };
      return { level: v1.level, collected: v1.keys, inventory: v1.inventory, flow: 'playing', flowTicks: 0, rng: deriveSeed(1, v1.level) };
    },
  },
  validate: isSave,
});

const inventory = createInventory({ items: [{ id: 'potion', maxStack: 9 }, { id: 'lantern' }], slots: 8 });
const flow = createStateMachine<Flow, FlowEvent>({
  initial: 'title',
  transitions: { title: { start: 'playing' }, playing: { pause: 'paused', die: 'gameOver' }, paused: { resume: 'playing' }, gameOver: { restart: 'playing' } },
});
let rng = createRng(42);

export function writeSave(level: string, collected: ReadonlySet<string>): boolean {
  return slot.save({ level, collected: [...collected].sort(), inventory: inventory.toJSON(), flow: flow.state, flowTicks: flow.timeInState, rng: rng.state() });
}

/** Restores the slot; returns the problems found, empty when the load was clean. */
export function readSave(): string[] {
  const r = slot.read();
  if (!r.ok) return [r.problem];
  const problems = inventory.load(r.data.inventory);
  flow.reset(r.data.flow, r.data.flowTicks);
  rng = restoreRng(r.data.rng);
  return problems;
}
```
