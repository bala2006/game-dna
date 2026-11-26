import { clamp, wrapAngle } from '@gamedna/kit/random';
import type { GroundPoint } from '@gamedna/kit/world';
import { ROAD, type Track } from './track.js';
import { stepSeconds } from '@gamedna/kit/contracts';
import { CONTRACTS } from './contracts.js';

/** Fixed timestep in seconds, from the simulation contract. */
export const DT = stepSeconds(CONTRACTS);
export const LAPS = 3;
export const COUNTDOWN_TICKS = 180;
export const TUNE = {
  top: 52, accel: 14, brake: 38, coast: 4, reverseAccel: 10, reverseTop: 9, offTop: 20,
  steerRate: 7, yaw: 2.1, gripKeep: 0.32, driftKeep: 0.93, maxWheel: 0.42,
} as const;

/** One tick of driver input. `steer` is -1 to 1, positive to the left. */
export interface Controls { steer: number; throttle: number; brake: number; drift: boolean }
const IDLE: Controls = { steer: 0, throttle: 0, brake: 0, drift: false };

export type RaceEvent = { type: 'notice'; text: string } | { type: 'hit'; power: number } | { type: 'finish' };
export type Phase = 'countdown' | 'racing' | 'finished';

export interface CarState {
  x: number; z: number; h: number;
  vx: number; vz: number;
  /** Forward speed, m/s. */
  vf: number;
  accel: number; latAccel: number; steer: number;
  /** Lateral speed, m/s: smoke and skid marks start above about 3. */
  slip: number;
  offroad: boolean; braking: boolean;
  prev: { x: number; z: number; h: number };
}

export interface RaceState {
  phase: Phase;
  tick: number;
  phaseTick: number;
  lap: number;
  lapStart: number;
  laps: number[];
  best: number | null;
  /** Nearest track point. */
  idx: number;
  /** Checkpoints passed this lap, in order: 0, 1 or 2. */
  cp: number;
  paused: boolean;
}

/** The race rules: car handling, barriers, checkpoints, laps, countdown and pause. No rendering, no clocks. */
export class RaceSim {
  readonly car: CarState = { x: 0, z: 0, h: 0, vx: 0, vz: 0, vf: 0, accel: 0, latAccel: 0, steer: 0, slip: 0, offroad: false, braking: false, prev: { x: 0, z: 0, h: 0 } };
  readonly race: RaceState = { phase: 'countdown', tick: 0, phaseTick: 0, lap: 1, lapStart: 0, laps: [], best: null, idx: 0, cp: 0, paused: false };
  private events: RaceEvent[] = [];

  constructor(readonly track: Track) {
    this.reset();
  }

  private point(i: number): GroundPoint {
    return this.track.points[(i + this.track.count) % this.track.count] as GroundPoint;
  }

  reset(): void {
    const s = this.track.start, p = this.point(s), t = this.track.frames.tangents[s] as GroundPoint;
    Object.assign(this.car, { x: p.x, z: p.z, h: Math.atan2(t.x, t.z), vx: 0, vz: 0, vf: 0, accel: 0, latAccel: 0, steer: 0, slip: 0, offroad: false, braking: false });
    this.car.prev = { x: this.car.x, z: this.car.z, h: this.car.h };
    Object.assign(this.race, { phase: 'countdown', tick: 0, phaseTick: 0, lap: 1, lapStart: 0, laps: [], best: null, idx: s, cp: 0, paused: false });
    this.events = [];
  }

  /** Pausing is not allowed once the race is finished. */
  togglePause(): void {
    if (this.race.phase !== 'finished') this.race.paused = !this.race.paused;
  }

  pause(): void {
    if (this.race.phase === 'racing') this.race.paused = true;
  }

  step(controls: Controls): void {
    if (this.race.paused) return;
    const prevIdx = this.stepCar(this.race.phase === 'racing' ? controls : IDLE);
    this.stepRace(prevIdx);
  }

  drainEvents(): RaceEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private stepCar(c: Controls): number {
    const car = this.car, race = this.race, S = this.track.count;
    car.prev = { x: car.x, z: car.z, h: car.h };
    const vfPrev = car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h);
    car.steer += (c.steer - car.steer) * Math.min(1, TUNE.steerRate * DT);
    const sp = Math.abs(vfPrev);
    car.h += car.steer * TUNE.yaw * Math.min(1, sp / 8) * (1 - 0.5 * Math.min(1, sp / TUNE.top)) * (c.drift ? 1.45 : 1) * (vfPrev < 0 ? -1 : 1) * DT;
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    let vf = car.vx * fx + car.vz * fz;
    let lx = car.vx - fx * vf, lz = car.vz - fz * vf;
    vf += c.throttle * TUNE.accel * DT * (vf < 0 ? 2.5 : 1) * (1 - 0.35 * Math.min(1, Math.max(0, vf) / TUNE.top));
    vf -= c.brake * (vf > 0 ? TUNE.brake : TUNE.reverseAccel) * DT;
    if (c.throttle < 0.05 && c.brake < 0.05) vf -= Math.sign(vf) * Math.min(Math.abs(vf), TUNE.coast * DT);
    const top = car.offroad ? TUNE.offTop : TUNE.top;
    if (vf > top) vf -= (vf - top) * 2.2 * DT;
    vf = clamp(vf, -TUNE.reverseTop, TUNE.top);
    const keep = c.drift ? TUNE.driftKeep : TUNE.gripKeep + 0.25 * Math.min(1, Math.abs(vf) / TUNE.top);
    const k = Math.pow(keep, DT * 60);
    lx *= k;
    lz *= k;
    car.vx = fx * vf + lx;
    car.vz = fz * vf + lz;
    car.x += car.vx * DT;
    car.z += car.vz * DT;
    car.slip = Math.hypot(lx, lz);
    car.accel = (vf - vfPrev) / DT;
    car.latAccel = car.steer * TUNE.yaw * Math.min(1, Math.abs(vf) / 8) * vf * 0.9;
    car.vf = vf;
    car.braking = c.brake > 0.2 && vf > 1;

    let best = Infinity, bi = race.idx;
    const consider = (i: number) => { const p = this.point(i), d = (p.x - car.x) ** 2 + (p.z - car.z) ** 2; if (d < best) { best = d; bi = (i + S) % S; } };
    for (let o = -30; o <= 30; o++) consider(race.idx + o);
    if (best > 40 * 40) for (let i = 0; i < S; i++) consider(i);
    const prevIdx = race.idx;
    race.idx = bi;
    const p = this.point(bi), t = this.track.frames.tangents[bi] as GroundPoint, nx = -t.z, nz = t.x;
    const off = (car.x - p.x) * nx + (car.z - p.z) * nz, lim = ROAD.rail - 1.15;
    if (Math.abs(off) > lim) {
      const sgn = Math.sign(off), push = off - sgn * lim;
      car.x -= nx * push;
      car.z -= nz * push;
      const vn = car.vx * nx + car.vz * nz;
      if (vn * sgn > 0) {
        car.vx -= nx * vn * 1.3;
        car.vz -= nz * vn * 1.3;
        car.vx *= 0.95;
        car.vz *= 0.95;
        if (Math.abs(vn) > 2) this.events.push({ type: 'hit', power: Math.min(1, Math.abs(vn) / 18) });
      }
    }
    car.offroad = Math.abs(off) > ROAD.width / 2 + ROAD.curb;
    return prevIdx;
  }

  private stepRace(prevIdx: number): void {
    const race = this.race, S = this.track.count;
    race.tick++;
    race.phaseTick++;
    if (race.phase === 'countdown') {
      if (race.phaseTick % 60 === 1 && race.phaseTick < COUNTDOWN_TICKS) this.events.push({ type: 'notice', text: String(3 - Math.floor(race.phaseTick / 60)) });
      if (race.phaseTick >= COUNTDOWN_TICKS) {
        race.phase = 'racing';
        race.phaseTick = 0;
        race.lapStart = race.tick;
        this.events.push({ type: 'notice', text: 'GO' });
      }
      return;
    }
    if (race.phase !== 'racing') return;
    if (race.cp === 0 && race.idx > S / 3 && race.idx < S / 3 + 60) race.cp = 1;
    if (race.cp === 1 && race.idx > (2 * S) / 3 && race.idx < (2 * S) / 3 + 60) race.cp = 2;
    if (race.cp === 2 && prevIdx > S * 0.9 && race.idx < S * 0.1) {
      const lapTicks = race.tick - race.lapStart;
      const improved = race.best !== null && lapTicks < race.best;
      race.best = race.best === null ? lapTicks : Math.min(race.best, lapTicks);
      race.laps.push(lapTicks);
      race.cp = 0;
      race.lapStart = race.tick;
      if (race.laps.length >= LAPS) {
        race.phase = 'finished';
        race.phaseTick = 0;
        this.events.push({ type: 'finish' });
      } else {
        race.lap++;
        this.events.push({ type: 'notice', text: improved ? 'BEST LAP' : `LAP ${race.lap}/${LAPS}` });
      }
    }
  }
}

/** A driver that aims 16 points ahead and lifts in sharp corners. Behind `?auto=1` and in tests. */
export function autoControls(sim: RaceSim): Controls {
  const { car, race, track } = sim;
  const ahead = track.points[(race.idx + 16) % track.count] as GroundPoint;
  const d = wrapAngle(Math.atan2(ahead.x - car.x, ahead.z - car.z) - car.h);
  return { steer: clamp(d * 6, -1, 1), throttle: Math.abs(d) < 0.35 || car.vf < 30 ? 1 : 0, brake: 0, drift: false };
}

/** Gear and engine speed (0-1) from road speed, for the HUD and engine sound. */
export function drivetrain(speed: number): { gear: string; rpm: number } {
  const r = Math.min(0.999, Math.max(0, speed) / TUNE.top) * 6, frac = r - Math.floor(r);
  return { gear: speed < 0.5 ? 'N' : String(Math.floor(r) + 1), rpm: speed < 0.5 ? 0.12 : 0.3 + 0.7 * frac };
}

/** m:ss.mmm from ticks; "-" for none. */
export function formatTicks(ticks: number | null | undefined): string {
  if (ticks === null || ticks === undefined) return '-';
  const ms = Math.round((ticks / 60) * 1000), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
