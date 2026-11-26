# Trail Walk contract

Typed facts (units, timestep, update order, actions, budgets, events) are in `src/contracts.ts`. This file holds what types cannot.

## Gameplay
- Core loop: explore a seeded valley on foot and collect eight trail markers; the clock stops at the last one.
- Rules: a marker counts only when the walker is within reach and presses interact; buildings, trees and parked cars block movement.
- Events: `collect`, `finish`, `jump`, `land`.

## Visual
- Art direction: calm morning in a lived-in village at the valley floor.
- Shape language: soft rounded terrain, simple house volumes, people at real human proportions.
- Palette: dewy greens, warm wood and plaster, a single bright marker color for objectives.
- Effects intensity: low; guidance comes from landmarks and marker color, not effects.

## Integration
| Module | Owner | Reads | Writes |
|---|---|---|---|
| `src/sim.ts` | simulation | contracts, layout | walker state, collected markers |
| `src/layout.ts` | world | contracts, Kit world | world data (boxes, trees, markers) |
| `src/scenery.ts` | visual | layout, Kit stage | scene graph only |
| `src/main.ts` | integration | everything | presentation only |
