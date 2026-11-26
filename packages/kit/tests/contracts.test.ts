import { describe, expect, it } from 'vitest';
import { ContractError, assertEvent, checkBudget, defineContracts, stepSeconds, ticksFor, validateContracts, type GameContracts } from '../src/contracts.js';

const base: GameContracts = {
  name: 'demo',
  spatial: { unit: 'meter', up: '+y', forward: '+z', ground: 'xz', scales: { playerHeight: 1.75 } },
  simulation: { hz: 60, deterministic: true, order: ['input', 'movement', 'rules'], owners: { 'player.position': 'movement' } },
  interaction: { actions: { jump: { kind: 'button', devices: ['keyboard', 'gamepad'] } }, minTouchTargetPx: 48 },
  performance: { targetFps: 60, targetHardware: 'mid-range phone', simulationBudgetMs: 3, maxDrawCalls: 300 },
  events: ['jump', 'land'],
};

describe('Game Contracts', () => {
  it('accepts a consistent contract and freezes it deeply', () => {
    const c = defineContracts(base);
    expect(Object.isFrozen(c.spatial.scales)).toBe(true);
    expect(stepSeconds(c)).toBeCloseTo(1 / 60, 12);
    expect(ticksFor(c, 100)).toBe(6);
    expect(ticksFor(c, 1)).toBe(1);
    expect(ticksFor(c, 0)).toBe(0);
  });

  it('reports every inconsistency at once', () => {
    const bad: GameContracts = {
      ...base,
      spatial: { unit: 'tile', up: '+y', forward: '-y', ground: 'xz', scales: { car: 0 } },
      simulation: { hz: 59.5, deterministic: true, order: ['a', 'a'], owners: { x: 'physics' } },
      performance: { targetFps: 60, targetHardware: '', simulationBudgetMs: 20 },
      events: ['Jump', 'land', 'land'],
    };
    const problems = validateContracts(bad);
    for (const fragment of ['tileSizePx', 'forward must not lie on the up axis', 'scales.car', 'hz 59.5', 'duplicate systems', '"physics"', 'leave frame time', 'targetHardware', 'duplicate names', '"Jump"']) {
      expect(problems.some((p) => p.includes(fragment)), fragment).toBe(true);
    }
    expect(() => defineContracts(bad)).toThrow(ContractError);
  });

  it('rejects xz ground with a non-y up axis and transform owners outside the update order', () => {
    const problems = validateContracts({ ...base, spatial: { ...base.spatial, up: '+z', forward: '+x', transformOwners: { car: 'physics' } } });
    expect(problems.some((p) => p.includes('ground "xz"'))).toBe(true);
    expect(problems.some((p) => p.includes('transformOwners.car'))).toBe(true);
  });

  it('checks measured costs against the performance budget', () => {
    const perf = base.performance!;
    expect(checkBudget(perf, { frameMs: 12, simulationMs: 1, drawCalls: 250 })).toEqual({ ok: true, overruns: [] });
    const r = checkBudget(perf, { frameMs: 20, simulationMs: 4, drawCalls: 301 });
    expect(r.ok).toBe(false);
    expect(r.overruns).toHaveLength(3);
  });

  it('rejects undeclared event names', () => {
    expect(() => assertEvent(base, 'jump')).not.toThrow();
    expect(() => assertEvent(base, 'jmup')).toThrow(/not declared/);
  });
});
