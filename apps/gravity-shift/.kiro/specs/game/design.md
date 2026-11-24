# Design: Gravity Shift

- Rules live in `src/game/sim.ts` (`GravityShiftSim`), a fixed-step 60 Hz simulation built on `@gamedna/starter`. Phaser (`src/game/scene.ts`) only draws state and plays feedback.
- Levels are 30 x 16 grids of 32 px tiles in `src/game/levels.ts`. Lab levels isolate one mechanic for scenarios.
- Tuning values live in `src/game/tuning.json`. The allowlist with units and ranges lives in `.gamedna/project.json`.
- Movement model: approach-to-target horizontal speed with separate acceleration, deceleration and air control; constant gravity with terminal speed; jump buffer; coyote time after walking off ledges; variable jump height through a jump-cut multiplier.
- Collision: axis-separated AABB against solid tiles. Grounded means a collision on the gravity side this tick.
- Seeded fault `fault.coyoteAfterJump` (default false) grants coyote time after a jump. Scenario `double-jump-coyote` detects it through MOVE-01.
- Dev-only bridge: `src/dev/gamedna-adapter.ts`, loaded behind `import.meta.env.DEV`; `npm run build` fails if bridge markers appear in `dist/`.
