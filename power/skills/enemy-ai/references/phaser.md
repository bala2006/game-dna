# Enemy AI in Phaser 3.90 games

## A nav grid from a tilemap

Build the grid once at level load from the layer the player collides with:

```ts
// check: compile
import Phaser from 'phaser';
import { createGrid, type Grid } from '@gamedna/kit/nav';

/** Cost 0 for tiles marked `solid` in Tiled, `cost` from a tile property, otherwise 1. */
export function gridFromLayer(layer: Phaser.Tilemaps.TilemapLayer): Grid {
  return createGrid(layer.layer.width, layer.layer.height, (x, y) => {
    const tile = layer.getTileAt(x, y);
    if (!tile) return 1;
    const props = tile.properties as { solid?: boolean; cost?: number };
    return props.solid ? 0 : Math.max(1, props.cost ?? 1);
  });
}
```

- `getTileAt` returns null for empty tiles unless `nonNull` is passed; empty means walkable here.
- Convert positions with `Math.floor(x / tileWidth)` in the simulation, not `layer.worldToTileXY`, which applies the layer's position and scale and lives in presentation.
- Path cells map back to tile centers at `(cx + 0.5) * tileWidth`.

## Arcade shortcuts

`this.physics.moveToObject(sprite, target, speed)` points velocity straight at the target: no arrival, no separation, no paths around walls, and it runs on Phaser's clock. It is fine for a throwaway prototype; enemies in a tested game steer in the simulation and the sprites follow.

## Debug overlay

Draw paths and flow-field arrows on one `Phaser.GameObjects.Graphics` cleared each frame behind a debug key: `lineStyle(1, 0x00ffaa)`, then `lineBetween` per path segment. Hide it from screenshots used as visual baselines.
