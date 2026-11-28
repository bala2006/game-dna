import { describe, expect, it } from 'vitest';
import type { TileSolid } from '../src/collision.js';
import {
  approach, createPlatformerBody, createPlatformerStep, stepGround, stepPlatformer,
  type GroundBody, type GroundCollide, type GroundHeight, type GroundInput, type GroundTuning, type PlatformerBody, type PlatformerInput, type PlatformerParams,
} from '../src/controller.js';

const T = 32, DT = 1 / 60, W = 20, H = 26;
const P: PlatformerParams = {
  maxSpeed: 240, acceleration: 1800, deceleration: 2200, airControl: 0.8, jumpVelocity: 520, gravity: 1500, maxFallSpeed: 720,
  coyoteTicks: 5, bufferTicks: 6, jumpCut: 0.45,
};
/** Floor along row 7, walls at columns 0 and 39, ceiling at row 0. Columns 12 to 15 are a pit. */
const level: TileSolid = (c, r) => c <= 0 || c >= 39 || r <= 0 || (r >= 7 && (c < 12 || c > 15));
const idle: PlatformerInput = { move: 0, jumpPressed: false, jumpReleased: false };
const standing = (col: number) => createPlatformerBody(col * T + (T - W) / 2, 7 * T - H, W, H);

function run(b: PlatformerBody, ticks: number, input: Partial<PlatformerInput> = {}) {
  const out = createPlatformerStep(), log: Array<{ vx: number; vy: number; y: number; jumped: boolean; landed: boolean; coyote: boolean; airJump: boolean }> = [];
  for (let i = 0; i < ticks; i++) {
    stepPlatformer(b, { ...idle, ...input }, P, DT, level, T, out);
    log.push({ vx: b.vx, vy: b.vy, y: b.y, jumped: out.jumped, landed: out.landed, coyote: out.coyote, airJump: out.airJump });
  }
  return log;
}

describe('approach', () => {
  it('moves toward a target without overshooting', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, -10, 25)).toBe(-10);
    expect(approach(-4, 0, 1)).toBe(-3);
  });
});

describe('platformer controller', () => {
  it('accelerates and brakes along linear curves, and turns around at the stronger rate', () => {
    const b = standing(3);
    expect(run(b, 9, { move: 1 }).map((s) => s.vx)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 240].map((v) => expect.closeTo(v, 9)));
    expect(b.grounded).toBe(true);
    const stop = run(b, 7);
    expect(stop[0]!.vx).toBeCloseTo(240 - 2200 / 60, 9);
    expect(stop[6]!.vx).toBe(0);
    run(b, 8, { move: 1 });
    expect(run(b, 1, { move: -1 })[0]!.vx).toBeCloseTo(240 - 2200 / 60, 9);
  });

  it('accelerates with air control while airborne', () => {
    const b = standing(3);
    run(b, 1, { jumpPressed: true });
    expect(b.grounded).toBe(false);
    expect(run(b, 1, { move: 1 })[0]!.vx).toBeCloseTo(1800 * 0.8 / 60, 9);
  });

  it('jumps against gravity and cuts the rise on early release for a lower apex', () => {
    const apex = (holdTicks: number) => {
      const b = standing(3), start = b.y;
      run(b, 1, { jumpPressed: true });
      expect(b.vy).toBeCloseTo(-520 + 1500 / 60, 9);
      const hold = run(b, holdTicks), cut = run(b, 1, { jumpReleased: true })[0]!, all = [...hold, cut, ...run(b, 90)];
      expect(all.filter((s) => s.landed)).toHaveLength(1);
      return { height: start - Math.min(...all.map((s) => s.y)), cutVy: cut.vy };
    };
    const full = apex(60), short = apex(3);
    expect(full.height).toBeGreaterThan(80);
    expect(Math.abs(full.height - (520 * 520) / (2 * 1500))).toBeLessThan(6);
    expect(short.height).toBeLessThan(full.height * 0.6);
    expect(short.cutVy).toBeCloseTo((-520 + 4 * 1500 / 60) * 0.45 + 1500 / 60, 9);
  });

  it('remembers a jump press for bufferTicks before landing, and not one tick longer', () => {
    const drop = () => { const b = standing(3); b.y -= 60; b.grounded = false; return b; };
    // Index of the first tick that starts on the ground.
    const first = run(drop(), 60).findIndex((s) => s.landed) + 1;
    const jumpTick = (pressTick: number) => {
      const b = drop();
      run(b, pressTick);
      const i = [...run(b, 1, { jumpPressed: true }), ...run(b, 40)].findIndex((s) => s.jumped);
      return i < 0 ? -1 : pressTick + i;
    };
    expect(first).toBeGreaterThan(P.bufferTicks);
    expect(jumpTick(first)).toBe(first);
    expect(jumpTick(first - (P.bufferTicks - 1))).toBe(first);
    expect(jumpTick(first - P.bufferTicks)).toBe(-1);
  });

  it('grants coyoteTicks of jump after walking off a ledge, and none after a jump', () => {
    const b = standing(10);
    for (let i = 0; i < 120 && b.grounded; i++) run(b, 1, { move: 1 });
    expect(b.grounded).toBe(false);
    expect(b.coyote).toBe(P.coyoteTicks);
    const tryJumpAfter = (waitTicks: number) => {
      const c = { ...b };
      run(c, waitTicks, { move: 1 });
      return run(c, 1, { move: 1, jumpPressed: true })[0]!;
    };
    for (let wait = 0; wait < P.coyoteTicks; wait++) expect(tryJumpAfter(wait)).toMatchObject({ jumped: true, coyote: true, airJump: false });
    expect(tryJumpAfter(P.coyoteTicks).jumped).toBe(false);

    const j = standing(3);
    run(j, 1, { jumpPressed: true });
    run(j, 1, { jumpReleased: true });
    const again = run(j, 10, { jumpPressed: true });
    expect(again.some((s) => s.jumped)).toBe(false);
    expect(j.jumps).toBe(1);
  });

  it('caps fall speed and lands on the floor below', () => {
    const b = standing(13);
    const log = run(b, 120);
    expect(Math.max(...log.map((s) => s.vy))).toBe(P.maxFallSpeed);
    expect(b.grounded).toBe(false);
    expect(b.y).toBeGreaterThan(7 * T);
  });

  it('falls toward -y with gravitySign -1: stands on the ceiling and jumps downward', () => {
    const b = createPlatformerBody(3 * T, T, W, H);
    b.gravitySign = -1;
    run(b, 10);
    expect(b.grounded).toBe(true);
    expect(b.y).toBe(T);
    const log = run(b, 1, { jumpPressed: true });
    expect(log[0]!.jumped).toBe(true);
    expect(b.vy).toBeCloseTo(520 - 1500 / 60, 9);
    const back = run(b, 120);
    expect(back.some((s) => s.landed)).toBe(true);
    expect(b.y).toBe(T);
  });
});

const G: GroundTuning = { jog: 3, sprint: 5.5, toTop: 0.2, toStop: 0.15, airControl: 0.35, overspeed: 1.05, turnTau: 0.12, turnMinSpeed: 0.15, jump: 4.6, gravity: 14.7 };
const still: GroundInput = { moveX: 0, moveY: 0, sprint: false, jump: false, cameraYaw: 0, faceCamera: false };
const flat = () => 0;
const body = (): GroundBody => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 0, grounded: true });

function walk(b: GroundBody, seconds: number, dt: number, input: Partial<GroundInput> = {}, height: GroundHeight = flat, collide: GroundCollide | null = null) {
  const out = { jumped: false, landed: false }, events = { jumped: 0, landed: 0 };
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
    stepGround(b, { ...still, ...input }, G, dt, height, collide, out);
    events.jumped += out.jumped ? 1 : 0;
    events.landed += out.landed ? 1 : 0;
  }
  return events;
}

describe('ground controller', () => {
  it('covers the same distance in the same simulated time at any fixed rate', () => {
    const results = [30, 60, 120, 240].map((hz) => {
      const b = body();
      walk(b, 2, 1 / hz, { moveY: 1, sprint: true });
      const speed = Math.hypot(b.vx, b.vz);
      walk(b, 1, 1 / hz);
      return { z: b.z, speed, stopped: Math.hypot(b.vx, b.vz) };
    });
    for (const r of results) {
      expect(r.speed).toBeCloseTo(G.sprint, 9);
      expect(r.stopped).toBe(0);
      expect(Math.abs(r.z - results[1]!.z)).toBeLessThan(0.05);
    }
    expect(results[1]!.z).toBeCloseTo(G.sprint * (2 - G.toTop / 2) + G.sprint * G.toStop / 2, 1);
  });

  it('reaches sprint speed in toTop seconds and jog speed without sprint', () => {
    const b = body();
    walk(b, G.toTop, DT, { moveY: 1, sprint: true });
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(G.sprint, 9);
    const j = body();
    walk(j, 1, DT, { moveY: 1 });
    expect(Math.hypot(j.vx, j.vz)).toBeCloseTo(G.jog, 9);
  });

  it('moves relative to the camera: forward along its heading, moveX to its right', () => {
    const b = body();
    walk(b, 1, DT, { moveY: 1, cameraYaw: Math.PI / 2 });
    expect(b.x).toBeGreaterThan(2);
    expect(Math.abs(b.z)).toBeLessThan(1e-9);
    const r = body();
    walk(r, 1, DT, { moveX: 1 });
    expect(r.x).toBeLessThan(-2);
    expect(r.facing).toBeCloseTo(-Math.PI / 2, 2);
    const fp = body();
    walk(fp, 0.1, DT, { moveY: 1, cameraYaw: 1.2, faceCamera: true });
    expect(fp.facing).toBe(1.2);
  });

  it('turns toward the motion at the same rate at any fixed rate', () => {
    const facing = [60, 120].map((hz) => { const b = body(); walk(b, 0.25, 1 / hz, { moveY: 1, cameraYaw: Math.PI / 2 }); return b.facing; });
    expect(facing[0]).toBeGreaterThan(0.5);
    expect(facing[0]).toBeLessThan(Math.PI / 2);
    expect(Math.abs(facing[0]! - facing[1]!)).toBeLessThan(0.03);
  });

  it('snaps to the ground up and down a slope, and lands back on it after a jump', () => {
    const slope = (x: number) => 0.25 * x;
    const b = body(), out = { jumped: false, landed: false };
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
      for (let i = 0; i < 120; i++) {
        stepGround(b, { ...still, moveY: 1, sprint: true, cameraYaw: yaw }, G, DT, slope, null, out);
        expect(b.grounded).toBe(true);
        expect(b.y).toBe(slope(b.x));
      }
    }
    const hops = walk(b, 1.5, DT, { moveY: 1, cameraYaw: Math.PI / 2, jump: true }, slope);
    const settle = walk(b, 1, DT, { moveY: 1, cameraYaw: Math.PI / 2 }, slope);
    expect(hops.jumped).toBeGreaterThan(1);
    expect(hops.landed + settle.landed).toBe(hops.jumped);
    expect(b.grounded).toBe(true);
    expect(b.y).toBe(slope(b.x));
  });

  it('jumps only from the ground, to about v^2 / 2g', () => {
    const b = body(), out = { jumped: false, landed: false };
    let top = 0, jumps = 0;
    for (let i = 0; i < 90; i++) {
      stepGround(b, { ...still, jump: true }, G, DT, flat, null, out);
      jumps += out.jumped ? 1 : 0;
      top = Math.max(top, b.y);
      if (out.landed) break;
    }
    expect(jumps).toBe(1);
    expect(Math.abs(top - (G.jump * G.jump) / (2 * G.gravity))).toBeLessThan(0.05);
    expect(b.grounded).toBe(true);
  });

  it('lets a callback push the body out of obstacles and derives velocity from the real move', () => {
    const b = body();
    walk(b, 2, DT, { moveY: 1, sprint: true }, flat, (p) => { p.z = Math.min(p.z, 1); });
    expect(b.z).toBe(1);
    expect(b.vz).toBe(0);
    const k = body();
    walk(k, 1 / 60, DT, { moveY: 1 }, flat, (p) => { p.x += 10; });
    expect(Math.hypot(k.vx, k.vz)).toBeCloseTo(G.sprint * G.overspeed, 9);
  });
});
