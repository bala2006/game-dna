import { describe, expect, it } from 'vitest';
import { ScenarioSchema, runScenario, type FlatState, type ParameterSpec, type ParameterValues, type ScenarioRun } from '@gamedna/core';
import { FixedStepSimulation, num, type InputFrame } from '@gamedna/starter';
import { BRIDGE_GLOBAL, encodeParams, installBridge } from '../src/index.js';

class Mover extends FixedStepSimulation {
  x = 0;
  constructor() {
    super({ 'move.speed': 2 });
  }
  protected onReset(): void {
    this.x = 0;
  }
  protected update(input: InputFrame): void {
    if (input.isDown('right')) this.x += num(this.params, 'move.speed', 2);
    if (input.wasPressed('right')) this.emit('start', { x: this.x });
  }
  snapshot(): FlatState {
    return { x: this.x, tick: this.tick };
  }
}

const specs: Record<string, ParameterSpec> = {
  'move.speed': { type: 'number', min: 1, max: 10, protected: false, fault: false },
  'rules.lives': { type: 'number', min: 1, max: 3, protected: true, fault: false },
};
const baseline: ParameterValues = { 'move.speed': 2, 'rules.lives': 3 };
const scenario = ScenarioSchema.parse({
  id: 'walk',
  description: 'hold right',
  seed: 3,
  maxTicks: 30,
  inputs: [{ tick: 0, key: 'right', down: true }, { tick: 10, key: 'right', down: false }],
  checkpoints: [5],
  assertions: [{ type: 'stateAtEnd', checkId: 'MOVE-01', path: 'x', op: 'gt', value: 0 }],
});

function setup(search = '') {
  const sim = new Mover();
  sim.reset(1, baseline, {});
  const target: { location: { search: string }; [key: string]: unknown } = { location: { search } };
  let controlled = false;
  let resets = 0;
  const installed = installBridge({
    projectId: 'test',
    sim,
    specs,
    baseline,
    setControlled: (on) => {
      controlled = on;
    },
    onReset: () => {
      resets++;
    },
    engine: { id: 'phaser', version: 'test' },
    viewport: { width: 960, height: 540 },
    target,
  });
  return { sim, target, installed, api: installed.api, isControlled: () => controlled, resets: () => resets };
}

describe('dev bridge', () => {
  it('installs on the target global and reports fixed-step info', () => {
    const { target, api } = setup();
    expect(target[BRIDGE_GLOBAL]).toBe(api);
    expect(api.ready).toBe(true);
    expect(api.info()['stepMode']).toBe('fixed-step');
  });

  it('applies valid URL overrides and seed from the workbench link', () => {
    const { api, resets } = setup(`?gamedna=1&gdSeed=9&gdParams=${encodeParams({ 'move.speed': 5 })}`);
    expect(api.getParameters()['move.speed']).toBe(5);
    expect(api.info()['seed']).toBe(9);
    expect(resets()).toBe(1);
  });

  it('ignores out-of-range or unknown URL overrides and says why', () => {
    const { api } = setup(`?gdParams=${encodeParams({ 'move.speed': 99, 'x.y': 1 })}`);
    expect(api.getParameters()['move.speed']).toBe(2);
    expect((api.info()['urlNotes'] as string[]).length).toBe(2);
  });

  it('rejects protected changes through setExperimentParameters', () => {
    const { api } = setup();
    expect(api.setExperimentParameters({ 'move.speed': 4 }).ok).toBe(true);
    const r = api.setExperimentParameters({ 'rules.lives': 1 });
    expect(r.ok).toBe(false);
    expect(r.rejected[0]?.key).toBe('rules.lives');
  });

  it('runs a scenario in-page with the same result as the headless runner', () => {
    const { api, isControlled } = setup();
    const inPage = api.runScenario(scenario, {}) as ScenarioRun;
    const headless = runScenario(new Mover(), scenario, baseline);
    expect(isControlled()).toBe(true);
    expect(inPage.status).toBe('passed');
    expect(inPage.events).toEqual(headless.events);
    expect(inPage.finalState).toEqual(headless.finalState);
  });

  it('supports checkpoint stepping (begin / advance / finish)', () => {
    const { api, sim } = setup();
    expect(api.beginScenario(scenario).ok).toBe(true);
    api.advanceScenario(5);
    expect(sim.currentTick()).toBe(5);
    const run = api.finishScenario();
    expect(run?.ticks).toBe(30);
    expect(api.finishScenario()).toBeNull();
  });

  it('refuses malformed scenarios', () => {
    const { api } = setup();
    const r = api.runScenario({ id: 'Bad Id' });
    expect('ok' in r && r.ok === false).toBe(true);
  });

  it('bounds step() and pages live events by cursor', () => {
    const { api, installed, sim } = setup();
    expect(api.step(1_000_000).tick).toBe(3600);
    installed.recordLiveEvents([{ type: 'a' }, { type: 'b' }, { type: 'c' }], sim.currentTick());
    const first = api.getEvents(0, 2);
    expect(first.events.map((e) => e.type)).toEqual(['a', 'b']);
    expect(api.getEvents(first.nextCursor).events.map((e) => e.type)).toEqual(['c']);
  });

  it('filters snapshot fields and lists missing ones', () => {
    const { api } = setup();
    const s = api.getSnapshot(['x', 'nope']);
    expect(Object.keys(s.state)).toEqual(['x']);
    expect(s.missing).toEqual(['nope']);
  });
});
