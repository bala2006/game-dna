import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../src/contracts.js';
import { buildLayout } from '../src/layout.js';
import { DT, TUNE, WalkSim, type WalkInput } from '../src/sim.js';

const still: WalkInput = { moveX: 0, moveY: 0, sprint: false, jump: false, interact: false, cameraYaw: 0, faceCamera: false };

describe('Trail Walk contracts', () => {
  it('drives the timestep and matches the walker scale used by collision and reach', () => {
    expect(DT).toBeCloseTo(1 / CONTRACTS.simulation.hz, 12);
    expect(TUNE.radius).toBe(CONTRACTS.spatial.scales.walkerRadius);
    expect(TUNE.reach).toBe(CONTRACTS.spatial.scales.reach);
  });
  it('declares every event the simulation emits', () => {
    const sim = new WalkSim(buildLayout(11));
    const seen = new Set<string>();
    for (const m of sim.layout.markers) {
      sim.teleport(m.x + 0.5, m.z);
      sim.step({ ...still, interact: true });
      for (let i = 0; i < 2; i++) sim.step({ ...still, jump: i === 0 });
      for (let i = 0; i < 90; i++) sim.step(still);
      for (const e of sim.drainEvents()) seen.add(e.type);
    }
    expect(seen).toEqual(new Set(['collect', 'finish', 'jump', 'land']));
    for (const type of seen) expect(CONTRACTS.events).toContain(type);
  });
});
