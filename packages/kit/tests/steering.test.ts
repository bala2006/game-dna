import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/random.js';
import { arrive, avoidObstacles, combine, createWander, evade, flee, integrate, pursue, seek, separation, truncate, vec2, wander, type Agent } from '../src/steering.js';

const agent = (x = 0, y = 0, vx = 0, vy = 0): Agent => ({ x, y, vx, vy });
const dt = 1 / 60;

describe('steering', () => {
  it('seek asks for full speed toward the target; nearRadius softens the last stretch', () => {
    const f = seek(agent(0, 0, 0, 5), { x: 10, y: 0 }, 4);
    expect(f.x).toBeCloseTo(4, 12);
    expect(f.y).toBeCloseTo(-5, 12);
    expect(seek(agent(), { x: 0.5, y: 0 }, 4, vec2(), 1).x).toBeCloseTo(2, 12);
    expect(seek(agent(0, 0, 1, 1), { x: 0, y: 0 }, 4)).toEqual({ x: -1, y: -1 });
  });

  it('flee pushes away only inside the panic radius', () => {
    expect(flee(agent(), { x: 3, y: 0 }, 2).x).toBeCloseTo(-2, 12);
    expect(flee(agent(), { x: 3, y: 0 }, 2, vec2(), 2)).toEqual({ x: 0, y: 0 });
  });

  it('arrive stops within the slowing radius without passing far beyond the target', () => {
    fc.assert(fc.property(fc.double({ min: -200, max: 200, noNaN: true }), fc.double({ min: -200, max: 200, noNaN: true }), (tx, ty) => {
      const a = agent(), target = { x: tx, y: ty }, f = vec2();
      let maxOvershoot = 0;
      for (let i = 0; i < 60 * 60; i++) {
        integrate(a, combine([[arrive(a, target, 8, 6, f), 4]], 40, f), 8, dt);
        const along = ((a.x - tx) * -tx + (a.y - ty) * -ty) / (Math.hypot(tx, ty) || 1);
        maxOvershoot = Math.max(maxOvershoot, -along);
      }
      expect(Math.hypot(a.x - tx, a.y - ty)).toBeLessThan(0.05);
      expect(Math.hypot(a.vx, a.vy)).toBeLessThan(0.05);
      expect(maxOvershoot).toBeLessThan(6);
    }), { numRuns: 40 });
  });

  it('pursue leads a moving target and catches it sooner than seek', () => {
    const lead = pursue(agent(0, -10), agent(0, 0, 5, 0), 5);
    expect(lead.x).toBeGreaterThan(seek(agent(0, -10), { x: 0, y: 0 }, 5).x);
    const chase = (usePursue: boolean) => {
      const hunter = agent(0, -40), prey = agent(0, 0, 3, 0), f = vec2();
      for (let t = 0; t < 60 * 60; t++) {
        integrate(hunter, usePursue ? pursue(hunter, prey, 5, f) : seek(hunter, prey, 5, f), 5, dt);
        integrate(prey, vec2(), 3, dt);
        if (Math.hypot(hunter.x - prey.x, hunter.y - prey.y) < 0.5) return t;
      }
      return Infinity;
    };
    expect(chase(true)).toBeLessThan(chase(false));
  });

  it('evade flees from the predicted position', () => {
    const f = evade(agent(0, 0), agent(-10, 5, 0, -10), 2);
    expect(f.y).toBeGreaterThan(0);
    expect(evade(agent(), agent(50, 0), 2, vec2(), Infinity, 10)).toEqual({ x: 0, y: 0 });
  });

  it('wander is seeded: same seed, same path', () => {
    const walk = (seed: number) => {
      const rng = createRng(seed), w = createWander(rng, { radius: 2, distance: 4, jitter: 0.4 }), a = agent(0, 0, 1, 0), f = vec2();
      for (let i = 0; i < 300; i++) integrate(a, wander(a, w, rng, 3, f), 3, dt);
      return [a.x, a.y, w.angle];
    };
    expect(walk(5)).toEqual(walk(5));
    expect(walk(5)).not.toEqual(walk(6));
  });

  it('separation pushes away from close neighbors and ignores self and far ones', () => {
    const a = agent();
    const f = separation(a, [a, { x: 1, y: 0 }, { x: 50, y: 0 }], 4, 10);
    expect(f.x).toBeLessThan(0);
    expect(f.y).toBeCloseTo(0, 12);
    expect(separation(a, [{ x: 0, y: 0 }], 4, 10)).toEqual({ x: 0, y: 0 });
  });

  it('obstacle avoidance swerves away from a circle in the path and keeps the agent out of it', () => {
    const obstacle = { x: 20, y: 0.5, r: 3 }, a = agent(0, 0, 5, 0);
    const push = avoidObstacles(a, [obstacle], 0.5, 20, 5);
    expect(avoidObstacles(a, [obstacle], 0.5, 10, 5)).toEqual({ x: 0, y: 0 });
    expect(push.y).toBeLessThan(0);
    expect(avoidObstacles(a, [{ x: 20, y: 10, r: 3 }], 0.5, 10, 5)).toEqual({ x: 0, y: 0 });
    expect(avoidObstacles(a, [{ x: -20, y: 0, r: 3 }], 0.5, 30, 5)).toEqual({ x: 0, y: 0 });
    expect(avoidObstacles(agent(18, 0), [obstacle], 0.5, 8, 5).x).toBeLessThan(0);
    // Steering is soft: across every offset the agent may graze the reach by at most 0.05 units.
    for (let oy = -3.4; oy <= 3.4; oy += 0.2) {
      const rock = { x: 20, y: oy, r: 3 }, b = agent(0, 0, 5, 0), goal = { x: 40, y: 0 }, s = vec2(), o = vec2(), out = vec2();
      let closest = Infinity;
      for (let i = 0; i < 60 * 20; i++) {
        combine([[arrive(b, goal, 5, 4, s), 1], [avoidObstacles(b, [rock], 0.5, 8, 5, o), 6]], 30, out);
        integrate(b, out, 5, dt);
        closest = Math.min(closest, Math.hypot(b.x - rock.x, b.y - rock.y));
      }
      expect(closest, `offset ${oy}`).toBeGreaterThan(rock.r + 0.5 - 0.05);
      expect(Math.hypot(b.x - goal.x, b.y - goal.y)).toBeLessThan(0.5);
    }
  });

  it('swerves toward (-vy, vx) from a dead-ahead obstacle: the agent\'s right on Phaser XY and Kit XZ', () => {
    // Phaser, y down: heading east (+x), the agent's right is screen-down (+y).
    const east = avoidObstacles(agent(0, 0, 5, 0), [{ x: 6, y: 0, r: 1 }], 0.5, 10, 5);
    expect(east.x).toBeCloseTo(0, 12);
    expect(east.y).toBeGreaterThan(0);
    // Kit 3D, +Y up, z passed as y: the agent's right is forward x up = (fx, 0, fz) x (0, 1, 0) = (-fz, 0, fx).
    for (const [fx, fz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const f = avoidObstacles(agent(0, 0, fx * 5, fz * 5), [{ x: fx * 6, y: fz * 6, r: 1 }], 0.5, 10, 5);
      const rightX = -fz, rightZ = fx, push = Math.hypot(f.x, f.y);
      expect(push).toBeGreaterThan(0);
      expect(f.x / push, `heading ${fx},${fz}`).toBeCloseTo(rightX, 12);
      expect(f.y / push, `heading ${fx},${fz}`).toBeCloseTo(rightZ, 12);
    }
    // Heading +Z in Kit 3D: the push is toward -X.
    expect(avoidObstacles(agent(0, 0, 0, 5), [{ x: 0, y: 6, r: 1 }], 0.5, 10, 5).x).toBeLessThan(0);
  });

  it('combine weights and truncates; integrate caps speed', () => {
    const f = combine([[{ x: 3, y: 0 }, 2], [{ x: 0, y: 8 }, 1]], 5);
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(5, 12);
    expect(f.x / f.y).toBeCloseTo(6 / 8, 12);
    const a = integrate(agent(), { x: 1000, y: 0 }, 2, 0.5);
    expect(a.vx).toBeCloseTo(2, 12);
    expect(a.x).toBeCloseTo(1, 12);
  });
});
