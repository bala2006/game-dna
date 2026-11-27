# Waves, spawns and encounter placement

## Waves

- Neon Survivor's waves: `3 + 2n` enemies; drifters take 45 percent of rolls from wave 2; from wave 3 brutes take 20 percent and drifters 25; one spawn every 24 ticks (0.4 s), 90 ticks (1.5 s) of calm between waves, five waves.
- Grow a wave's budget 20 to 50 percent per wave, or linearly for long runs. Give each kind a cost from its threat (a chaser 1, a brute 4) and spend the budget with `weightedPick` over the kinds unlocked so far.
- Unlock one new kind every 2 or 3 waves and let players meet it alone or with weaker kinds first.
- Spawn a wave over 3 to 10 s rather than all at once, and keep 1.5 to 3 s of calm between waves. A boss or elite wave every 5 waves breaks the pattern.
- Cap enemies alive at once (40 to 80 on phones); queued spawns wait for deaths.

## Spawn points

- At least 200 px from the player in a 960 by 540 arena (Neon Survivor tries 12 seeded edge points), or 8 to 12 m in 3D, and outside the view when possible.
- Spawns inside the view show a marker for 0.5 to 1 s, and the enemy stays harmless for another 0.3 to 0.5 s.
- A spawn cell must be walkable and reachable: `isWalkable(grid, x, y)` and a finite distance in the flow field toward the player.
- Never spawn behind a door the player has not opened, or in the room the player just cleared.

## Encounters in generated dungeons

`generateDungeon` returns rooms, door tiles, `start`, `end` and the walking `distance` from `start` to every tile.

- Scale each room's budget by its distance from the start; the start room gets none and the end room gets the boss or the hardest group.
- Rooms only reachable through loops suit optional elites with better rewards.
- Keep enemies 3 or more tiles away from the door the player enters through, so they do not attack on the first tick.

```ts
// check: compile
import { createRng, deriveSeed, weightedPick, type Rng } from '@gamedna/kit/random';
import { generateDungeon, type Dungeon } from '@gamedna/kit/rooms';

interface Kind { id: string; cost: number; weight: number; fromWave: number }
const KINDS: readonly Kind[] = [
  { id: 'chaser', cost: 1, weight: 6, fromWave: 1 },
  { id: 'drifter', cost: 2, weight: 3, fromWave: 2 },
  { id: 'brute', cost: 4, weight: 1, fromWave: 3 },
];

/** Kinds for wave `n` from a budget growing 30 percent per wave. The same Rng state gives the same wave. */
export function composeWave(rng: Rng, n: number, base = 5): string[] {
  let budget = Math.round(base * Math.pow(1.3, n - 1));
  const out: string[] = [];
  for (;;) {
    const i = weightedPick(rng, KINDS, (k) => (k.fromWave <= n && k.cost <= budget ? k.weight : 0));
    const kind = KINDS[i];
    if (!kind) return out;
    out.push(kind.id);
    budget -= kind.cost;
  }
}

/** Encounter budget per room, rising with walking distance from the start; the start room gets 0. */
export function roomBudgets(d: Dungeon, maxBudget: number): number[] {
  const steps = d.rooms.map((r) => Math.max(0, d.distance[r.cy * d.width + r.cx] ?? 0));
  const far = Math.max(1, ...steps);
  return steps.map((s) => (s === 0 ? 0 : Math.round(maxBudget * (0.3 + (0.7 * s) / far))));
}

const seed = 2024;
const dungeon = generateDungeon({ width: 64, height: 48, rng: createRng(deriveSeed(seed, 'map')) });
export const budgets = roomBudgets(dungeon, 12);
export const thirdWave = composeWave(createRng(deriveSeed(seed, 'spawns')), 3);
```
