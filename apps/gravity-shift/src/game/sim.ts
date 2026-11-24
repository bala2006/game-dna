import type { FlatState, ParameterValues } from '@gamedna/core';
import { FixedStepSimulation, flag, msToTicks, num, type InputFrame } from '@gamedna/starter';
import { COLS, ROWS, TILE, getLevel, parseLevel, type ParsedLevel } from './levels.js';
import tuning from './tuning.json';

export const PLAYER_W = 20;
export const PLAYER_H = 26;

const approach = (v: number, target: number, delta: number): number => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));

/**
 * Gravity Shift rules as a deterministic fixed-step simulation.
 * Protected rules (see .gamedna/project.json): MOVE-01, DEAD-01, RESET-01, WIN-01.
 */
export class GravityShiftSim extends FixedStepSimulation {
  level!: ParsedLevel;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  gravitySign: 1 | -1 = 1;
  grounded = false;
  alive = true;
  won = false;
  deaths = 0;
  collected = new Set<string>();
  /** Instrumentation for DEAD-01: distance moved while dead. Must stay 0. */
  deadDrift = 0;
  private jumpsSinceGround = 0;
  private coyoteTicks = 0;
  private bufferTicks = 0;
  private deadTicks = 0;
  private inExit = false;
  private levelId = 'level-1';

  constructor(values: ParameterValues = tuning as ParameterValues) {
    super(values);
    this.loadLevel('level-1');
  }

  protected onReset(): void {
    const requested = typeof this.setup['level'] === 'string' ? (this.setup['level'] as string) : 'level-1';
    this.deaths = 0;
    this.won = false;
    this.loadLevel(requested);
  }

  private loadLevel(id: string): void {
    this.levelId = getLevel(id).id;
    this.level = parseLevel(getLevel(id));
    this.collected = new Set();
    this.respawn();
  }

  private respawn(): void {
    const s = this.level.spawn;
    this.x = s.col * TILE + (TILE - PLAYER_W) / 2;
    this.y = (s.row + 1) * TILE - PLAYER_H;
    this.vx = 0;
    this.vy = 0;
    this.gravitySign = 1;
    this.grounded = true;
    this.alive = true;
    this.jumpsSinceGround = 0;
    this.coyoteTicks = 0;
    this.bufferTicks = 0;
    this.deadTicks = 0;
    this.inExit = false;
    this.deadDrift = 0;
  }

  /** Restart rule RESET-01: the current level returns to its initial state. */
  private restartLevel(reason: 'restart' | 'respawn'): void {
    this.collected = new Set();
    this.respawn();
    this.emit('levelReset', { reason, level: this.levelId });
  }

  get spawnX(): number {
    return this.level.spawn.col * TILE + (TILE - PLAYER_W) / 2;
  }
  get spawnY(): number {
    return (this.level.spawn.row + 1) * TILE - PLAYER_H;
  }

  private solidAt(col: number, row: number): boolean {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    return this.level.solid[row]?.[col] ?? true;
  }

  private overlapsSolid(x: number, y: number): boolean {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + PLAYER_W - 0.001) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + PLAYER_H - 0.001) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.solidAt(c, r)) return true;
    return false;
  }

  private touches(col: number, row: number, inset: number): boolean {
    const tx = col * TILE + inset;
    const ty = row * TILE + inset;
    const s = TILE - inset * 2;
    return this.x < tx + s && this.x + PLAYER_W > tx && this.y < ty + s && this.y + PLAYER_H > ty;
  }

  protected update(input: InputFrame): void {
    if (input.wasPressed('restart')) {
      if (this.won) {
        this.won = false;
        this.loadLevel(this.level.def.lab ? this.levelId : 'level-1');
        this.emit('levelReset', { reason: 'restart', level: this.levelId });
      } else {
        this.restartLevel('restart');
      }
      return;
    }
    if (this.won) return;

    if (!this.alive) {
      // DEAD-01: no input is processed while dead. Drift is measured, not assumed.
      const bx = this.x;
      const by = this.y;
      this.deadTicks--;
      if (this.deadTicks <= 0) {
        this.restartLevel('respawn');
        return;
      }
      this.deadDrift += Math.abs(this.x - bx) + Math.abs(this.y - by);
      return;
    }

    const p = this.params;
    const maxSpeed = num(p, 'movement.maxSpeed', 240);
    const accel = num(p, 'movement.acceleration', 1800);
    const decel = num(p, 'movement.deceleration', 2200);
    const airControl = num(p, 'movement.airControl', 0.8);
    const jumpVelocity = num(p, 'movement.jumpVelocity', 520);
    const gravity = num(p, 'movement.gravity', 1500);
    const maxFall = num(p, 'movement.maxFallSpeed', 720);
    const coyoteTicks = msToTicks(num(p, 'movement.coyoteTimeMs', 80), this.tickRateHz);
    const bufferTicks = Math.max(1, msToTicks(num(p, 'movement.jumpBufferMs', 100), this.tickRateHz));
    const jumpCut = num(p, 'movement.jumpCutMultiplier', 0.45);
    const faultCoyoteAfterJump = flag(p, 'fault.coyoteAfterJump');
    const dt = this.dt;
    const g = this.gravitySign;
    const wasGrounded = this.grounded;

    // Horizontal movement.
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const control = this.grounded ? 1 : airControl;
    if (dir !== 0) {
      const turning = this.vx !== 0 && Math.sign(this.vx) !== dir;
      this.vx = approach(this.vx, dir * maxSpeed, (turning ? Math.max(accel, decel) : accel) * control * dt);
    } else {
      this.vx = approach(this.vx, 0, decel * control * dt);
    }

    // Jump buffering and coyote time.
    if (input.wasPressed('jump')) this.bufferTicks = bufferTicks;
    let leftGroundByAction = false;
    if (this.bufferTicks > 0 && (this.grounded || this.coyoteTicks > 0)) {
      this.emit('jump', {
        extraAirJump: this.jumpsSinceGround >= 1,
        coyote: !this.grounded,
        gravitySign: g,
      });
      this.vy = -g * jumpVelocity;
      this.jumpsSinceGround++;
      this.bufferTicks = 0;
      this.coyoteTicks = 0;
      this.grounded = false;
      leftGroundByAction = true;
    }
    if (input.released.has('jump') && this.vy * g < 0) {
      this.vy *= jumpCut;
      this.emit('jumpCut', {});
    }

    // Gravity reversal: only while standing on something.
    if (input.wasPressed('flip') && this.grounded) {
      this.gravitySign = (g === 1 ? -1 : 1) as 1 | -1;
      this.grounded = false;
      this.vy = 0;
      this.coyoteTicks = 0;
      leftGroundByAction = true;
      this.emit('flip', { gravitySign: this.gravitySign });
    }

    const gs = this.gravitySign;
    this.vy += gs * gravity * dt;
    if (this.vy * gs > maxFall) this.vy = gs * maxFall;

    // Axis-separated tile collision.
    this.x += this.vx * dt;
    if (this.overlapsSolid(this.x, this.y)) {
      if (this.vx > 0) this.x = Math.floor((this.x + PLAYER_W) / TILE) * TILE - PLAYER_W;
      else if (this.vx < 0) this.x = (Math.floor(this.x / TILE) + 1) * TILE;
      this.vx = 0;
    }
    const impact = Math.abs(this.vy);
    this.y += this.vy * dt;
    let landed = false;
    if (this.overlapsSolid(this.x, this.y)) {
      if (this.vy > 0) {
        this.y = Math.floor((this.y + PLAYER_H) / TILE) * TILE - PLAYER_H;
        landed = gs === 1;
      } else if (this.vy < 0) {
        this.y = (Math.floor(this.y / TILE) + 1) * TILE;
        landed = gs === -1;
      }
      this.vy = 0;
    }
    this.grounded = landed;
    if (landed) {
      this.jumpsSinceGround = 0;
      this.coyoteTicks = 0;
      if (!wasGrounded) this.emit('land', { impact: Math.round(impact) });
    } else if (wasGrounded && (!leftGroundByAction || faultCoyoteAfterJump)) {
      // Walked off a ledge: grant coyote time.
      // SEEDED FAULT (fault.coyoteAfterJump): also granted after a jump, enabling a second midair jump.
      this.coyoteTicks = coyoteTicks;
    } else if (this.coyoteTicks > 0) {
      this.coyoteTicks--;
    }
    if (this.bufferTicks > 0) this.bufferTicks--;

    // Hazards and bounds.
    const outOfBounds = this.y > ROWS * TILE || this.y + PLAYER_H < 0;
    const spiked = this.level.hazards.some((h) => this.touches(h.col, h.row, 6));
    if (outOfBounds || spiked) {
      this.alive = false;
      this.vx = 0;
      this.vy = 0;
      this.deaths++;
      this.deadTicks = Math.max(1, msToTicks(num(p, 'rules.respawnDelayMs', 600), this.tickRateHz));
      this.emit('death', { cause: spiked ? 'spikes' : 'fell' });
      return;
    }

    for (const k of this.level.keys) {
      if (!this.collected.has(k.id) && this.touches(k.col, k.row, 6)) {
        this.collected.add(k.id);
        this.emit('keyCollected', { keyId: k.id, keys: this.collected.size, total: this.level.keys.length });
      }
    }

    // WIN-01: the exit only completes the level when every key is held.
    const atExit = this.level.exits.some((e) => this.touches(e.col, e.row, 8));
    if (atExit && !this.inExit) {
      if (this.collected.size >= this.level.keys.length) {
        this.emit('levelComplete', { level: this.levelId, tick: this.tick });
        const next = this.level.def.next;
        if (next) {
          this.loadLevel(next);
        } else {
          this.won = true;
          this.emit('win', { deaths: this.deaths });
        }
        return;
      }
      this.emit('exitLocked', { keys: this.collected.size, total: this.level.keys.length });
    }
    this.inExit = atExit;
  }

  snapshot(): FlatState {
    return {
      tick: this.tick,
      'player.x': Math.round(this.x * 100) / 100,
      'player.y': Math.round(this.y * 100) / 100,
      'player.vx': Math.round(this.vx * 100) / 100,
      'player.vy': Math.round(this.vy * 100) / 100,
      'player.grounded': this.grounded,
      'player.alive': this.alive,
      'player.gravitySign': this.gravitySign,
      'player.jumpsSinceGround': this.jumpsSinceGround,
      'player.deadDrift': this.deadDrift,
      'player.atSpawn': Math.abs(this.x - this.spawnX) < 0.01 && Math.abs(this.y - this.spawnY) < 0.01,
      'level.id': this.levelId,
      'keys.collected': this.collected.size,
      'keys.total': this.level.keys.length,
      'game.won': this.won,
      'game.deaths': this.deaths,
    };
  }
}
