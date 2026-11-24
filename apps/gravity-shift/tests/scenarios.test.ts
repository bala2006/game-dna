import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioSchema, assessReproducibility, computeMetrics, ProjectRecordSchema, resolveRunParameters, runScenario, type ParameterValues } from '@gamedna/core';
import { GravityShiftSim } from '../src/game/sim.js';
import tuning from '../src/game/tuning.json';

const root = path.resolve(import.meta.dirname, '..');
const project = ProjectRecordSchema.parse(JSON.parse(readFileSync(path.join(root, '.gamedna/project.json'), 'utf8')));
const scenarios = readdirSync(path.join(root, '.gamedna/scenarios'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ScenarioSchema.parse(JSON.parse(readFileSync(path.join(root, '.gamedna/scenarios', f), 'utf8'))));
const baseline = tuning as ParameterValues;

describe('Gravity Shift scenarios (headless, same runner as the browser adapter)', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} passes with the shipped tuning`, () => {
      const run = runScenario(new GravityShiftSim(), scenario, resolveRunParameters(baseline, scenario));
      const failures = run.assertions.filter((a) => a.status !== 'passed');
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    });

    if (scenario.detectsFault) {
      it(`${scenario.id} detects seeded fault ${scenario.detectsFault}`, () => {
        const run = runScenario(new GravityShiftSim(), scenario, resolveRunParameters(baseline, scenario, { [scenario.detectsFault as string]: true }));
        expect(run.status).toBe('failed');
        expect(run.firstFailure?.checkId).toBe('MOVE-01');
      });
    }
  }

  it('jump-arc is reproducible across 5 identical-seed runs', () => {
    const s = scenarios.find((x) => x.id === 'jump-arc')!;
    const runs = Array.from({ length: 5 }, () => runScenario(new GravityShiftSim(), s, resolveRunParameters(baseline, s)));
    expect(assessReproducibility(runs).status).toBe('stable');
  });

  it('movement metrics respond to tuning (higher jump velocity → higher apex)', () => {
    const s = scenarios.find((x) => x.id === 'jump-arc')!;
    const fam = project.metrics;
    const apex = (v: number) =>
      computeMetrics(runScenario(new GravityShiftSim(), s, resolveRunParameters(baseline, s, { 'movement.jumpVelocity': v })), fam).find((m) => m.id === 'jump.apexHeight')!.value!;
    expect(apex(620)).toBeGreaterThan(apex(420));
    // Constant-gravity estimate h = v^2 / 2g is an approximation; measured value should be close.
    const v = baseline['movement.jumpVelocity'] as number;
    const g = baseline['movement.gravity'] as number;
    expect(Math.abs(apex(v) - (v * v) / (2 * g))).toBeLessThan(6);
  });
});
