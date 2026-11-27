import { circleVsCircle, pushCircleOutOfBox, type PointXZ, type Vec2 } from '@gamedna/kit/collision';
import { stepGround, type GroundStep } from '@gamedna/kit/controller';
import type { Box, Layout } from './layout.js';
import { stepSeconds } from '@gamedna/kit/contracts';
import { CONTRACTS } from './contracts.js';

/** Fixed timestep in seconds, from the simulation contract. */
export const DT = stepSeconds(CONTRACTS);
export const TUNE = {
  jog: 3.0, sprint: 5.5, toTop: 0.2, toStop: 0.15, airControl: 0.35, overspeed: 1.05, turnTau: 0.12, turnMinSpeed: 0.15,
  jump: 4.6, gravity: 14.7, radius: 0.3, reach: 1.2,
} as const;

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

/** Walking, jumping, collision and the marker hunt. No rendering, no clocks. Movement is the Kit ground controller. */
export class WalkSim {
  readonly player: Player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: 0, grounded: true, prev: { x: 0, y: 0, z: 0, facing: 0 } };
  readonly state: WalkState = { tick: 0, collected: [], count: 0, finishTicks: null, paused: false };
  private events: WalkEvent[] = [];
  private readonly solids: Box[];
  private readonly moved: GroundStep = { jumped: false, landed: false };
  private readonly pushed: Vec2 = { x: 0, y: 0 };
  /** Trees, then the wall pieces and the car, then the round edge of the world. */
  private readonly collide = (q: PointXZ): void => {
    const L = this.layout, r = TUNE.radius;
    for (const t of L.trees) if (circleVsCircle(q.x, q.z, r, t.x, t.z, t.r, this.pushed)) { q.x = this.pushed.x; q.z = this.pushed.y; }
    for (const b of this.solids) pushCircleOutOfBox(q.x, q.z, r, b, q);
    const d = Math.hypot(q.x, q.z);
    if (d > L.bound) { q.x *= L.bound / d; q.z *= L.bound / d; }
  };

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
    const moved = stepGround(p, input, TUNE, DT, L.height, this.collide, this.moved);
    if (moved.jumped) this.events.push({ type: 'jump' });
    if (moved.landed) this.events.push({ type: 'land' });

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
