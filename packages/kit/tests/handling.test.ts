import { describe, expect, it } from 'vitest';
import { bounceOffWall, createVehicleState, createVehicleStep, stepVehicle, type VehicleInput, type VehicleState, type VehicleTuning } from '../src/handling.js';

const DT = 1 / 60;
const TUNE: VehicleTuning = {
  top: 40, accel: 12, accelFade: 0.3, reverseThrottle: 2, brake: 30, reverseAccel: 8, reverseTop: 8, coast: 3, pedalDeadzone: 0.05,
  overspeedBleed: 2, steerRate: 8, yaw: 2, yawSpeed: 8, yawFade: 0.5, driftYaw: 1.4, gripKeep: 0.3, gripGain: 0.25, driftKeep: 0.92,
};
const NONE: VehicleInput = { steer: 0, throttle: 0, brake: 0, drift: false };

function drive(s: VehicleState, seconds: number, input: Partial<VehicleInput> = {}, dt = DT, limit = TUNE.top) {
  const out = createVehicleStep(), speeds: number[] = [];
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
    stepVehicle(s, { ...NONE, ...input }, TUNE, dt, out, limit);
    speeds.push(s.speed);
  }
  return { out, speeds };
}

describe('vehicle handling', () => {
  it('accelerates in a straight line toward top speed and never past it', () => {
    const s = createVehicleState();
    const { speeds, out } = drive(s, 30, { throttle: 1 });
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThanOrEqual(speeds[i - 1]!);
    expect(speeds[0]).toBeCloseTo(TUNE.accel * DT, 9);
    expect(s.speed).toBeLessThanOrEqual(TUNE.top);
    expect(s.speed).toBeGreaterThan(TUNE.top * 0.99);
    expect(s.heading).toBe(0);
    expect(s.x).toBe(0);
    expect(s.z).toBeGreaterThan(500);
    expect(out.slip).toBe(0);
    expect(out.accel).toBeGreaterThanOrEqual(0);
  });

  it('brakes to a stop in about top / brake seconds, then reverses up to reverseTop', () => {
    const s = createVehicleState();
    s.vz = TUNE.top;
    const { speeds } = drive(s, 3, { brake: 1 });
    const stopTick = speeds.findIndex((v) => v <= 0);
    expect(stopTick + 1).toBeGreaterThanOrEqual(Math.floor(TUNE.top / TUNE.brake / DT));
    expect(stopTick + 1).toBeLessThanOrEqual(Math.ceil(TUNE.top / TUNE.brake / DT) + 1);
    drive(s, 5, { brake: 1 });
    expect(s.speed).toBe(-TUNE.reverseTop);
    const rolling = createVehicleState();
    rolling.vz = 2;
    drive(rolling, 2);
    expect(rolling.speed).toBe(0);
    drive(rolling, 1);
    expect(rolling.speed).toBe(0);
  });

  it('turns left (heading up, toward +X) on positive steer, right on negative, and not at rest', () => {
    for (const sign of [1, -1]) {
      const s = createVehicleState();
      s.vz = 20;
      const { out } = drive(s, 1, { steer: sign, throttle: 0.5 });
      expect(Math.sign(s.heading)).toBe(sign);
      expect(Math.sign(s.x)).toBe(sign);
      expect(Math.sign(out.yawRate)).toBe(sign);
      expect(Math.sign(out.latAccel)).toBe(sign);
    }
    const parked = createVehicleState();
    drive(parked, 1, { steer: 1 });
    expect(parked.heading).toBe(0);
    expect(parked.steer).toBeCloseTo(1, 3);
  });

  it('keeps more lateral slide while drifting than on grip', () => {
    const slide = (drift: boolean) => {
      const s = createVehicleState();
      s.vx = 6;
      s.vz = 20;
      const { out } = drive(s, 0.25, { drift });
      return out.slip;
    };
    expect(slide(false)).toBeLessThan(0.1);
    expect(slide(true)).toBeGreaterThan(slide(false) * 10);
    expect(slide(true)).toBeLessThan(6);
  });

  it('removes slide at the same rate per second at any fixed rate', () => {
    const slip = [60, 120].map((hz) => {
      const s = createVehicleState();
      s.vx = 6;
      s.vz = 20;
      return drive(s, 0.25, { drift: true }, 1 / hz).out.slip;
    });
    expect(Math.abs(slip[0]! - slip[1]!) / slip[0]!).toBeLessThan(0.02);
  });

  it('bleeds speed above a surface limit until throttle and bleed balance', () => {
    const limited = createVehicleState(), free = createVehicleState();
    limited.vz = free.vz = 35;
    drive(limited, 8, { throttle: 1 }, DT, 15);
    drive(free, 8, { throttle: 1 });
    // Balance per tick: accel * (1 - accelFade * v / top) * (1 - overspeedBleed * dt) = overspeedBleed * (v - limit).
    const a = TUNE.accel * (1 - TUNE.overspeedBleed * DT), b = TUNE.overspeedBleed;
    expect(limited.speed).toBeCloseTo((a + b * 15) / (b + (a * TUNE.accelFade) / TUNE.top), 4);
    expect(free.speed).toBeGreaterThan(35);
  });
});

describe('bounceOffWall', () => {
  it('pushes the body out and reflects the speed into the wall', () => {
    const s = { x: -0.5, z: 0, vx: -10, vz: 5 };
    expect(bounceOffWall(s, 1, 0, 0.5, 0.3, 0.9)).toBe(10);
    expect(s.x).toBe(0);
    expect(s.vx).toBeCloseTo(3 * 0.9, 12);
    expect(s.vz).toBeCloseTo(5 * 0.9, 12);
  });
  it('only moves a body that is already leaving the wall', () => {
    const s = { x: 0, z: -1.2, vx: 3, vz: 2 };
    expect(bounceOffWall(s, 0, 1, 0.2, 0.3, 0.9)).toBe(0);
    expect(s).toEqual({ x: 0, z: -1, vx: 3, vz: 2 });
  });
});
