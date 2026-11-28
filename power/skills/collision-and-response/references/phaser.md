# Collision in Phaser 3.90 games

## Kit resolver or Arcade Physics

| Need | Choose |
|---|---|
| Deterministic rules that scenario tests replay exactly, custom gravity or one-way rules | Kit `moveAndCollideTiles` inside a `FixedStepSimulation` from `@gamedna/starter` |
| Many simple bodies, quick prototypes, no replay tests | Arcade Physics with `physics.add.collider` |
| Rotated rigid bodies, stacking, joints | Matter physics; not covered by GameDNA |

Arcade Physics steps with Phaser's own clock, so a scenario test outside the browser cannot reproduce it. The two starter games keep rules in the simulation and use Phaser only to draw.

## Tilemaps

For tilemap levels, mark solid tiles with `layer.setCollisionByProperty({ solid: true })` only if Arcade resolves them. With the Kit resolver, read the same property into a boolean grid once at level load and pass `isSolid(tx, ty)` to `moveAndCollideTiles`.

## Debug view

`physics.world.drawDebug` covers Arcade bodies only. For the Kit resolver, draw boxes with a `Phaser.GameObjects.Graphics` behind a debug key.
