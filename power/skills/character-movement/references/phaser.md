# Character movement in Phaser 3.90 games

## Drawing the Kit platformer body

- `PlatformerBody` stores the box's min corner. Phaser images default to origin 0.5, so draw at `(b.x + b.w / 2, b.y + b.h / 2)` plus any HUD offset of the world container.
- The hitbox comes from data, not from the texture. Gravity Shift uses a 20 by 26 px box in 32 px tiles and scales the sprite (1.45) so the visible body, not the padded SVG, matches it.
- Under reversed gravity, `setFlipY(b.gravitySign < 0)` and anchor squash on the side the body stands on.
- Read `coyote`, `buffer` and `grounded` only for display. Animation picks idle, run, rise and fall from `vx`, `vy * gravitySign` and `grounded`.

## One-way platforms from a tilemap

`moveAndCollideTiles` has no one-way tiles. Make the `isSolid` callback depend on the body's state at the start of the tick: a one-way tile at row `ty` is solid only while the body moves along gravity and its feet started at or above the tile's top edge (`b.y + b.h <= ty * tileSize` for normal gravity). Drop-through is a rule that clears that test for 10 to 15 ticks.

## When a project already uses Arcade Physics

Keep rules in the Kit body if the game has scenario tests. If the player stays on Arcade:

- Ground is `body.blocked.down` for tiles and world bounds (`onFloor()` checks only this) or `body.touching.down` for other bodies. Check both.
- `setDragX` is linear deceleration in px/s² with `setDamping(false)`, but Arcade applies drag only while acceleration is zero. Turnaround therefore needs its own acceleration boost.
- `setMaxVelocity(x, y)` caps run and fall speed; the fall cap still has to stay under half a tile per physics step.
- Coyote time and the jump buffer are not built in. Count them in physics steps, not with `this.time` events.
