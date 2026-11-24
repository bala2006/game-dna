import type { FlatState, ParameterValues } from '@gamedna/core';
import { FixedStepSimulation, flag, msToTicks, num, type InputFrame } from '@gamedna/starter';
import tuning from './tuning.json';

export const ARENA_W = 960;
export const ARENA_H = 540;
export const WALL = 24;
export const PLAYER_R = 12;

export type EnemyKind = 'chaser' | 'drifter' | 'brute' | 'dummy';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  flashTicks: number;
  speed: number;
}

const ENEMY_STATS: Record<EnemyKind, { r: number; hp: number; speed: number; points: number }> = {
  chaser: { r: 11, hp: 1, speed: 120, points: 10 },
  drifter: { r: 9, hp: 1, speed: 160, points: 15 },
  brute: { r: 18, hp: 3, speed: 70, points: 40 },
  dummy: { r: 12, hp: 1, speed: 0, points: 10 },
};

export type RunState = 'playing' | 'gameOver' | 'victory';

/**
 * Neon Survivor rules as a deterministic fixed-step simulation.
 * Protected rules (see .gamedna/project.json): CD-01, SCORE-01, HP-01, RESET-01.
 */
export class NeonSurvivorSim extends FixedStepSimulation {
  x = ARENA_W / 2;
  y = ARENA_H / 2;
  vx = 0;
  vy = 0;
  facingX = 1;
  facingY = 0;
  health = 5;
  invulnTicks = 0;
  cooldownTicks = 0;
  hitstopTicks = 0;
  score = 0;
  kills = 0;
  wave = 1;
  state: RunState = 'playing';
  enemies: Enemy[] = [];
  /** Last attack, kept for rendering the pulse ring. */
  lastAttackTick = -1000;
  private nextEnemyId = 1;
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveDelay = 0;

  constructor(values: ParameterValues = tuning as ParameterValues) {
    super(values);
    this.startRun();
  }

  get maxHealth(): number {
    return Math.round(num(this.params, 'rules.playerMaxHealth', 5));
  }
  get totalWaves(): number {
    return Math.round(num(this.params, 'rules.waves', 5));
  }
  get arena(): string {
    return typeof this.setup['arena'] === 'string' ? (this.setup['arena'] as string) : 'waves';
  }

  protected onReset(): void {
    this.startRun();
  }

  /** RESET-01: a new run clears score, wave, health and every enemy. */
  private startRun(): void {
    this.x = ARENA_W / 2;
    this.y = ARENA_H / 2;
    this.vx = 0;
    this.vy = 0;
    this.facingX = 1;
    this.facingY = 0;
    this.health = this.maxHealth;
    this.invulnTicks = 0;
    this.cooldownTicks = 0;
    this.hitstopTicks = 0;
    this.score = 0;
    this.kills = 0;
    this.wave = 1;
    this.state = 'playing';
    this.enemies = [];
    this.nextEnemyId = 1;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveDelay = 0;
    this.lastAttackTick = -1000;
    const arena = this.arena;
    if (arena === 'lab-dummies') {
      const count = Math.round(Number(this.setup['dummies'] ?? 6));
      const hp = Math.round(Number(this.setup['dummyHp'] ?? 1));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        this.addEnemy('dummy', this.x + Math.cos(a) * 60, this.y + Math.sin(a) * 60, hp);
      }
    } else if (arena === 'lab-swarm') {
      const count = Math.round(Number(this.setup['swarm'] ?? 16));
      for (let i = 0; i < count; i++) this.spawnAtEdge('chaser');
    } else {
      this.queueWave(1);
    }
  }

  private addEnemy(kind: EnemyKind, x: number, y: number, hp?: number): Enemy {
    const s = ENEMY_STATS[kind];
    const speedScale = num(this.params, 'enemy.speedScale', 1);
    const e: Enemy = { id: this.nextEnemyId++, kind, x, y, vx: 0, vy: 0, r: s.r, hp: hp ?? s.hp, maxHp: hp ?? s.hp, alive: true, flashTicks: 0, speed: s.speed * speedScale };
    if (kind === 'drifter') {
      const a = this.rng.range(0, Math.PI * 2);
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    }
    this.enemies.push(e);
    return e;
  }

  private spawnAtEdge(kind: EnemyKind): void {
    // Seeded edge position at least 200 px from the player so spawns are never unfair.
    for (let attempt = 0; attempt < 12; attempt++) {
      const side = this.rng.int(0, 3);
      const x = side === 0 ? WALL + 20 : side === 1 ? ARENA_W - WALL - 20 : this.rng.range(WALL + 20, ARENA_W - WALL - 20);
      const y = side === 2 ? WALL + 20 : side === 3 ? ARENA_H - WALL - 20 : this.rng.range(WALL + 20, ARENA_H - WALL - 20);
      if (Math.hypot(x - this.x, y - this.y) >= 200 || attempt === 11) {
        this.addEnemy(kind, x, y);
        return;
      }
    }
  }

  private queueWave(n: number): void {
    const count = 3 + n * 2;
    const queue: EnemyKind[] = [];
    for (let i = 0; i < count; i++) {
      const roll = this.rng.next();
      queue.push(n >= 3 && roll < 0.2 ? 'brute' : n >= 2 && roll < 0.45 ? 'drifter' : 'chaser');
    }
    this.spawnQueue = queue;
    this.spawnTimer = 0;
    this.emit('waveStart', { wave: n, enemies: count });
  }

  protected update(input: InputFrame): void {
    if (input.wasPressed('restart')) {
      this.startRun();
      this.emit('runReset', {});
      return;
    }
    if (this.state !== 'playing') return;

    // Hit-stop freezes the world, including cooldowns, for a few ticks after a hit.
    if (this.hitstopTicks > 0) {
      this.hitstopTicks--;
      return;
    }

    const p = this.params;
    const dt = this.dt;
    const maxSpeed = num(p, 'movement.maxSpeed', 260);
    const accel = num(p, 'movement.acceleration', 2400);
    const decel = num(p, 'movement.deceleration', 2600);

    let dx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    let dy = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      this.facingX = dx;
      this.facingY = dy;
      this.vx = approachAxis(this.vx, dx * maxSpeed, accel * dt);
      this.vy = approachAxis(this.vy, dy * maxSpeed, accel * dt);
    } else {
      this.vx = approachAxis(this.vx, 0, decel * dt);
      this.vy = approachAxis(this.vy, 0, decel * dt);
    }
    this.x = clamp(this.x + this.vx * dt, WALL + PLAYER_R, ARENA_W - WALL - PLAYER_R);
    this.y = clamp(this.y + this.vy * dt, WALL + PLAYER_R, ARENA_H - WALL - PLAYER_R);

    // CD-01: the pulse attack fires at most once per cooldown, however often the key is pressed.
    if (this.cooldownTicks > 0) this.cooldownTicks--;
    if ((input.isDown('attack') || input.wasPressed('attack')) && this.cooldownTicks === 0) this.attack();

    this.updateEnemies(dt);
    this.updateWaves();
    if (this.invulnTicks > 0) this.invulnTicks--;
  }

  private attack(): void {
    const p = this.params;
    this.cooldownTicks = Math.max(1, msToTicks(num(p, 'attack.cooldownMs', 320), this.tickRateHz));
    this.lastAttackTick = this.tick;
    const radius = num(p, 'attack.radius', 84);
    const damage = Math.max(1, Math.round(num(p, 'attack.damage', 1)));
    this.emit('attack', { x: Math.round(this.x), y: Math.round(this.y), radius });
    let hits = 0;
    const duplicate = flag(p, 'fault.duplicateDamage');
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > radius + e.r) continue;
      const hitId = `${this.tick}:${e.id}`;
      this.applyDamage(e, damage, hitId);
      // SEEDED FAULT (fault.duplicateDamage): the damage event is delivered twice.
      if (duplicate) this.applyDamage(e, damage, hitId);
      hits++;
    }
    if (hits > 0) {
      const hitStopMs = num(p, 'feedback.hitStopMs', 40);
      const shakePx = num(p, 'feedback.shakePx', 4);
      const firstHit = `${this.tick}:${this.enemies.find((e) => Math.hypot(e.x - this.x, e.y - this.y) <= radius + e.r)?.id ?? 0}`;
      if (hitStopMs > 0) {
        this.hitstopTicks = msToTicks(hitStopMs, this.tickRateHz);
        this.emit('hitstop', { hitId: firstHit, ticks: this.hitstopTicks });
      }
      if (shakePx > 0) this.emit('shake', { hitId: firstHit, intensity: shakePx, hits });
    }
  }

  private applyDamage(e: Enemy, damage: number, hitId: string): void {
    const p = this.params;
    e.hp -= damage;
    this.emit('hit', { hitId, enemyId: e.id, damage, hpAfter: e.hp });
    const flashMs = num(p, 'feedback.flashMs', 80);
    if (flashMs > 0) {
      e.flashTicks = msToTicks(flashMs, this.tickRateHz);
      this.emit('flash', { hitId, enemyId: e.id, ticks: e.flashTicks });
    }
    const knockback = num(p, 'feedback.knockback', 260);
    if (knockback > 0 && e.kind !== 'dummy') {
      const d = Math.max(1, Math.hypot(e.x - this.x, e.y - this.y));
      e.vx += ((e.x - this.x) / d) * knockback;
      e.vy += ((e.y - this.y) / d) * knockback;
      this.emit('knockback', { hitId, enemyId: e.id, impulse: knockback });
    }
    // SCORE-01 guard: only a living enemy can be killed and scored. The fault switch removes the guard.
    const guard = !flag(p, 'fault.duplicateDamage');
    if (e.hp <= 0 && (e.alive || !guard)) {
      e.alive = false;
      const points = ENEMY_STATS[e.kind].points * this.wave;
      this.score += points;
      this.kills++;
      this.emit('enemyKilled', { enemyId: e.id, kind: e.kind });
      this.emit('score', { enemyId: e.id, points, total: this.score });
    }
  }

  private updateEnemies(dt: number): void {
    const invulnTicks = msToTicks(num(this.params, 'rules.invulnerabilityMs', 700), this.tickRateHz);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.flashTicks > 0) e.flashTicks--;
      if (e.kind === 'chaser' || e.kind === 'brute') {
        const d = Math.max(1, Math.hypot(this.x - e.x, this.y - e.y));
        const tx = ((this.x - e.x) / d) * e.speed;
        const ty = ((this.y - e.y) / d) * e.speed;
        e.vx += (tx - e.vx) * 0.06;
        e.vy += (ty - e.vy) * 0.06;
      } else if (e.kind === 'dummy') {
        e.vx = 0;
        e.vy = 0;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < WALL + e.r || e.x > ARENA_W - WALL - e.r) {
        e.vx = -e.vx;
        e.x = clamp(e.x, WALL + e.r, ARENA_W - WALL - e.r);
      }
      if (e.y < WALL + e.r || e.y > ARENA_H - WALL - e.r) {
        e.vy = -e.vy;
        e.y = clamp(e.y, WALL + e.r, ARENA_H - WALL - e.r);
      }
      if (e.kind !== 'dummy' && this.invulnTicks === 0 && Math.hypot(e.x - this.x, e.y - this.y) < e.r + PLAYER_R) {
        // HP-01: health is clamped at zero; it can never go negative.
        this.health = Math.max(0, this.health - 1);
        this.invulnTicks = invulnTicks;
        this.emit('playerHit', { health: this.health, enemyId: e.id });
        if (this.health === 0) {
          this.state = 'gameOver';
          this.emit('gameOver', { score: this.score, wave: this.wave });
          return;
        }
      }
    }
  }

  private updateWaves(): void {
    if (this.arena !== 'waves') return;
    if (this.spawnQueue.length > 0) {
      if (this.spawnTimer-- <= 0) {
        this.spawnAtEdge(this.spawnQueue.shift() as EnemyKind);
        this.spawnTimer = 24;
      }
      return;
    }
    if (this.enemies.some((e) => e.alive)) return;
    if (this.wave >= this.totalWaves) {
      this.state = 'victory';
      this.emit('victory', { score: this.score });
      return;
    }
    if (this.waveDelay === 0) this.waveDelay = 90;
    if (--this.waveDelay === 0) {
      this.wave++;
      this.enemies = [];
      this.queueWave(this.wave);
    }
  }

  snapshot(): FlatState {
    const alive = this.enemies.filter((e) => e.alive).length;
    return {
      tick: this.tick,
      'player.x': round2(this.x),
      'player.y': round2(this.y),
      'player.vx': round2(this.vx),
      'player.vy': round2(this.vy),
      'player.health': this.health,
      'player.invulnerable': this.invulnTicks > 0,
      'attack.cooldown': this.cooldownTicks,
      'world.hitstop': this.hitstopTicks,
      'wave.index': this.wave,
      'wave.pending': this.spawnQueue.length,
      'enemies.alive': alive,
      score: this.score,
      'game.kills': this.kills,
      'game.state': this.state,
    };
  }
}

function approachAxis(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
