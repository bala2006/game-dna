import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GravityShiftSim } from '../src/game/sim.js';
import { LEVELS, COLS, ROWS } from '../src/game/levels.js';
import tuning from '../src/game/tuning.json';

const KEYS = ['left', 'right', 'jump', 'flip', 'restart'] as const;
const action = fc.record({ key: fc.constantFrom(...KEYS), down: fc.boolean(), hold: fc.integer({ min: 0, max: 12 }) });

function play(level: string, actions: Array<{ key: string; down: boolean; hold: number }>, params = {}) {
  const sim = new GravityShiftSim();
  sim.reset(7, { ...(tuning as Record<string, number | boolean>), ...params }, { level });
  const jumps: Array<Record<string, unknown>> = [];
  let maxDrift = 0;
  for (const a of actions) {
    sim.setInput(a.key, a.down);
    for (let i = 0; i <= a.hold; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'jump') jumps.push(e.data ?? {});
      maxDrift = Math.max(maxDrift, sim.deadDrift);
      expect(sim.collected.size).toBeLessThanOrEqual(sim.level.keys.length);
    }
  }
  return { sim, jumps, maxDrift };
}

describe('Gravity Shift protected rules hold for random input sequences', () => {
  it('MOVE-01: no extra midair jump, DEAD-01: no drift while dead', () => {
    fc.assert(
      fc.property(fc.constantFrom('level-1', 'level-2', 'level-3', 'lab-flat', 'lab-spikes'), fc.array(action, { maxLength: 80 }), (level, actions) => {
        const { jumps, maxDrift } = play(level, actions);
        expect(jumps.filter((j) => j['extraAirJump'] === true)).toEqual([]);
        expect(maxDrift).toBe(0);
      }),
      { numRuns: 150 },
    );
  });

  it('RESET-01: restart always returns to spawn with no keys', () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        const { sim } = play('level-1', [...actions, { key: 'restart', down: false, hold: 0 }, { key: 'restart', down: true, hold: 0 }]);
        if (!sim.won) {
          expect(sim.collected.size).toBe(0);
          expect(sim.snapshot()['player.atSpawn']).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('levels are well-formed', () => {
    for (const l of LEVELS) {
      expect(l.rows, l.id).toHaveLength(ROWS);
      for (const r of l.rows) expect(r, `${l.id}: ${r}`).toHaveLength(COLS);
      expect(l.rows.join('').split('P').length - 1, l.id).toBe(1);
      expect(l.rows.join('').includes('E') || l.lab, l.id).toBeTruthy();
    }
  });
});
