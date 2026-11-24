import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { msToTicks } from '@gamedna/starter';
import { NeonSurvivorSim } from '../src/game/sim.js';
import tuning from '../src/game/tuning.json';

const KEYS = ['left', 'right', 'up', 'down', 'attack', 'restart'] as const;
const action = fc.record({ key: fc.constantFrom(...KEYS), down: fc.boolean(), hold: fc.integer({ min: 0, max: 20 }) });

describe('Neon Survivor protected rules hold for random play', () => {
  it('CD-01, SCORE-01 and HP-01 under random input and seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.constantFrom('waves', 'lab-swarm', 'lab-dummies'), fc.array(action, { maxLength: 60 }), (seed, arena, actions) => {
        const sim = new NeonSurvivorSim();
        sim.reset(seed, tuning as Record<string, number | boolean>, { arena, dummies: 6, dummyHp: 2, swarm: 10 });
        const cooldown = msToTicks(tuning['attack.cooldownMs'], 60);
        let lastAttack = -Infinity;
        let scored = new Set<number>();
        for (const a of actions) {
          sim.setInput(a.key, a.down);
          for (let i = 0; i <= a.hold; i++) {
            sim.step();
            for (const e of sim.drainEvents()) {
              if (e.type === 'runReset') {
                scored = new Set();
                lastAttack = -Infinity;
              }
              if (e.type === 'attack') {
                expect(sim.currentTick() - lastAttack).toBeGreaterThanOrEqual(cooldown);
                lastAttack = sim.currentTick();
              }
              if (e.type === 'score') {
                const id = e.data?.['enemyId'] as number;
                expect(scored.has(id)).toBe(false);
                scored.add(id);
              }
            }
            expect(sim.health).toBeGreaterThanOrEqual(0);
          }
        }
      }),
      { numRuns: 120 },
    );
  });

  it('RESET-01: restart always clears run state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.array(action, { maxLength: 40 }), (seed, actions) => {
        const sim = new NeonSurvivorSim();
        sim.reset(seed, tuning as Record<string, number | boolean>, {});
        for (const a of actions) {
          sim.setInput(a.key, a.down);
          for (let i = 0; i <= a.hold; i++) sim.step();
        }
        sim.setInput('restart', false);
        sim.step();
        sim.setInput('restart', true);
        sim.step();
        expect(sim.score).toBe(0);
        expect(sim.wave).toBe(1);
        expect(sim.health).toBe(tuning['rules.playerMaxHealth']);
        expect(sim.state).toBe('playing');
      }),
      { numRuns: 100 },
    );
  });
});
