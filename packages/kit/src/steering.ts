/**
 * Steering behaviors for 2D agents: seek, flee, arrive, pursue, evade, wander, separation and
 * obstacle avoidance, plus weighted combination and integration.
 *
 * Plane: everything works on `{ x, y }`. For a 3D ground plane (XZ), pass z as y and write the
 * result's y back to z. Units: positions in world units, velocities in units per second.
 * Each behavior returns a steering force, the change from the current velocity toward the desired
 * one, which `integrate` applies as an acceleration in units/s². Behaviors write into an optional
 * `out` vector so hot loops allocate nothing. Only `wander` uses randomness, from the Rng passed
 * in, so the same inputs and seed give the same forces.
 */
import type { Rng } from './random.js';

/** A 2D point or vector. */
export interface Vec2 { x: number; y: number }

/** A moving point: position and velocity. */
export interface Agent extends Vec2 { vx: number; vy: number }

/** A circular obstacle. */
export interface Circle extends Vec2 { r: number }

/** New vector. */
export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });

const set = (out: Vec2, x: number, y: number): Vec2 => { out.x = x; out.y = y; return out; };

/** Scales `v` in place so its length is at most `max`. */
export function truncate(v: Vec2, max: number): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len > max && len > 0 ? set(v, (v.x / len) * max, (v.y / len) * max) : v;
}

/**
 * Toward `target` at `maxSpeed`. Within `nearRadius` the desired speed falls linearly with distance
 * (distance is floored at `nearRadius`), which also avoids dividing by a tiny length.
 */
export function seek(a: Agent, target: Vec2, maxSpeed: number, out: Vec2 = vec2(), nearRadius = 0): Vec2 {
  const dx = target.x - a.x, dy = target.y - a.y, d = Math.max(nearRadius, Math.hypot(dx, dy));
  return d > 0 ? set(out, (dx / d) * maxSpeed - a.vx, (dy / d) * maxSpeed - a.vy) : set(out, -a.vx, -a.vy);
}

/** Away from `threat` at `maxSpeed` while it is closer than `panicRadius`; zero force otherwise. */
export function flee(a: Agent, threat: Vec2, maxSpeed: number, out: Vec2 = vec2(), panicRadius = Infinity): Vec2 {
  const dx = a.x - threat.x, dy = a.y - threat.y, d = Math.hypot(dx, dy);
  if (d >= panicRadius) return set(out, 0, 0);
  return d > 0 ? set(out, (dx / d) * maxSpeed - a.vx, (dy / d) * maxSpeed - a.vy) : set(out, maxSpeed - a.vx, -a.vy);
}

/** Like seek, but the desired speed falls linearly to 0 inside `slowRadius`, so the agent stops at the target. */
export function arrive(a: Agent, target: Vec2, maxSpeed: number, slowRadius: number, out: Vec2 = vec2()): Vec2 {
  const dx = target.x - a.x, dy = target.y - a.y, d = Math.hypot(dx, dy);
  if (d === 0) return set(out, -a.vx, -a.vy);
  const speed = slowRadius > 0 && d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  return set(out, (dx / d) * speed - a.vx, (dy / d) * speed - a.vy);
}

const predict = (a: Agent, t: Agent, maxSpeed: number, maxPrediction: number, out: Vec2): Vec2 => {
  const d = Math.hypot(t.x - a.x, t.y - a.y), time = Math.min(maxSpeed > 0 ? d / maxSpeed : 0, maxPrediction);
  return set(out, t.x + t.vx * time, t.y + t.vy * time);
};

/** Seeks where `target` will be after the time this agent needs to cover the current distance (capped at `maxPrediction` s). */
export function pursue(a: Agent, target: Agent, maxSpeed: number, out: Vec2 = vec2(), maxPrediction = Infinity): Vec2 {
  return seek(a, predict(a, target, maxSpeed, maxPrediction, out), maxSpeed, out);
}

/** Flees from where `threat` will be, predicted as in `pursue`. */
export function evade(a: Agent, threat: Agent, maxSpeed: number, out: Vec2 = vec2(), maxPrediction = Infinity, panicRadius = Infinity): Vec2 {
  const d = Math.hypot(threat.x - a.x, threat.y - a.y);
  if (d >= panicRadius) return set(out, 0, 0);
  return flee(a, predict(a, threat, maxSpeed, maxPrediction, out), maxSpeed, out);
}

/** Wander state: a point on a circle `distance` ahead of the agent, moved by up to `jitter` radians per call. */
export interface Wander { angle: number; radius: number; distance: number; jitter: number }

/** Wander state with a seeded starting angle. */
export function createWander(rng: Rng, { radius = 1, distance = 2, jitter = 0.3 }: { radius?: number; distance?: number; jitter?: number } = {}): Wander {
  return { angle: rng.range(-Math.PI, Math.PI), radius, distance, jitter };
}

/** Meandering motion. Call once per tick: draws one number from `rng` and updates `w.angle`. */
export function wander(a: Agent, w: Wander, rng: Rng, maxSpeed: number, out: Vec2 = vec2()): Vec2 {
  w.angle += rng.range(-w.jitter, w.jitter);
  const heading = a.vx === 0 && a.vy === 0 ? 0 : Math.atan2(a.vy, a.vx), dir = heading + w.angle;
  const tx = a.x + Math.cos(heading) * w.distance + Math.cos(dir) * w.radius;
  const ty = a.y + Math.sin(heading) * w.distance + Math.sin(dir) * w.radius;
  return seek(a, set(out, tx, ty), maxSpeed, out);
}

/**
 * Push away from neighbors closer than `radius`, each weighted by closeness (1 at contact, 0 at
 * `radius`), scaled to units/s by `maxSpeed`. Skips `a` itself and neighbors at the same point.
 */
export function separation(a: Agent, neighbors: readonly Vec2[], radius: number, maxSpeed: number, out: Vec2 = vec2()): Vec2 {
  let px = 0, py = 0;
  for (const n of neighbors) {
    if (n === a) continue;
    const dx = a.x - n.x, dy = a.y - n.y, d = Math.hypot(dx, dy);
    if (d === 0 || d >= radius) continue;
    const w = 1 - d / radius;
    px += (dx / d) * w;
    py += (dy / d) * w;
  }
  return set(out, px * maxSpeed, py * maxSpeed);
}

/**
 * Push away from circles the agent (radius `agentRadius`) touches or would hit within `lookahead`
 * units along its velocity. Inside a circle's reach it pushes straight out at `maxSpeed`; otherwise
 * it pushes sideways from the nearest circle ahead, harder the deeper the overlap and the closer
 * the circle. Zero when clear. For an obstacle dead ahead it swerves toward (-vy, vx): the agent's
 * right on Phaser's y-down screen and on the Kit's 3D ground plane (z passed as y, +Y up), its left
 * only in a y-up 2D frame.
 */
export function avoidObstacles(a: Agent, obstacles: readonly Circle[], agentRadius: number, lookahead: number, maxSpeed: number, out: Vec2 = vec2()): Vec2 {
  const speed = Math.hypot(a.vx, a.vy), hx = speed > 0 ? a.vx / speed : 0, hy = speed > 0 ? a.vy / speed : 0;
  let bestAlong = Infinity, bestLateral = 0, bestReach = 1, px = 0, py = 0;
  for (const o of obstacles) {
    const ox = o.x - a.x, oy = o.y - a.y, reach = o.r + agentRadius, d = Math.hypot(ox, oy);
    if (d < reach) {
      if (d > 0) { px -= (ox / d) * maxSpeed; py -= (oy / d) * maxSpeed; }
      continue;
    }
    if (speed === 0) continue;
    const along = ox * hx + oy * hy, lateral = oy * hx - ox * hy;
    if (along <= 0 || along > lookahead + reach || Math.abs(lateral) >= reach || along >= bestAlong) continue;
    bestAlong = along;
    bestLateral = lateral;
    bestReach = reach;
  }
  if (px !== 0 || py !== 0) return truncate(set(out, px, py), maxSpeed);
  if (bestAlong === Infinity) return set(out, 0, 0);
  const urgency = 1 - Math.max(0, bestAlong - bestReach) / (lookahead || 1);
  const push = maxSpeed * ((bestReach - Math.abs(bestLateral)) / bestReach) * (1 + urgency), side = bestLateral > 0 ? -1 : 1;
  return set(out, -hy * push * side, hx * push * side);
}

/** Weighted sum of `[force, weight]` pairs, truncated to `maxForce`. */
export function combine(parts: readonly (readonly [Vec2, number])[], maxForce: number, out: Vec2 = vec2()): Vec2 {
  let x = 0, y = 0;
  for (const [f, w] of parts) { x += f.x * w; y += f.y * w; }
  return truncate(set(out, x, y), maxForce);
}

/** Semi-implicit Euler: applies `force` as acceleration for `dt` seconds, caps speed at `maxSpeed`, then moves. */
export function integrate<A extends Agent>(a: A, force: Vec2, maxSpeed: number, dt: number): A {
  a.vx += force.x * dt;
  a.vy += force.y * dt;
  const speed = Math.hypot(a.vx, a.vy);
  if (speed > maxSpeed && speed > 0) { a.vx = (a.vx / speed) * maxSpeed; a.vy = (a.vy / speed) * maxSpeed; }
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  return a;
}
