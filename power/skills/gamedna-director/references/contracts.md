# Game Contracts

A contract records only what crosses a subsystem boundary. If one module alone uses a value, it is tuning, not contract. A small game needs one `.gamedna/contract.md`. Add `src/contracts.ts` when more than one specialist will write code.

## Typed part: `src/contracts.ts`

`defineContracts` from `@gamedna/kit/contracts` validates and freezes the object, so a wrong unit, rate or owner fails at startup and in tests.

```ts
// check: compile
import { defineContracts, stepSeconds } from '@gamedna/kit/contracts';

export const CONTRACTS = defineContracts({
  name: 'harbor-run',
  spatial: { unit: 'meter', up: '+y', forward: '+z', ground: 'xz', scales: { playerHeight: 1.75, laneWidth: 3.5 }, transformOwners: { player: 'movement', camera: 'presentation' } },
  simulation: { hz: 60, maxStepsPerFrame: 5, deterministic: true, order: ['input', 'movement', 'collision', 'rules'], owners: { 'player.position': 'movement', score: 'rules' } },
  interaction: { actions: { move: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] }, jump: { kind: 'button', devices: ['keyboard', 'gamepad', 'touch'] } }, minTouchTargetPx: 48, reducedMotion: true },
  performance: { targetFps: 60, targetHardware: 'mid-range phone, 2022', simulationBudgetMs: 2, maxDrawCalls: 300, quality: ['high', 'low'] },
  events: ['jump', 'land', 'hit', 'pickup', 'finish'],
});
export const DT = stepSeconds(CONTRACTS);
```

| Section | Fix before | Typical values |
|---|---|---|
| `spatial` | Terrain, levels, collision, cameras, any asset | 3D: meters, `+y` up, `+z` forward. 2D: pixels or tiles, `-y` up (screen space) |
| `simulation` | Any rule code | 60 Hz, deterministic, explicit update order and one owner per state field |
| `interaction` | Controls, HUD prompts, touch layout | Semantic action names in lowerCamelCase |
| `performance` | Rendering and content density | 60 fps, simulation at most 2 to 4 ms per frame on the target device |
| `events` | HUD, audio, feedback, tests | Past-tense or noun names: `hit`, `pickup`, `lapComplete` |

Tests import `CONTRACTS` and check the code against it: the sim timestep equals `stepSeconds`, every emitted event is declared, collision radii equal the `scales`. `apps/ridgeline-racer/tests/contracts.test.ts` shows the pattern.

## Prose part: `.gamedna/contract.md`

Keep it under one screen. Use these headings and drop any that do not apply.

```markdown
# <Game> contract

Typed facts are in `src/contracts.ts`. This file holds what types cannot.

## Gameplay
- Core loop: one line.
- Rules that must never break, each testable: ...
- Events and what they mean: ...

## Visual
- Art direction, shape language, palette, materials, lighting direction, effects intensity.

## Integration
| Module | Owner | Reads | Writes |
|---|---|---|---|
```

## Changing a contract

Only the Director edits contracts. When a specialist reports a conflict, decide, edit the contract, then tell every specialist whose packet named that contract. Re-run the contract tests.
