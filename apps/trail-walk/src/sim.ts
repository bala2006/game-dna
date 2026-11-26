import { wrapAngle } from '@gamedna/kit/random';
import type { Box, Layout } from './layout.js';

export const DT = 1 / 60;
export const TUNE = { jog: 3.0, sprint: 5.5, toTop: 0.2, toStop: 0.15, turnTau: 0.12, jump: 4.6, gravity: 14.7, radius: 0.3, reach: 1.2 } as const;

/** One tick of player input. Movement is relative to `cameraYaw`, the yaw the camera looked along last frame. */
export interface WalkInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  interact: boolean;
  cameraYaw: number;
  /** First person: the body turns with the camera instead of toward the motion. */
  faceCamera: boolean;
}

export type WalkEvent = { type: 'collect'; index: number; count: number } | { type: 'finish'; ticks: number } | { type: 'jump' } | { type: 'land' };

export interface Player {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  facing: number;
  grounded: boolean;
  prev: { x: number; y: number; z: number; facing: number };
}

export interface WalkState {
  tick: number;
  collected: boolean[];
  count: number;
  /** Ticks from reset to the last marker; null until finished. */
  finishTicks: number | null;
  paused: boolean;
}

/** Pushes a circle at (x, z) out of a turned box. Returns the corrected point. */
export function pushOutOfBox(x: number, z: number, r: number, b: Box): { x: number; z: number } {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
  let ox = lx - qx, oz = lz - qz, d = Math.hypot(ox, oz);
  if (d >= r) return { x, z };
  let nx: number, nz: number;
  if (d > 1e-9) { nx = ox / d; nz = oz / d; }
  else {
    const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
    if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; ox = 0; oz = 0; d = -px; }
    else { nx = 0; nz = Math.sign(lz) || 1; ox = 0; oz = 0; d = -pz; }
  }
  const push = r - d, rx = lx + nx * push, rz = lz + nz * push;
  return { x: b.x + rx * c + rz * s, z: b.z - rx * s + rz * c };
}

/** Walking, jumping, collision and the marker hunt. No rendering, no clocks. */
export class WalkSim {
  readonly player: Player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 0, grounded: true, prev: { x: 0, y: 0, z: 0, facing: 0 } };
  readonly state: WalkState = { tick: 0, collected: [], count: 0, finishTicks: null, paused: false };
  private events: WalkEvent[] = [];
  private readonly solids: Box[];

  constructor(readonly layout: Layout) {
    this.solids = [...layout.wall.pieces, layout.car];
    this.reset();
  }

  reset(): void {
    const { start, height } = this.layout, p = this.player;
    Object.assign(p, { x: start.x, z: start.z, y: height(start.x, start.z), vx: 0, vy: 0, vz: 0, facing: start.facing, grounded: true });
    p.prev = { x: p.x, y: p.y, z: p.z, facing: p.facing };
    Object.assign(this.state, { tick: 0, collected: this.layout.markers.map(() => false), count: 0, finishTicks: null, paused: false });
    this.events = [];
  }

  togglePause(): void { this.state.paused = !this.state.paused; }
  pause(): void { this.state.paused = true; }

  /** The nearest uncollected marker within reach, or -1. */
  markerInReach(): number {
    const p = this.player;
    let best = -1, bestD: number = TUNE.reach;
    this.layout.markers.forEach((m, i) => {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (!this.state.collected[i] && d <= bestD) { best = i; bestD = d; }
    });
    return best;
  }

  /** Test and dev use only: stand at a point, at rest. */
  teleport(x: number, z: number): void {
    const p = this.player;
    Object.assign(p, { x, z, y: this.layout.height(x, z), vx: 0, vz: 0, vy: 0, grounded: true });
    p.prev = { x: p.x, y: p.y, z: p.z, facing: p.facing };
  }

  step(input: WalkInput): void {
    if (this.state.paused) return;
    const p = this.player, s = this.state, L = this.layout;
    s.tick++;
    p.prev = { x: p.x, y: p.y, z: p.z, facing: p.facing };
    const mag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const yaw = input.cameraYaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const dx = fx * input.moveY + rx * input.moveX, dz = fz * input.moveY + rz * input.moveX, dl = Math.hypot(dx, dz) || 1;
    const top = (input.sprint ? TUNE.sprint : TUNE.jog) * mag;
    const tx = (dx / dl) * top, tz = (dz / dl) * top, speed = Math.hypot(p.vx, p.vz);
    const rate = (top > speed ? TUNE.sprint / TUNE.toTop : TUNE.sprint / TUNE.toStop) * DT * (p.grounded ? 1 : 0.35);
    const ex = tx - p.vx, ez = tz - p.vz, el = Math.hypot(ex, ez);
    if (el > 0) { const k = Math.min(1, rate / el); p.vx += ex * k; p.vz += ez * k; }

    let nx = p.x + p.vx * DT, nz = p.z + p.vz * DT;
    for (const t of L.trees) {
      const d = Math.hypot(nx - t.x, nz - t.z), min = t.r + TUNE.radius;
      if (d < min && d > 1e-6) { nx = t.x + ((nx - t.x) / d) * min; nz = t.z + ((nz - t.z) / d) * min; }
    }
    for (const b of this.solids) ({ x: nx, z: nz } = pushOutOfBox(nx, nz, TUNE.radius, b));
    const r = Math.hypot(nx, nz);
    if (r > L.bound) { nx *= L.bound / r; nz *= L.bound / r; }
    p.vx = (nx - p.x) / DT;
    p.vz = (nz - p.z) / DT;
    if (Math.hypot(p.vx, p.vz) > TUNE.sprint * 1.05) { const k = (TUNE.sprint * 1.05) / Math.hypot(p.vx, p.vz); p.vx *= k; p.vz *= k; }
    p.x = nx;
    p.z = nz;

    const ground = L.height(p.x, p.z);
    if (p.grounded && input.jump) { p.vy = TUNE.jump; p.grounded = false; this.events.push({ type: 'jump' }); }
    if (!p.grounded) {
      p.vy -= TUNE.gravity * DT;
      p.y += p.vy * DT;
      if (p.y <= ground) { p.y = ground; p.vy = 0; p.grounded = true; this.events.push({ type: 'land' }); }
    } else p.y = ground;

    if (input.faceCamera) p.facing = yaw;
    else if (Math.hypot(p.vx, p.vz) > 0.15) p.facing += wrapAngle(Math.atan2(p.vx, p.vz) - p.facing) * (1 - Math.exp(-DT / TUNE.turnTau));

    if (input.interact && s.finishTicks === null) {
      const i = this.markerInReach();
      if (i >= 0) {
        s.collected[i] = true;
        s.count++;
        this.events.push({ type: 'collect', index: i, count: s.count });
        if (s.count === L.markers.length) { s.finishTicks = s.tick; this.events.push({ type: 'finish', ticks: s.tick }); }
      }
    }
  }

  drainEvents(): WalkEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
