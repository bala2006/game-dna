import { describe, expect, it } from 'vitest';
import { action, chooseByUtility, condition, cooldown, createBtRun, curves, inverter, parallel, repeat, scoreOption, selector, sequence, succeeder, tickTree, type Status, type UtilityOption } from '../src/behavior.js';

interface Bb { log: string[]; walkTicks: number; seesPlayer: boolean }
const bb = (over: Partial<Bb> = {}): Bb => ({ log: [], walkTicks: 3, seesPlayer: true, ...over });

/** Leaf that logs its name and stays running for `ticks` calls before succeeding. */
const timed = (name: string, ticks: (b: Bb) => number) => {
  let left = -1;
  return action<Bb>((b) => {
    b.log.push(name);
    if (left < 0) left = ticks(b);
    if (--left > 0) return 'running';
    left = -1;
    return 'success';
  });
};

describe('behavior trees', () => {
  it('a sequence resumes at its running child instead of restarting', () => {
    const tree = sequence(action<Bb>((b) => { b.log.push('aim'); return 'success'; }), timed('walk', (b) => b.walkTicks), action<Bb>((b) => { b.log.push('hit'); return 'success'; }));
    const run = createBtRun(bb());
    const statuses: Status[] = [];
    for (let i = 0; i < 4; i++) statuses.push(tickTree(tree, run));
    expect(statuses).toEqual(['running', 'running', 'success', 'running']);
    expect(run.blackboard.log).toEqual(['aim', 'walk', 'walk', 'walk', 'hit', 'aim', 'walk']);
    expect(run.tick).toBe(4);
  });

  it('a selector falls through failures and resumes a running child', () => {
    const tree = selector(condition<Bb>((b) => !b.seesPlayer), timed('patrol', () => 2));
    const run = createBtRun(bb());
    expect([tickTree(tree, run), tickTree(tree, run)]).toEqual(['running', 'success']);
    run.blackboard.seesPlayer = false;
    expect(tickTree(tree, run)).toBe('success');
  });

  it('cooldown blocks the child for the given number of ticks after a success', () => {
    let fired = 0;
    const tree = cooldown(3, action<Bb>(() => { fired++; return 'success'; }));
    const run = createBtRun(bb());
    const out = Array.from({ length: 9 }, () => tickTree(tree, run));
    expect(out).toEqual(['success', 'failure', 'failure', 'failure', 'success', 'failure', 'failure', 'failure', 'success']);
    expect(fired).toBe(3);
  });

  it('cooldown starts only on success', () => {
    let ok = false;
    const tree = cooldown(5, action<Bb>(() => (ok ? 'success' : 'failure')));
    const run = createBtRun(bb());
    expect(tickTree(tree, run)).toBe('failure');
    ok = true;
    expect(tickTree(tree, run)).toBe('success');
    expect(tickTree(tree, run)).toBe('failure');
  });

  it('repeat completes once per tick and stops on failure', () => {
    let n = 0;
    const tree = repeat(3, action<Bb>(() => { n++; return 'success'; }));
    const run = createBtRun(bb());
    expect([tickTree(tree, run), tickTree(tree, run), tickTree(tree, run)]).toEqual(['running', 'running', 'success']);
    expect(n).toBe(3);
    expect(tickTree(repeat(Infinity, action<Bb>(() => 'failure')), run)).toBe('failure');
  });

  it('inverter and succeeder map statuses', () => {
    const run = createBtRun(bb());
    expect(tickTree(inverter(condition<Bb>(() => true)), run)).toBe('failure');
    expect(tickTree(inverter(action<Bb>(() => 'running')), run)).toBe('running');
    expect(tickTree(succeeder(condition<Bb>(() => false)), run)).toBe('success');
  });

  it('parallel policies, and halting a running branch clears its memory', () => {
    const run = createBtRun(bb());
    expect(tickTree(parallel('all', condition<Bb>(() => true), timed('w', () => 2)), run)).toBe('running');
    const branch = sequence(condition<Bb>(() => true), timed('slow', () => 5));
    let doneAt = 2;
    const tree = parallel('any', branch, action<Bb>((_, r) => (r.tick >= doneAt ? 'success' : 'running')));
    const r2 = createBtRun(bb());
    expect([tickTree(tree, r2), tickTree(tree, r2), tickTree(tree, r2)]).toEqual(['running', 'running', 'success']);
    expect(r2.memory.has(branch)).toBe(false);
    doneAt = Infinity;
    expect(tickTree(parallel('any', condition<Bb>(() => false), condition<Bb>(() => false)), r2)).toBe('failure');
    expect(tickTree(parallel('all', condition<Bb>(() => true), condition<Bb>(() => false)), r2)).toBe('failure');
  });

  it('one tree serves many agents with separate memory', () => {
    const tree = sequence(timed('a', () => 1), action<Bb>((b) => (b.seesPlayer ? 'success' : 'running')));
    const one = createBtRun(bb()), two = createBtRun(bb({ seesPlayer: false }));
    expect(tickTree(tree, two)).toBe('running');
    expect(tickTree(tree, one)).toBe('success');
    expect(two.memory.get(tree)).toBe(1);
  });
});

describe('utility AI', () => {
  interface Ctx { health: number; enemyDist: number; ammo: number }
  const options: UtilityOption<Ctx, 'attack' | 'flee' | 'reload'>[] = [
    { id: 'attack', considerations: [{ input: (c) => c.health, curve: curves.linear() }, { input: (c) => c.enemyDist, range: [0, 100], curve: curves.inverse(3) }] },
    { id: 'flee', considerations: [{ input: (c) => c.health, curve: curves.linear(-1, 1) }] },
    { id: 'reload', considerations: [{ input: (c) => c.ammo, curve: curves.quadratic(2, 1, 1) }] },
  ];

  it('curves stay finite and the scorer clamps them to 0..1', () => {
    for (const curve of [curves.linear(2, -0.5), curves.quadratic(3), curves.logistic(), curves.inverse(2)]) {
      for (let x = 0; x <= 1; x += 0.125) expect(Number.isFinite(curve(x))).toBe(true);
    }
    expect(scoreOption({ id: 'x', considerations: [{ input: () => 5, curve: curves.linear(10) }] }, {})).toBe(1);
    expect(scoreOption({ id: 'x', considerations: [{ input: () => -5 }] }, {})).toBe(0);
    expect(curves.logistic(10, 0.5)(0.5)).toBeCloseTo(0.5, 12);
  });

  it('compensates for the number of considerations', () => {
    const one = scoreOption({ id: 'a', considerations: [{ input: () => 0.8 }] }, {});
    const three = scoreOption({ id: 'b', considerations: [{ input: () => 0.8 }, { input: () => 0.8 }, { input: () => 0.8 }] }, {});
    expect(one).toBeCloseTo(0.8, 12);
    expect(three).toBeGreaterThan(0.8 ** 3);
    expect(three).toBeLessThan(0.8);
  });

  it('picks the best option and breaks ties by declaration order', () => {
    expect(chooseByUtility(options, { health: 0.2, enemyDist: 50, ammo: 0.9 })?.id).toBe('flee');
    expect(chooseByUtility(options, { health: 1, enemyDist: 0, ammo: 1 })?.id).toBe('attack');
    const tie: UtilityOption<object>[] = [{ id: 'first', considerations: [{ input: () => 0.5 }] }, { id: 'second', considerations: [{ input: () => 0.5 }] }];
    expect(chooseByUtility(tie, {})).toMatchObject({ id: 'first', index: 0 });
    expect(chooseByUtility([...tie].reverse(), {})?.id).toBe('second');
    expect(chooseByUtility([{ id: 'none', considerations: [{ input: () => 0 }] }], {})).toBeNull();
  });

  it('inertia keeps the current choice until another is clearly better', () => {
    const ctx = (h: number): Ctx => ({ health: h, enemyDist: 0, ammo: 1 });
    let current: 'attack' | 'flee' | 'reload' | null = null;
    const plain: string[] = [], sticky: string[] = [];
    // attack and flee cross at health ≈ 0.4385 here; plain scoring flips on every wobble around it.
    for (const h of [0.46, 0.42, 0.45, 0.41, 0.44, 0.2]) {
      plain.push(chooseByUtility(options, ctx(h))!.id);
      current = chooseByUtility(options, ctx(h), { inertia: 0.1, current })!.id;
      sticky.push(current);
    }
    expect(plain).toEqual(['attack', 'flee', 'attack', 'flee', 'attack', 'flee']);
    expect(sticky).toEqual(['attack', 'attack', 'attack', 'attack', 'attack', 'flee']);
  });
});
