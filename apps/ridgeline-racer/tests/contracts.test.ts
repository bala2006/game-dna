import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../src/contracts.js';
import { DT, RaceSim, autoControls } from '../src/sim.js';
import { buildTrack } from '../src/track.js';

describe('Ridgeline Racer contracts', () => {
  it('drives the simulation timestep', () => {
    expect(DT).toBeCloseTo(1 / CONTRACTS.simulation.hz, 12);
  });
  it('declares every event the simulation emits', () => {
    const track = buildTrack(4);
    const sim = new RaceSim(track);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 60 * 4 && sim.race.phase !== 'finished'; i++) {
      sim.step(autoControls(sim));
      for (const e of sim.drainEvents()) seen.add(e.type);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const type of seen) expect(CONTRACTS.events).toContain(type);
  });
});
