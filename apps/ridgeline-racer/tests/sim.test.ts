import { describe, expect, it } from 'vitest';
import { COUNTDOWN_TICKS, LAPS, RaceSim, autoControls, type Controls } from '../src/sim.js';
import { buildTrack } from '../src/track.js';

const runToGreen = (sim: RaceSim) => { for (let i = 0; i < COUNTDOWN_TICKS; i++) sim.step(autoControls(sim)); };
const FULL: Controls = { steer: 0, throttle: 1, brake: 0, drift: false };

describe('ridgeline-racer rules', () => {
  it.each([4, 19])('the auto driver finishes %s-seed races lap by lap, and every lap passes both checkpoints', (seed) => {
    const sim = new RaceSim(buildTrack(seed));
    runToGreen(sim);
    expect(sim.race.phase).toBe('racing');
    let cpSeen = 0, ticks = 0;
    while (sim.race.phase === 'racing' && ticks < 60 * 60 * 4) {
      sim.step(autoControls(sim));
      cpSeen = Math.max(cpSeen, sim.race.cp);
      ticks++;
    }
    expect(sim.race.phase).toBe('finished');
    expect(sim.race.laps).toHaveLength(LAPS);
    expect(cpSeen).toBe(2);
    for (const lap of sim.race.laps) expect(lap / 60).toBeGreaterThan(20);
  });

  it('does not count a lap when the car skips the checkpoints', () => {
    const sim = new RaceSim(buildTrack(4));
    runToGreen(sim);
    const { points, count } = sim.track;
    for (let i = count - 20; i < count + 20; i++) {
      const p = points[i % count]!;
      sim.car.x = p.x;
      sim.car.z = p.z;
      sim.step({ steer: 0, throttle: 0, brake: 0, drift: false });
    }
    expect(sim.race.laps).toHaveLength(0);
    expect(sim.race.lap).toBe(1);
  });

  it('reset puts the car back on the grid, never further along the track', () => {
    const sim = new RaceSim(buildTrack(4));
    const grid = { x: sim.car.x, z: sim.car.z, idx: sim.race.idx };
    runToGreen(sim);
    for (let i = 0; i < 600; i++) sim.step(autoControls(sim));
    expect(sim.race.idx).toBeGreaterThan(grid.idx);
    sim.reset();
    expect(sim.race.idx).toBe(grid.idx);
    expect(sim.car.x).toBe(grid.x);
    expect(sim.car.z).toBe(grid.z);
    expect(sim.race.phase).toBe('countdown');
  });

  it('ignores driver input during the countdown and while paused', () => {
    const sim = new RaceSim(buildTrack(4));
    for (let i = 0; i < 60; i++) sim.step(FULL);
    expect(sim.car.vf).toBe(0);
    runToGreen(sim);
    sim.togglePause();
    const before = { x: sim.car.x, tick: sim.race.tick };
    for (let i = 0; i < 60; i++) sim.step(FULL);
    expect(sim.car.x).toBe(before.x);
    expect(sim.race.tick).toBe(before.tick);
  });

  it('keeps the car inside the barriers at full throttle with no steering', () => {
    const sim = new RaceSim(buildTrack(4));
    runToGreen(sim);
    let hits = 0;
    for (let i = 0; i < 900; i++) {
      sim.step(FULL);
      hits += sim.drainEvents().filter((e) => e.type === 'hit').length;
      expect(sim.track.index.nearest(sim.car.x, sim.car.z).distance).toBeLessThan(14);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('gives the same state for the same seed and inputs', () => {
    const run = () => {
      const sim = new RaceSim(buildTrack(7));
      runToGreen(sim);
      for (let i = 0; i < 1200; i++) sim.step(i % 300 < 40 ? { ...autoControls(sim), drift: true } : autoControls(sim));
      return { ...sim.car, prev: null, race: { ...sim.race } };
    };
    expect(run()).toEqual(run());
  });
});
