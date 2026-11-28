# Generated grids as Phaser 3.90 tilemaps

## From Kit tiles to a tilemap

`generateDungeon` returns `tiles` as a row-major `Uint8Array` of `TILE` values. Convert it to rows of tileset indices once, then build a data tilemap:

```ts
// check: compile
import Phaser from 'phaser';
import { createRng } from '@gamedna/kit/random';
import { TILE, generateDungeon } from '@gamedna/kit/rooms';

export function buildDungeonLayer(scene: Phaser.Scene, seed: number) {
  const d = generateDungeon({ width: 60, height: 40, rng: createRng(seed), loops: 0.15 });
  const rows = Array.from({ length: d.height }, (_, y) =>
    Array.from({ length: d.width }, (_, x) => (d.tiles[y * d.width + x] === TILE.wall ? 0 : 1)));
  const map = scene.make.tilemap({ data: rows, tileWidth: 32, tileHeight: 32 });
  const tiles = map.addTilesetImage('tiles');
  if (!tiles) throw new Error('tileset "tiles" is not loaded');
  return { dungeon: d, map, layer: map.createLayer(0, tiles, 0, 0) };
}
```

Keep collision on the same `rows` with the Kit tile resolver, so rules and drawing never disagree.

## Autotiling

Pick each wall tile from its neighbors instead of drawing one block everywhere. A 4-bit mask (north 1, east 2, south 4, west 8) selects one of 16 tiles. An 8-bit mask that counts corners only when both adjacent edges are set gives the 47-tile blob set. Compute masks in the pure layout module and store the index, so tests can check them.

## Large maps

`TilemapLayer` draws only tiles inside the camera, plus `setCullPadding(x, y)` tiles around it. A whole dungeon of a few hundred tiles a side needs no streaming. Bound the camera with `cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)`.

## Scatter in 2D

`scatter` works in pixels as well as meters. Use spacing of about one sprite width for props and accept only floor tiles: `accept: (x, y) => rows[Math.floor(y / 32)]?.[Math.floor(x / 32)] === 1`.
