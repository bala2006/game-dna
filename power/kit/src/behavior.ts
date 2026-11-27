/**
 * Decision making for AI agents: behavior trees and utility scoring.
 *
 * Behavior trees: build a tree once from the node factories and share it between agents. Each
 * agent keeps its own `BtRun` (blackboard, tick counter, node memory), so a sequence or selector
 * resumes at the child that returned 'running' last tick, and cooldowns count that agent's ticks.
 * Leaves get the blackboard and the run. Nothing reads clocks or Math.random, so the same
 * blackboard and tick sequence give the same statuses.
 *
 * Utility AI: each option multiplies its considerations (inputs mapped through response curves
 * and clamped to 0..1), with a compensation factor so options with more considerations are not
 * penalized. Ties go to the option declared first. An optional inertia bonus keeps the current
 * choice until another option is clearly better.
 */
import { clamp } from './random.js';

/** Result of running a node for one tick. */
export type Status = 'success' | 'failure' | 'running';

/** Per-agent state for running a behavior tree. */
export interface BtRun<B> {
  blackboard: B;
  /** Ticks run so far. `tickTree` increments it after each tick. */
  tick: number;
  /** Node memory: running child index, repeat counts, cooldown expiry. Keyed by node identity. */
  readonly memory: Map<BtNode<B>, number>;
}

/** A behavior tree node. Stateless itself: memory lives in the `BtRun`. */
export interface BtNode<B> {
  readonly kind: string;
  readonly children: readonly BtNode<B>[];
  /** Runs the node for one tick. */
  run(run: BtRun<B>): Status;
  /** Clears the memory of this node and its subtree (called when a parent abandons it). */
  halt(run: BtRun<B>): void;
}

/** Creates the per-agent run state for a blackboard. */
export const createBtRun = <B>(blackboard: B): BtRun<B> => ({ blackboard, tick: 0, memory: new Map() });

/** Runs `root` for one tick and advances `run.tick`. */
export function tickTree<B>(root: BtNode<B>, run: BtRun<B>): Status {
  const status = root.run(run);
  run.tick++;
  return status;
}

const haltAll = <B>(children: readonly BtNode<B>[], run: BtRun<B>): void => { for (const c of children) c.halt(run); };

function node<B>(kind: string, children: readonly BtNode<B>[], run: (r: BtRun<B>, self: BtNode<B>) => Status, halt?: (r: BtRun<B>, self: BtNode<B>) => void): BtNode<B> {
  const self: BtNode<B> = {
    kind,
    children,
    run: (r) => run(r, self),
    halt: halt ? (r) => halt(r, self) : (r) => { r.memory.delete(self); haltAll(children, r); },
  };
  return self;
}

function composite<B>(kind: string, children: readonly BtNode<B>[], stopOn: Status): BtNode<B> {
  const done: Status = stopOn === 'failure' ? 'success' : 'failure';
  return node(kind, children, (r, self) => {
    for (let i = r.memory.get(self) ?? 0; i < children.length; i++) {
      const s = (children[i] as BtNode<B>).run(r);
      if (s === 'running') { r.memory.set(self, i); return s; }
      if (s === stopOn) { r.memory.delete(self); return s; }
    }
    r.memory.delete(self);
    return done;
  });
}

/** Runs children in order until one fails; resumes at a running child next tick. */
export const sequence = <B>(...children: BtNode<B>[]): BtNode<B> => composite('sequence', children, 'failure');

/** Runs children in order until one succeeds; resumes at a running child next tick. */
export const selector = <B>(...children: BtNode<B>[]): BtNode<B> => composite('selector', children, 'success');

/**
 * Runs all children each tick. `all`: succeeds when every child has succeeded, fails as soon as one fails.
 * `any`: succeeds as soon as one succeeds, fails when every child has failed. Settled children are not re-run;
 * still-running children are halted when the node finishes. At most 31 children.
 */
export function parallel<B>(policy: 'all' | 'any', ...children: BtNode<B>[]): BtNode<B> {
  if (children.length > 31) throw new RangeError('parallel supports at most 31 children');
  const settle: Status = policy === 'all' ? 'success' : 'failure', finish: Status = policy === 'all' ? 'failure' : 'success';
  const full = children.length === 0 ? 0 : (2 ** children.length) - 1;
  return node('parallel', children, (r, self) => {
    let mask = r.memory.get(self) ?? 0;
    for (let i = 0; i < children.length; i++) {
      if (mask & (1 << i)) continue;
      const s = (children[i] as BtNode<B>).run(r);
      if (s === finish) { r.memory.delete(self); haltAll(children, r); return finish; }
      if (s === settle) mask |= 1 << i;
    }
    if (mask === full) { r.memory.delete(self); return settle; }
    r.memory.set(self, mask);
    return 'running';
  });
}

/** Swaps success and failure; passes 'running' through. */
export const inverter = <B>(child: BtNode<B>): BtNode<B> =>
  node('inverter', [child], (r) => { const s = child.run(r); return s === 'running' ? s : s === 'success' ? 'failure' : 'success'; });

/** Reports success whenever the child finishes; passes 'running' through. */
export const succeeder = <B>(child: BtNode<B>): BtNode<B> =>
  node('succeeder', [child], (r) => (child.run(r) === 'running' ? 'running' : 'success'));

/** Runs the child until it has succeeded `times` times (Infinity: forever), one completion per tick; fails when it fails. */
export function repeat<B>(times: number, child: BtNode<B>): BtNode<B> {
  return node('repeat', [child], (r, self) => {
    const s = child.run(r);
    if (s === 'running') return s;
    if (s === 'failure') { r.memory.delete(self); return s; }
    const n = (r.memory.get(self) ?? 0) + 1;
    if (n >= times) { r.memory.delete(self); return 'success'; }
    r.memory.set(self, n);
    return 'running';
  });
}

/** After the child succeeds, fails without running it for the next `ticks` ticks. Halting keeps the cooldown. */
export function cooldown<B>(ticks: number, child: BtNode<B>): BtNode<B> {
  return node('cooldown', [child], (r, self) => {
    if (r.tick < (r.memory.get(self) ?? -Infinity)) return 'failure';
    const s = child.run(r);
    if (s === 'success') r.memory.set(self, r.tick + 1 + ticks);
    return s;
  }, (r) => child.halt(r));
}

/** Succeeds when `test` is true, otherwise fails. */
export const condition = <B>(test: (blackboard: B, run: BtRun<B>) => boolean): BtNode<B> =>
  node('condition', [], (r) => (test(r.blackboard, r) ? 'success' : 'failure'));

/** A leaf that does work and reports its status. */
export const action = <B>(act: (blackboard: B, run: BtRun<B>) => Status): BtNode<B> => node('action', [], (r) => act(r.blackboard, r));

/** Maps a normalized input to a score; outputs are clamped to 0..1 by the scorer. */
export type ResponseCurve = (x: number) => number;

/** Response curves for considerations. Inputs are normalized to 0..1 before the curve. */
export const curves = {
  /** `slope * x + intercept`. */
  linear: (slope = 1, intercept = 0): ResponseCurve => (x) => slope * x + intercept,
  /** `scale * (x - shift)^exponent + intercept`; exponent 2 by default. */
  quadratic: (exponent = 2, scale = 1, shift = 0, intercept = 0): ResponseCurve => (x) => scale * Math.pow(x - shift, exponent) + intercept,
  /** S-curve `1 / (1 + e^(-steepness * (x - midpoint)))`. */
  logistic: (steepness = 10, midpoint = 0.5): ResponseCurve => (x) => 1 / (1 + Math.exp(-steepness * (x - midpoint))),
  /** Falls from 1 at x = 0: `1 / (1 + k * x)`. Good for "closer is better". */
  inverse: (k = 1): ResponseCurve => (x) => 1 / (1 + k * x),
};

/** One factor of an option's score. */
export interface Consideration<C> {
  /** Raw input for this context. */
  input(ctx: C): number;
  /** Maps the raw input range onto 0..1 before the curve (default: input is already 0..1). */
  range?: readonly [number, number];
  /** Response curve (default: identity). */
  curve?: ResponseCurve;
}

/** A choice the agent can make, scored by its considerations. */
export interface UtilityOption<C, K extends string = string> {
  id: K;
  considerations: readonly Consideration<C>[];
  /** Multiplies the final score (default 1). */
  weight?: number;
}

/** The winning option. */
export interface UtilityChoice<K extends string = string> {
  id: K;
  /** Index of the option in declaration order. */
  index: number;
  /** Final score including weight and any inertia bonus. */
  score: number;
}

const unit = (v: number): number => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);

/** Score of one option: compensated product of its considerations, times its weight. 0 vetoes. */
export function scoreOption<C>(option: UtilityOption<C>, ctx: C): number {
  const list = option.considerations, n = list.length;
  if (n === 0) return Math.max(0, option.weight ?? 1);
  const mod = 1 - 1 / n;
  let score = 1;
  for (const c of list) {
    let x = c.input(ctx);
    if (c.range) x = (x - c.range[0]) / (c.range[1] - c.range[0] || 1);
    const v = unit(c.curve ? c.curve(unit(x)) : x);
    score *= v + (1 - v) * mod * v;
    if (score === 0) return 0;
  }
  return score * Math.max(0, option.weight ?? 1);
}

/**
 * Highest-scoring option, or null when every option scores 0. Ties go to the earliest option.
 * `current` (the last choice) gets `inertia` added while its own score is above 0.
 */
export function chooseByUtility<C, K extends string>(options: readonly UtilityOption<C, K>[], ctx: C, { inertia = 0, current = null }: { inertia?: number; current?: K | null } = {}): UtilityChoice<K> | null {
  let best: UtilityChoice<K> | null = null;
  for (let i = 0; i < options.length; i++) {
    const o = options[i] as UtilityOption<C, K>;
    let score = scoreOption(o, ctx);
    if (!(score > 0)) continue;
    if (current !== null && o.id === current) score += inertia;
    if (!best || score > best.score) best = { id: o.id, index: i, score };
  }
  return best;
}
