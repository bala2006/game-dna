# Design: Neon Survivor

- Rules live in `src/game/sim.ts` (`NeonSurvivorSim`), a fixed-step 60 Hz simulation built on `@gamedna/starter`. Phaser (`src/game/scene.ts`) draws and plays feedback.
- Enemies: chaser (steers toward the player), drifter (bounces), brute (slow, 3 HP). Waves spawn seeded at the arena edge, at least 200 px from the player.
- Pulse attack: radial hit within `attack.radius`, gated by a tick cooldown. Hit-stop freezes the whole world, cooldown included.
- Feedback events (`hitstop`, `knockback`, `flash`, `shake`) carry the `hitId` of the hit they answer, so GameDNA can measure hit-to-feedback timing.
- Seeded fault `fault.duplicateDamage` (default false) delivers damage twice and removes the kill guard. Scenario `score-once` detects it through SCORE-01.
- Lab arenas (`lab-dummies`, `lab-swarm`) isolate combat and damage for scenarios.
