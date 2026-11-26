import { describe, expect, it } from 'vitest';
import { MARKERS, buildLayout } from '../src/layout.js';
import { TUNE, WalkSim, type WalkInput } from '../src/sim.js';

const still: WalkInput = { moveX: 0, moveY: 0, sprint: false, jump: false, interact: false, cameraYaw: 0, faceCamera: false };
const steps = (sim: WalkSim, n: number, input: Partial<WalkInput> = {}) => { for (let i = 0; i < n; i++) sim.step({ ...still, ...input }); };

describe('trail-walk rules', () => {
  it('places eight markers away from trees, the wall and the car', () => {
    for (const seed of [11, 12, 13]) {
      const L = buildLayout(seed);
      expect(L.markers).toHaveLength(MARKERS);
      for (const m of L.markers) {
        expect(Math.hypot(m.x - L.wall.x, m.z - L.wall.z)).toBeGreaterThan(8);
        expect(Math.hypot(m.x - L.car.x, m.z - L.car.z)).toBeGreaterThan(8);
        for (const t of L.trees) expect(Math.hypot(m.x - t.x, m.z - t.z)).toBeGreaterThan(t.r + TUNE.radius);
      }
    }
  });

  it('collects a marker only within reach and only on an interact press', () => {
    const sim = new WalkSim(buildLayout(11)), m = sim.layout.markers[0]!;
    sim.teleport(m.x + TUNE.reach + 0.3, m.z);
    steps(sim, 1, { interact: true });
    expect(sim.state.count).toBe(0);
    sim.teleport(m.x + 0.8, m.z);
    steps(sim, 30);
    expect(sim.state.count).toBe(0);
    steps(sim, 1, { interact: true });
    expect(sim.state.count).toBe(1);
    expect(sim.drainEvents()).toContainEqual({ type: 'collect', index: 0, count: 1 });
    steps(sim, 1, { interact: true });
    expect(sim.state.count).toBe(1);
  });

  it('finishes once, on the eighth marker, and stops counting after it', () => {
    const sim = new WalkSim(buildLayout(11));
    sim.layout.markers.forEach((m, i) => {
      sim.teleport(m.x, m.z);
      steps(sim, 1, { interact: true });
      expect(sim.state.finishTicks === null).toBe(i < MARKERS - 1);
    });
    const finishes = sim.drainEvents().filter((e) => e.type === 'finish');
    expect(finishes).toHaveLength(1);
    const at = sim.state.finishTicks;
    steps(sim, 120, { interact: true });
    expect(sim.state.finishTicks).toBe(at);
    expect(sim.drainEvents().filter((e) => e.type === 'finish')).toHaveLength(0);
  });

  it('stops the player at the wall and lets them through the doorway', () => {
    const sim = new WalkSim(buildLayout(11)), w = sim.layout.wall, east = Math.PI / 2;
    sim.teleport(w.x - 3, w.z + 1.2);
    steps(sim, 240, { moveY: 1, cameraYaw: east });
    expect(sim.player.x).toBeLessThan(w.x - w.thickness / 2 - TUNE.radius + 0.01);
    sim.teleport(w.x - 3, w.z);
    steps(sim, 240, { moveY: 1, cameraYaw: east });
    expect(sim.player.x).toBeGreaterThan(w.x + 1);
  });

  it('cannot walk through the parked car', () => {
    const sim = new WalkSim(buildLayout(11)), c = sim.layout.car;
    sim.teleport(c.x, c.z - 5);
    steps(sim, 300, { moveY: 1, cameraYaw: 0 });
    const dx = sim.player.x - c.x, dz = sim.player.z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    expect(Math.abs(lx) > c.hx || Math.abs(lz) > c.hz).toBe(true);
  });

  it('moves relative to the camera, jumps only from the ground, and lands', () => {
    const sim = new WalkSim(buildLayout(11));
    const x0 = sim.player.x, z0 = sim.player.z;
    steps(sim, 60, { moveY: 1, cameraYaw: Math.PI });
    expect(sim.player.z - z0).toBeLessThan(-2);
    expect(Math.abs(sim.player.x - x0)).toBeLessThan(0.2);
    steps(sim, 1, { jump: true });
    expect(sim.player.grounded).toBe(false);
    const vy = sim.player.vy;
    steps(sim, 1, { jump: true });
    expect(sim.player.vy).toBeLessThan(vy);
    steps(sim, 90);
    expect(sim.player.grounded).toBe(true);
    expect(sim.drainEvents().filter((e) => e.type === 'jump')).toHaveLength(1);
  });

  it('ignores input while paused and gives the same state for the same seed and inputs', () => {
    const run = () => {
      const sim = new WalkSim(buildLayout(13));
      for (let i = 0; i < 900; i++) sim.step({ ...still, moveY: 1, moveX: Math.sin(i / 50), sprint: i % 200 < 80, jump: i % 150 === 0, cameraYaw: i / 300 });
      return { ...sim.player };
    };
    expect(run()).toEqual(run());
    const sim = new WalkSim(buildLayout(13));
    sim.togglePause();
    steps(sim, 60, { moveY: 1 });
    expect(sim.state.tick).toBe(0);
    expect(sim.player.x).toBe(sim.layout.start.x);
  });
});
