import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createStateMachine } from '../src/fsm.js';

type S = 'menu' | 'playing' | 'paused' | 'over';
type E = 'start' | 'pause' | 'resume' | 'die' | 'quit';
const table = {
  menu: { start: 'playing' },
  playing: { pause: 'paused', die: 'over', start: 'playing' },
  paused: { resume: 'playing', quit: 'menu' },
  over: { quit: 'menu' },
} as const;

describe('fsm', () => {
  it('transitions through the table and calls exit then enter', () => {
    const log: string[] = [];
    const m = createStateMachine<S, E>({ initial: 'menu', transitions: table, onExit: (s, to, e) => log.push(`exit ${s}->${to} on ${e}`), onEnter: (s, from, e) => log.push(`enter ${s} from ${from} on ${e}`) });
    expect(m.send('start')).toBe(true);
    expect(m.state).toBe('playing');
    expect(m.previous).toBe('menu');
    expect(m.send('pause')).toBe(true);
    expect(log).toEqual(['exit menu->playing on start', 'enter playing from menu on start', 'exit playing->paused on pause', 'enter paused from playing on pause']);
  });

  it('ignores invalid events, reports them and never throws', () => {
    const entered: string[] = [];
    const m = createStateMachine<S, E>({ initial: 'menu', transitions: table, onEnter: (s) => entered.push(s) });
    expect(m.can('die')).toBe(false);
    expect(m.send('die')).toBe(false);
    expect(m.send('toString' as E)).toBe(false);
    expect(m.state).toBe('menu');
    expect(m.rejected).toBe(2);
    expect(entered).toEqual([]);
  });

  it('only ever reaches states the table allows, under random events', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom<E>('start', 'pause', 'resume', 'die', 'quit'), { maxLength: 60 }), (events) => {
      const m = createStateMachine<S, E>({ initial: 'menu', transitions: table });
      let rejected = 0;
      for (const e of events) {
        const from = m.state, expected = (table[from] as Partial<Record<E, S>>)[e];
        const moved = m.send(e);
        expect(moved).toBe(expected !== undefined);
        expect(m.state).toBe(expected ?? from);
        if (!moved) rejected++;
      }
      expect(m.rejected).toBe(rejected);
    }));
  });

  it('counts ticks in state, resets them on transition and self-transition', () => {
    const m = createStateMachine<S, E>({ initial: 'menu', transitions: table });
    for (let i = 0; i < 5; i++) m.tick();
    expect(m.timeInState).toBe(5);
    m.send('start');
    expect(m.timeInState).toBe(0);
    m.tick();
    m.send('start');
    expect(m.state).toBe('playing');
    expect(m.timeInState).toBe(0);
  });

  it('reset jumps without hooks, for restarts and loads', () => {
    let hooks = 0;
    const m = createStateMachine<S, E>({ initial: 'menu', transitions: table, onEnter: () => hooks++, onExit: () => hooks++ });
    m.send('start');
    m.reset('over', 12);
    expect([m.state, m.timeInState, m.previous]).toEqual(['over', 12, null]);
    m.reset();
    expect(m.state).toBe('menu');
    expect(hooks).toBe(2);
  });

  it('lets a hook chain a transition from the new state', () => {
    const m = createStateMachine<S, E>({ initial: 'playing', transitions: table, onEnter: (s) => { if (s === 'over') m.send('quit'); } });
    m.send('die');
    expect(m.state).toBe('menu');
    expect(m.previous).toBe('over');
  });

  it('queues sends from onExit and onEnter until the transition finishes, then runs them in order', () => {
    type Q = 'a' | 'b' | 'c';
    type V = 'go' | 'next' | 'back';
    const log: string[] = [], sent: boolean[] = [];
    const m = createStateMachine<Q, V>({
      initial: 'a',
      transitions: { a: { go: 'b' }, b: { next: 'c', back: 'a' }, c: { next: 'a' } },
      onExit: (s, to, e) => { log.push(`exit ${s}->${to} on ${e}`); if (s === 'a' && e === 'go') sent.push(m.send('next')); },
      onEnter: (s, from, e) => {
        log.push(`enter ${s} from ${from} on ${e}`);
        if (s === 'b') sent.push(m.send('back'));
        if (s === 'c') sent.push(m.send('next'));
      },
    });
    expect(m.send('go')).toBe(true);
    expect(log).toEqual([
      'exit a->b on go', 'enter b from a on go',
      'exit b->c on next', 'enter c from b on next',
      // 'back' was queued second; c does not accept it.
      'exit c->a on next', 'enter a from c on next',
    ]);
    expect(sent).toEqual([false, false, false]);
    expect([m.state, m.previous, m.rejected]).toEqual(['a', 'c', 1]);
  });

  it('never leaves a state twice when onExit sends (review case: exit a, enter c, enter b)', () => {
    type Q = 'a' | 'b' | 'c';
    const log: string[] = [];
    const m = createStateMachine<Q, 'go' | 'alt'>({
      initial: 'a',
      transitions: { a: { go: 'b', alt: 'c' } },
      onExit: (s, to) => { log.push(`exit ${s}->${to}`); if (to === 'b') m.send('alt'); },
      onEnter: (s, from) => log.push(`enter ${s} from ${from}`),
    });
    m.send('go');
    expect(log).toEqual(['exit a->b', 'enter b from a']);
    expect([m.state, m.rejected]).toEqual(['b', 1]);
  });

  it('recovers after a hook throws and stops hooks that never stop sending', () => {
    let boom = true;
    const m = createStateMachine<S, E>({ initial: 'menu', transitions: table, onEnter: (s) => { if (boom && s === 'playing') { m.send('pause'); throw new Error('boom'); } } });
    expect(() => m.send('start')).toThrow('boom');
    boom = false;
    expect(m.send('die')).toBe(true);
    expect(m.state).toBe('over');
    let forever = true;
    const loop = createStateMachine<S, E>({ initial: 'menu', transitions: table, onEnter: () => { if (forever) loop.send('start'); } });
    expect(() => loop.send('start')).toThrow(RangeError);
    forever = false;
    expect(loop.send('start')).toBe(true);
    expect(loop.state).toBe('playing');
  });
});
