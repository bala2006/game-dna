import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenarioSchema, assessReproducibility, computeMetrics, ProjectRecordSchema, resolveRunParameters, runScenario, type ParameterValues } from '@gamedna/core';
import { NeonSurvivorSim } from '../src/game/sim.js';
import tuning from '../src/game/tuning.json';

const root = path.resolve(import.meta.dirname, '..');
const project = ProjectRecordSchema.parse(JSON.parse(readFileSync(path.join(root, '.gamedna/project.json'), 'utf8')));
const scenarios = readdirSync(path.join(root, '.gamedna/scenarios'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ScenarioSchema.parse(JSON.parse(readFileSync(path.join(root, '.gamedna/scenarios', f), 'utf8'))));
const baseline = tuning as ParameterValues;

describe('Neon Survivor scenarios (headless)', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} passes with the shipped tuning`, () => {
      const run = runScenario(new NeonSurvivorSim(), scenario, resolveRunParameters(baseline, scenario));
      const failures = run.assertions.filter((a) => a.status !== 'passed');
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    });
    if (scenario.detectsFault) {
      it(`${scenario.id} detects seeded fault ${scenario.detectsFault}`, () => {
        const run = runScenario(new NeonSurvivorSim(), scenario, resolveRunParameters(baseline, scenario, { [scenario.detectsFault as string]: true }));
        expect(run.status).toBe('failed');
        expect(run.firstFailure?.checkId).toBe('SCORE-01');
      });
    }
  }

  it('combat-feel is reproducible across 5 identical-seed runs', () => {
    const s = scenarios.find((x) => x.id === 'combat-feel')!;
    const runs = Array.from({ length: 5 }, () => runScenario(new NeonSurvivorSim(), s, resolveRunParameters(baseline, s)));
    expect(assessReproducibility(runs).status).toBe('stable');
  });

  it('combat metrics reflect feedback tuning (more hit-stop → more frozen time)', () => {
    const s = scenarios.find((x) => x.id === 'combat-feel')!;
    const frozen = (ms: number) =>
      computeMetrics(runScenario(new NeonSurvivorSim(), s, resolveRunParameters(baseline, s, { 'feedback.hitStopMs': ms })), project.metrics).find((m) => m.id === 'combat.hitstopTotal')!.value!;
    expect(frozen(0)).toBe(0);
    expect(frozen(100)).toBeGreaterThan(frozen(30));
  });

  it('a full wave run is deterministic per seed and differs across seeds', () => {
    const sim = (seed: number) => {
      const s = new NeonSurvivorSim();
      s.reset(seed, baseline, {});
      for (let i = 0; i < 120; i++) s.step();
      return JSON.stringify({ state: s.snapshot(), enemies: s.enemies });
    };
    expect(sim(3)).toBe(sim(3));
    expect(sim(3)).not.toBe(sim(4));
  });
});
