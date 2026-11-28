/**
 * Character controllers as pure step functions over plain state. No three.js, no DOM, no clocks, no randomness.
 * Platformer (2D side view): unit-agnostic (pixels or tiles), y grows downward as in Phaser. With
 * `gravitySign` +1 gravity pulls toward +y and a jump sets vy negative; -1 reverses both. Speeds are
 * units per second, `dt` is seconds, and coyote time and the jump buffer count fixed ticks.
 * Ground (3D on foot): meters and seconds, +Y up, +Z forward, ground plane XZ, heading
 * = atan2(forward.x, forward.z). Movement is camera-relative: moveY forward, moveX to the right.
 * Every tuning number comes from the caller.
 */
import { moveAndCollideTiles, createTileMove, type Aabb, type PointXZ, type TileSolid } from './collision.js';
import { ease, wrapAngle } from './random.js';

/** Moves `v` toward `target` by at most `delta`, without overshooting. */
export const approach = (v: number, target: number, delta: number): number => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

/** Platformer tuning. Speeds in units per second, accelerations in units per second squared. */
export interface PlatformerParams {
  maxSpeed: number;
  acceleration: number;
  /** Braking with no input; turning around uses the larger of this and `acceleration`. */
  deceleration: number;
  /** Share of acceleration and deceleration available in the air, 0 to 1. */
  airControl: number;
  jumpVelocity: number;
  gravity: number;
  maxFallSpeed: number;
  /** Ticks after walking off a ledge during which a jump still works. */
  coyoteTicks: number;
  /** Ticks a jump press is remembered before landing. */
  bufferTicks: number;
  /** Rising speed is multiplied by this when jump is released early, for variable jump height. */
  jumpCut: number;
}

/** Platformer body: a box (min corner and size) plus motion and timer state. */
export interface PlatformerBody extends Aabb {
  vx: number;
  vy: number;
  /** +1: gravity toward +y (down on screen). -1: reversed. */
  gravitySign: 1 | -1;
  grounded: boolean;
  /** Jumps since the body last landed. */
  jumps: number;
  /** Coyote ticks left. */
  coyote: number;
  /** Buffered jump ticks left. */
  buffer: number;
  /** Grounded at the start of this tick. Set by `platformerControl`. */
  wasGrounded: boolean;
  /** Left the ground by its own action this tick, so no coyote time follows. Set it for game actions such as a gravity flip. */
  launched: boolean;
}

/** Per-tick platformer input. `move` is -1 to 1, positive toward +x. */
export interface PlatformerInput { move: number; jumpPressed: boolean; jumpReleased: boolean }

/** What happened during a platformer tick. */
export interface PlatformerStep {
  jumped: boolean;
  /** The jump used coyote time. */
  coyote: boolean;
  /** The jump was not the first since landing. */
  airJump: boolean;
  /** Jump was released while rising and the rise was cut. */
  cut: boolean;
  /** Touched down this tick after being airborne. */
  landed: boolean;
}

/** A resting platformer body with its min corner at (x, y). */
export const createPlatformerBody = (x: number, y: number, w: number, h: number): PlatformerBody =>
  ({ x, y, w, h, vx: 0, vy: 0, gravitySign: 1, grounded: true, jumps: 0, coyote: 0, buffer: 0, wasGrounded: true, launched: false });

/** A reusable `PlatformerStep` for the `out` argument. */
export const createPlatformerStep = (): PlatformerStep => ({ jumped: false, coyote: false, airJump: false, cut: false, landed: false });

/** Tick phase 1: run acceleration, jump buffer, coyote jump and jump cut. */
export function platformerControl(b: PlatformerBody, input: PlatformerInput, p: PlatformerParams, dt: number, out: PlatformerStep): PlatformerStep {
  out.jumped = out.coyote = out.airJump = out.cut = out.landed = false;
  b.wasGrounded = b.grounded;
  b.launched = false;
  const g = b.gravitySign, control = b.grounded ? 1 : p.airControl, dir = input.move;
  if (dir !== 0) {
    const turning = b.vx !== 0 && Math.sign(b.vx) !== Math.sign(dir);
    b.vx = approach(b.vx, dir * p.maxSpeed, (turning ? Math.max(p.acceleration, p.deceleration) : p.acceleration) * control * dt);
  } else {
    b.vx = approach(b.vx, 0, p.deceleration * control * dt);
  }
  if (input.jumpPressed) b.buffer = p.bufferTicks;
  if (b.buffer > 0 && (b.grounded || b.coyote > 0)) {
    out.jumped = true;
    out.coyote = !b.grounded;
    out.airJump = b.jumps >= 1;
    b.vy = -g * p.jumpVelocity;
    b.jumps++;
    b.buffer = 0;
    b.coyote = 0;
    b.grounded = false;
    b.launched = true;
  }
  if (input.jumpReleased && b.vy * g < 0) {
    b.vy *= p.jumpCut;
    out.cut = true;
  }
  return out;
}

/** Tick phase 2: gravity along `gravitySign` and the fall-speed cap. */
export function platformerGravity(b: PlatformerBody, p: PlatformerParams, dt: number): void {
  const gs = b.gravitySign;
  b.vy += gs * p.gravity * dt;
  if (b.vy * gs > p.maxFallSpeed) b.vy = gs * p.maxFallSpeed;
}

/** Tick phase 3, after collision: ground state, coyote and buffer countdown. Returns true on touchdown. */
export function platformerSettle(b: PlatformerBody, onGround: boolean, p: PlatformerParams): boolean {
  b.grounded = onGround;
  let touchdown = false;
  if (onGround) {
    b.jumps = 0;
    b.coyote = 0;
    touchdown = !b.wasGrounded;
  } else if (b.wasGrounded && !b.launched) {
    b.coyote = p.coyoteTicks;
  } else if (b.coyote > 0) {
    b.coyote--;
  }
  if (b.buffer > 0) b.buffer--;
  return touchdown;
}

const move = createTileMove();

/** One full platformer tick on a tile grid: control, gravity, axis-separated collision, settle. */
export function stepPlatformer(b: PlatformerBody, input: PlatformerInput, p: PlatformerParams, dt: number, isSolid: TileSolid, tileSize: number, out: PlatformerStep): PlatformerStep {
  platformerControl(b, input, p, dt, out);
  platformerGravity(b, p, dt);
  const m = moveAndCollideTiles(b, b.vx * dt, b.vy * dt, isSolid, tileSize, move);
  b.x = m.x;
  b.y = m.y;
  if (m.left || m.right) b.vx = 0;
  if (m.top || m.bottom) b.vy = 0;
  out.landed = platformerSettle(b, b.gravitySign > 0 ? m.bottom : m.top, p);
  return out;
}

/** On-foot tuning in meters and seconds. */
export interface GroundTuning {
  /** Speed at full stick without sprint, m/s. */
  jog: number;
  /** Sprint speed, m/s. Acceleration rates are measured against it. */
  sprint: number;
  /** Seconds from rest to sprint speed. */
  toTop: number;
  /** Seconds from sprint speed to rest. */
  toStop: number;
  /** Share of acceleration available in the air, 0 to 1. */
  airControl: number;
  /** Speed cap after collision, as a multiple of sprint speed. */
  overspeed: number;
  /** Time constant for turning toward the direction of motion, s. */
  turnTau: number;
  /** Below this speed the body keeps its facing, m/s. */
  turnMinSpeed: number;
  /** Take-off speed, m/s. */
  jump: number;
  /** m/s². */
  gravity: number;
}

/** On-foot body. `y` is the feet height; `facing` is a heading in radians. */
export interface GroundBody { x: number; y: number; z: number; vx: number; vy: number; vz: number; facing: number; grounded: boolean }

/** Per-tick on-foot input. `cameraYaw` is the heading the camera looks along. */
export interface GroundInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  cameraYaw: number;
  /** Turn with the camera, as in first person, instead of toward the motion. */
  faceCamera: boolean;
}

/** What happened during an on-foot tick. */
export interface GroundStep { jumped: boolean; landed: boolean }

/** Ground height in meters at a point on the XZ plane. */
export type GroundHeight = (x: number, z: number) => number;

/** Moves the proposed position `p` out of obstacles, in place. Do not keep `p`. */
export type GroundCollide = (p: PointXZ) => void;

const probe: PointXZ = { x: 0, z: 0 };

/**
 * One on-foot tick: camera-relative acceleration, optional obstacle push-out, velocity from the actual
 * displacement, jump and gravity, snapping to `height` while grounded, and turn smoothing.
 */
export function stepGround(b: GroundBody, input: GroundInput, t: GroundTuning, dt: number, height: GroundHeight, collide: GroundCollide | null, out: GroundStep): GroundStep {
  out.jumped = out.landed = false;
  const mag = Math.min(1, Math.hypot(input.moveX, input.moveY));
  const yaw = input.cameraYaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const dx = fx * input.moveY + rx * input.moveX, dz = fz * input.moveY + rz * input.moveX, dl = Math.hypot(dx, dz) || 1;
  const top = (input.sprint ? t.sprint : t.jog) * mag;
  const tx = (dx / dl) * top, tz = (dz / dl) * top, speed = Math.hypot(b.vx, b.vz);
  const rate = (top > speed ? t.sprint / t.toTop : t.sprint / t.toStop) * dt * (b.grounded ? 1 : t.airControl);
  const ex = tx - b.vx, ez = tz - b.vz, el = Math.hypot(ex, ez);
  if (el > 0) { const k = Math.min(1, rate / el); b.vx += ex * k; b.vz += ez * k; }

  probe.x = b.x + b.vx * dt;
  probe.z = b.z + b.vz * dt;
  if (collide) collide(probe);
  const nx = probe.x, nz = probe.z, cap = t.sprint * t.overspeed;
  b.vx = (nx - b.x) / dt;
  b.vz = (nz - b.z) / dt;
  if (Math.hypot(b.vx, b.vz) > cap) { const k = cap / Math.hypot(b.vx, b.vz); b.vx *= k; b.vz *= k; }
  b.x = nx;
  b.z = nz;

  const ground = height(b.x, b.z);
  if (b.grounded && input.jump) { b.vy = t.jump; b.grounded = false; out.jumped = true; }
  if (!b.grounded) {
    b.vy -= t.gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= ground) { b.y = ground; b.vy = 0; b.grounded = true; out.landed = true; }
  } else b.y = ground;

  if (input.faceCamera) b.facing = yaw;
  else if (Math.hypot(b.vx, b.vz) > t.turnMinSpeed) b.facing += wrapAngle(Math.atan2(b.vx, b.vz) - b.facing) * ease(dt, t.turnTau);
  return out;
}
