/**
 * Arcade vehicle handling on the ground plane. Pure: no three.js, no DOM, no clocks, no randomness.
 * Meters, seconds and radians; +Y up, +Z forward, ground plane XZ, heading = atan2(forward.x, forward.z).
 * Velocity splits into forward speed and lateral slide. Grip removes slide each tick and drifting keeps more.
 * Positive steer raises the heading, which turns the car left: at heading 0 the driver faces +Z
 * and +X is on the left. Every tuning number comes from the caller.
 */
import { clamp } from './random.js';

/** Vehicle motion state. `speed` is written by `stepVehicle`; the step reads velocity and heading. */
export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Forward speed, m/s; negative when reversing. */
  speed: number;
  /** Smoothed steering, -1 to 1. */
  steer: number;
}

/** Driver input. `steer` is -1 to 1, positive to the left; pedals are 0 to 1. */
export interface VehicleInput { steer: number; throttle: number; brake: number; drift: boolean }

/** Handling tuning. Speeds in m/s, accelerations in m/s², rates in 1/s. */
export interface VehicleTuning {
  /** Top forward speed. */
  top: number;
  /** Full-throttle acceleration from rest. */
  accel: number;
  /** Share of acceleration lost at top speed, 0 to 1. */
  accelFade: number;
  /** Throttle multiplier while rolling backward, so throttle stops a reversing car quickly. */
  reverseThrottle: number;
  /** Full-brake deceleration while moving forward. */
  brake: number;
  /** Full-brake acceleration backward once stopped. */
  reverseAccel: number;
  /** Top reverse speed, positive. */
  reverseTop: number;
  /** Rolling deceleration with both pedals released. */
  coast: number;
  /** Pedal input below this counts as released. */
  pedalDeadzone: number;
  /** Rate at which speed above the current limit bleeds away. */
  overspeedBleed: number;
  /** How fast the smoothed steering follows the input. */
  steerRate: number;
  /** Yaw rate at full lock once `yawSpeed` is reached, rad/s. */
  yaw: number;
  /** Speed at which full yaw rate becomes available. */
  yawSpeed: number;
  /** Share of yaw rate lost at top speed, 0 to 1. */
  yawFade: number;
  /** Yaw rate multiplier while drifting. */
  driftYaw: number;
  /** Share of lateral velocity kept per 1/60 s on grip, at rest. */
  gripKeep: number;
  /** Added to `gripKeep` at top speed. */
  gripGain: number;
  /** Share of lateral velocity kept per 1/60 s while drifting. */
  driftKeep: number;
}

/** Per-tick outputs for effects, sound and body motion. */
export interface VehicleStep {
  /** Forward acceleration this tick, m/s². */
  accel: number;
  /** Lateral slide speed after grip, m/s. Smoke and skid marks start around 3. */
  slip: number;
  /** Heading change rate, rad/s. */
  yawRate: number;
  /** Centripetal acceleration from speed and yaw rate, m/s², positive when turning left. */
  latAccel: number;
}

/** A vehicle at rest at (x, z) facing `heading`. */
export const createVehicleState = (x = 0, z = 0, heading = 0): VehicleState => ({ x, z, heading, vx: 0, vz: 0, speed: 0, steer: 0 });

/** A reusable `VehicleStep` for the `out` argument. */
export const createVehicleStep = (): VehicleStep => ({ accel: 0, slip: 0, yawRate: 0, latAccel: 0 });

/** Advances a vehicle by `dt` seconds. `limit` is the surface speed limit (off road, for example); faster cars bleed speed toward it. */
export function stepVehicle(s: VehicleState, input: VehicleInput, t: VehicleTuning, dt: number, out: VehicleStep, limit = t.top): VehicleStep {
  const vfPrev = s.vx * Math.sin(s.heading) + s.vz * Math.cos(s.heading);
  s.steer += (input.steer - s.steer) * Math.min(1, t.steerRate * dt);
  const sp = Math.abs(vfPrev);
  const yawRate = s.steer * t.yaw * Math.min(1, sp / t.yawSpeed) * (1 - t.yawFade * Math.min(1, sp / t.top)) * (input.drift ? t.driftYaw : 1) * (vfPrev < 0 ? -1 : 1);
  s.heading += yawRate * dt;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  let vf = s.vx * fx + s.vz * fz;
  let lx = s.vx - fx * vf, lz = s.vz - fz * vf;
  vf += input.throttle * t.accel * dt * (vf < 0 ? t.reverseThrottle : 1) * (1 - t.accelFade * Math.min(1, Math.max(0, vf) / t.top));
  vf -= input.brake * (vf > 0 ? t.brake : t.reverseAccel) * dt;
  if (input.throttle < t.pedalDeadzone && input.brake < t.pedalDeadzone) vf -= Math.sign(vf) * Math.min(Math.abs(vf), t.coast * dt);
  if (vf > limit) vf -= (vf - limit) * t.overspeedBleed * dt;
  vf = clamp(vf, -t.reverseTop, t.top);
  const keep = Math.pow(input.drift ? t.driftKeep : t.gripKeep + t.gripGain * Math.min(1, Math.abs(vf) / t.top), dt * 60);
  lx *= keep;
  lz *= keep;
  s.vx = fx * vf + lx;
  s.vz = fz * vf + lz;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.speed = vf;
  out.accel = (vf - vfPrev) / dt;
  out.slip = Math.hypot(lx, lz);
  out.yawRate = yawRate;
  out.latAccel = vf * yawRate;
  return out;
}

/** Position and velocity on the ground plane, as `bounceOffWall` needs them. */
export interface WallBody { x: number; z: number; vx: number; vz: number }

/**
 * Moves a body `depth` meters out of a wall along the wall's unit normal (nx, nz), which points out
 * of the wall toward the body. Speed into the wall is reflected with `restitution` (0 stops, 1 mirrors),
 * then the whole velocity is scaled by `keep`. Returns the impact speed, 0 when already moving away.
 */
export function bounceOffWall(s: WallBody, nx: number, nz: number, depth: number, restitution: number, keep: number): number {
  s.x += nx * depth;
  s.z += nz * depth;
  const vn = s.vx * nx + s.vz * nz;
  if (!(vn < 0)) return 0;
  const f = 1 + restitution;
  s.vx -= nx * vn * f;
  s.vz -= nz * vn * f;
  s.vx *= keep;
  s.vz *= keep;
  return -vn;
}
