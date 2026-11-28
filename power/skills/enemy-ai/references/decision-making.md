# Decision making: trees, utility and modes

## Contents

- Behavior tree patterns
- Kit tree semantics that change designs
- Utility curve design
- A brute with a tree, a utility mode and steering

## Behavior tree patterns

- Root `selector` in priority order: flee when nearly dead, attack when in range and holding a token, chase when the target is seen, search the last known position, then patrol or wander.
- Each branch is a `sequence` of cheap `condition` checks followed by one `action`. Expensive checks such as line of sight run on a staggered schedule and store their answer on the blackboard.
- Keep actions small: an action sets a goal or a timer on the blackboard; steering and combat rules elsewhere in the tick do the work.

## Kit tree semantics that change designs

- Composites resume at the child that returned `running`. A started windup therefore commits: the conditions before it are not rechecked until it finishes. Check interrupts (stun, death) inside the action, or reset with `root.halt(run)` when a rule interrupts the agent.
- The same rule means a `running` chase action holds the root selector, so the attack branch above it is never tried again. Actions that only set a goal return `success`; reserve `running` for commitments such as windups.
- `cooldown(ticks, child)` counts `run.tick`, which advances once per `tickTree` call. If the tree runs every 10 game ticks, `cooldown(45)` lasts 450 game ticks.
- Build the tree once and share it. Each agent owns a `BtRun` from `createBtRun(blackboard)`; node memory lives there, keyed by node.
- `parallel` does not re-run a child once it has settled, so a condition beside a long action is checked once, not every tick. It cannot serve as a continuous guard.

## Utility curve design

- Normalize every input to 0..1 with `range` before its curve. Without it, raw distances clamp to 1 and every option ties.
- `curves.linear(slope, intercept)` for proportional needs; `linear(-1, 1)` inverts. `curves.quadratic(2 or 3)` for needs that matter only when high. `curves.logistic(8 to 15, threshold)` for soft thresholds. `curves.inverse(2 to 5)` for "closer is better".
- The Kit multiplies considerations with a compensation factor, so adding a consideration does not lower an option's typical score. A consideration at 0 vetoes the option: use that for hard gates such as no ammo.
- Weights of 0.5 to 1.5 rank option families. Ties go to the option declared first, so declare the default first.
- An inertia of 0.1 to 0.2 for the current choice stops flapping between close scores.
- Test with a sweep: step each input across its range and record the winner. An option that never wins is dead; a boundary crossed by tiny input changes needs inertia.

## A brute with a tree, a utility mode and steering

```ts
// check: compile
import { action, chooseByUtility, condition, cooldown, createBtRun, curves, selector, sequence, tickTree, type BtRun, type UtilityOption } from '@gamedna/kit/behavior';
import { arrive, combine, integrate, separation, vec2, type Agent, type Vec2 } from '@gamedna/kit/steering';
import { losClear, type Grid } from '@gamedna/kit/nav';

/** Positions in meters on the ground plane; `y` holds world z. */
interface Brute extends Agent { id: number; hp: number; maxHp: number; windup: number; token: boolean; sees: boolean }
interface World { tick: number; player: Vec2; grid: Grid; brutes: Brute[]; tokens: number; maxTokens: number }
interface Board { self: Brute; world: World; goal: Vec2 | null }
type Mode = 'fight' | 'retreat';

const cell = (p: Vec2) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const release = (b: Board): void => { if (b.self.token) { b.self.token = false; b.world.tokens--; } };

/** Built once, shared by every brute. Runs every tick; line of sight is refreshed every 10 ticks. */
const tree = selector<Board>(
  sequence(
    condition((b) => dist(b.self, b.world.player) < 1.5 && (b.self.token || b.world.tokens < b.world.maxTokens)),
    cooldown(45, action((b) => {
      if (!b.self.token) { b.self.token = true; b.world.tokens++; b.self.windup = 24; } // 400 ms telegraph
      b.goal = null;
      if (--b.self.windup > 0) return 'running';
      release(b); // the combat rules resolve the strike this tick
      return 'success';
    })),
  ),
  sequence(
    condition((b) => {
      if ((b.world.tick + b.self.id) % 10 === 0) b.self.sees = losClear(b.world.grid, cell(b.self), cell(b.world.player));
      return b.self.sees;
    }),
    action((b) => { release(b); b.goal = b.world.player; return 'success'; }),
  ),
  action((b) => { release(b); b.goal = null; return 'success'; }),
);

const MODES: UtilityOption<Brute, Mode>[] = [
  { id: 'fight', considerations: [{ input: (s) => s.hp / s.maxHp, curve: curves.logistic(10, 0.3) }] },
  { id: 'retreat', considerations: [{ input: (s) => s.hp / s.maxHp, curve: curves.linear(-1, 1) }], weight: 0.7 },
];

const force = vec2(), toGoal = vec2(), apart = vec2();
const runs = new Map<number, BtRun<Board>>();
const modes = new Map<number, Mode>();

export function stepBrutes(world: World, dt: number): void {
  for (const s of world.brutes) {
    if ((world.tick + s.id) % 10 === 0) modes.set(s.id, chooseByUtility(MODES, s, { inertia: 0.15, current: modes.get(s.id) ?? null })?.id ?? 'fight');
    let run = runs.get(s.id);
    if (!run) runs.set(s.id, (run = createBtRun<Board>({ self: s, world, goal: null })));
    if (modes.get(s.id) === 'retreat') {
      tree.halt(run); // abandon any windup
      release(run.blackboard);
      run.blackboard.goal = { x: 2 * s.x - world.player.x, y: 2 * s.y - world.player.y };
    }
    else tickTree(tree, run);
    arrive(s, run.blackboard.goal ?? s, 3.5, 2, toGoal);
    separation(s, world.brutes, 1.2, 3.5, apart);
    integrate(s, combine([[toGoal, 1], [apart, 1.5]], 12, force), 3.5, dt);
  }
}
```

In a real game the retreat point comes from the nav grid (for example the neighbor cell with the highest distance in a flow field toward the player), and the run and mode maps are cleared on reset.
