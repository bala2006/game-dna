import type { FlatState, ParameterValues } from '@gamedna/core';
import { aabbOverlap, createTileMove, moveAndCollideTiles, type Aabb } from '@gamedna/kit/collision';
import { createPlatformerBody, createPlatformerStep, platformerControl, platformerGravity, platformerSettle, type PlatformerParams } from '@gamedna/kit/controller';
import { FixedStepSimulation, flag, msToTicks, num, type InputFrame } from '@gamedna/starter';
import { COLS, ROWS, TILE, getLevel, parseLevel, type ParsedLevel } from './levels.js';
import tuning from './tuning.json';

export const PLAYER_W = 20;
export const PLAYER_H = 26;

/**
 * Gravity Shift rules as a deterministic fixed-step simulation. Movement and tile collision come from
 * the Kit platformer controller; gravity flips, hazards, keys and exits are this game's rules.
 * Protected rules (see .gamedna/project.json): MOVE-01, DEAD-01, RESET-01, WIN-01.
 */
export class GravityShiftSim extends FixedStepSimulation {
  level!: ParsedLevel;
  /** The player's box, velocity, gravity sign, jump timers and ground state. */
  readonly body = createPlatformerBody(0, 0, PLAYER_W, PLAYER_H);
  alive = true;
  won = false;
  deaths = 0;
  collected = new Set<string>();
  /** Instrumentation for DEAD-01: distance moved while dead. Must stay 0. */
  deadDrift = 0;
  private deadTicks = 0;
  private inExit = false;
  private levelId = 'level-1';
  private readonly move = createTileMove();
  private readonly info = createPlatformerStep();
  private readonly cell: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private readonly isSolid = (col: number, row: number): boolean => this.solidAt(col, row);

  constructor(values: ParameterValues = tuning as ParameterValues) {
    super(values);
    this.loadLevel('level-1');
  }

  get x(): number { return this.body.x; }
  set x(v: number) { this.body.x = v; }
  get y(): number { return this.body.y; }
  set y(v: number) { this.body.y = v; }
  get vx(): number { return this.body.vx; }
  set vx(v: number) { this.body.vx = v; }
  get vy(): number { return this.body.vy; }
  set vy(v: number) { this.body.vy = v; }
  get gravitySign(): 1 | -1 { return this.body.gravitySign; }
  set gravitySign(v: 1 | -1) { this.body.gravitySign = v; }
  get grounded(): boolean { return this.body.grounded; }
  set grounded(v: boolean) { this.body.grounded = v; }

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
    const s = this.level.spawn, b = this.body;
    b.x = s.col * TILE + (TILE - PLAYER_W) / 2;
    b.y = (s.row + 1) * TILE - PLAYER_H;
    b.vx = 0;
    b.vy = 0;
    b.gravitySign = 1;
    b.grounded = true;
    b.jumps = 0;
    b.coyote = 0;
    b.buffer = 0;
    this.alive = true;
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

  private touches(col: number, row: number, inset: number): boolean {
    const c = this.cell;
    c.x = col * TILE + inset;
    c.y = row * TILE + inset;
    c.w = c.h = TILE - inset * 2;
    return aabbOverlap(this.body, c);
  }

  /** Movement parameters derived from `params`, rebuilt only when `params` is replaced (on reset). */
  private movementCache: { from: ParameterValues | null; value: PlatformerParams | null } = { from: null, value: null };
  private movement(p: ParameterValues): PlatformerParams {
    if (this.movementCache.from === p && this.movementCache.value) return this.movementCache.value;
    this.movementCache.from = p;
    return (this.movementCache.value = {
      maxSpeed: num(p, 'movement.maxSpeed', 240),
      acceleration: num(p, 'movement.acceleration', 1800),
      deceleration: num(p, 'movement.deceleration', 2200),
      airControl: num(p, 'movement.airControl', 0.8),
      jumpVelocity: num(p, 'movement.jumpVelocity', 520),
      gravity: num(p, 'movement.gravity', 1500),
      maxFallSpeed: num(p, 'movement.maxFallSpeed', 720),
      coyoteTicks: msToTicks(num(p, 'movement.coyoteTimeMs', 80), this.tickRateHz),
      bufferTicks: Math.max(1, msToTicks(num(p, 'movement.jumpBufferMs', 100), this.tickRateHz)),
      jumpCut: num(p, 'movement.jumpCutMultiplier', 0.45),
    });
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

    const b = this.body;
    if (!this.alive) {
      // DEAD-01: no input is processed while dead. Drift is measured, not assumed.
      const bx = b.x;
      const by = b.y;
      this.deadTicks--;
      if (this.deadTicks <= 0) {
        this.restartLevel('respawn');
        return;
      }
      this.deadDrift += Math.abs(b.x - bx) + Math.abs(b.y - by);
      return;
    }

    const p = this.params;
    const m = this.movement(p);
    const faultCoyoteAfterJump = flag(p, 'fault.coyoteAfterJump');
    const dt = this.dt;
    const g = b.gravitySign;

    // Running, jump buffer, coyote jump and jump cut.
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const t = platformerControl(b, { move: dir, jumpPressed: input.wasPressed('jump'), jumpReleased: input.released.has('jump') }, m, dt, this.info);
    if (t.jumped) this.emit('jump', { extraAirJump: t.airJump, coyote: t.coyote, gravitySign: g });
    if (t.cut) this.emit('jumpCut', {});

    // Gravity reversal: only while standing on something. Leaving the ground this way grants no coyote time.
    if (input.wasPressed('flip') && b.grounded) {
      b.gravitySign = (g === 1 ? -1 : 1) as 1 | -1;
      b.grounded = false;
      b.vy = 0;
      b.coyote = 0;
      b.launched = true;
      this.emit('flip', { gravitySign: b.gravitySign });
    }

    platformerGravity(b, m, dt);
    const gs = b.gravitySign;

    // Axis-separated tile collision.
    const impact = Math.abs(b.vy);
    const hit = moveAndCollideTiles(b, b.vx * dt, b.vy * dt, this.isSolid, TILE, this.move);
    b.x = hit.x;
    b.y = hit.y;
    if (hit.left || hit.right) b.vx = 0;
    if (hit.top || hit.bottom) b.vy = 0;
    const landed = gs === 1 ? hit.bottom : hit.top;
    if (platformerSettle(b, landed, m)) this.emit('land', { impact: Math.round(impact) });
    // SEEDED FAULT (fault.coyoteAfterJump): coyote time also follows a jump, enabling a second midair jump.
    if (faultCoyoteAfterJump && b.wasGrounded && !landed && b.launched) b.coyote = m.coyoteTicks;

    // Hazards and bounds.
    const outOfBounds = b.y > ROWS * TILE || b.y + PLAYER_H < 0;
    const spiked = this.level.hazards.some((h) => this.touches(h.col, h.row, 6));
    if (outOfBounds || spiked) {
      this.alive = false;
      b.vx = 0;
      b.vy = 0;
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
    const b = this.body;
    return {
      tick: this.tick,
      'player.x': Math.round(b.x * 100) / 100,
      'player.y': Math.round(b.y * 100) / 100,
      'player.vx': Math.round(b.vx * 100) / 100,
      'player.vy': Math.round(b.vy * 100) / 100,
      'player.grounded': b.grounded,
      'player.alive': this.alive,
      'player.gravitySign': b.gravitySign,
      'player.jumpsSinceGround': b.jumps,
      'player.deadDrift': this.deadDrift,
      'player.atSpawn': Math.abs(b.x - this.spawnX) < 0.01 && Math.abs(b.y - this.spawnY) < 0.01,
      'level.id': this.levelId,
      'keys.collected': this.collected.size,
      'keys.total': this.level.keys.length,
      'game.won': this.won,
      'game.deaths': this.deaths,
    };
  }
}
