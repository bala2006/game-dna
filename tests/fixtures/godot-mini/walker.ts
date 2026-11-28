import type { FlatState, GameHarness, ParameterValues, Primitive, RawEvent } from '@gamedna/core';
import tuning from './tuning.json';

const DEFAULT_SPEED = 3;
const DEFAULT_JUMP = 6;
const COIN_SPACING = 50;

/** TypeScript twin of walker.gd with the same integer rules, so a local run can be compared with a Godot run. */
export class Walker implements GameHarness {
  readonly tickRateHz = 60;
  private readonly baseline: ParameterValues;
  private speed = DEFAULT_SPEED;
  private jump = DEFAULT_JUMP;
  private x = 0;
  private y = 0;
  private vy = 0;
  private grounded = true;
  private coins = 0;
  private nextCoin = COIN_SPACING;
  private tick = 0;
  private right = false;
  private jumpHeld = false;
  private jumpWasHeld = false;
  private events: RawEvent[] = [];

  constructor(baseline: ParameterValues = tuning) {
    this.baseline = baseline;
    this.reset(0, {}, {});
  }

  reset(seed: number, params: ParameterValues, _setup: Record<string, Primitive>): void {
    this.speed = Math.trunc(Number(params['walker.speed'] ?? this.baseline['walker.speed'] ?? DEFAULT_SPEED));
    this.jump = Math.trunc(Number(params['walker.jump'] ?? this.baseline['walker.jump'] ?? DEFAULT_JUMP));
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.coins = 0;
    this.nextCoin = COIN_SPACING + (seed % 17);
    this.tick = 0;
    this.right = false;
    this.jumpHeld = false;
    this.jumpWasHeld = false;
    this.events = [];
  }

  setInput(key: string, down: boolean): void {
    if (key === 'right') this.right = down;
    else if (key === 'jump') this.jumpHeld = down;
  }

  step(): void {
    const pressed = this.jumpHeld && !this.jumpWasHeld;
    this.jumpWasHeld = this.jumpHeld;
    if (pressed && this.grounded) {
      this.vy = this.jump;
      this.events.push({ type: 'jump', data: {} });
    }
    if (this.right) {
      this.x += this.speed;
      while (this.x >= this.nextCoin) {
        this.coins += 1;
        this.nextCoin += COIN_SPACING;
        this.events.push({ type: 'coin', data: { n: this.coins } });
      }
    }
    this.y += this.vy;
    this.vy -= 1;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      if (!this.grounded) this.events.push({ type: 'land', data: {} });
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.tick += 1;
  }

  snapshot(): FlatState {
    return { 'player.x': this.x, 'player.y': this.y, 'player.grounded': this.grounded, coins: this.coins, tick: this.tick };
  }

  drainEvents(): RawEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  currentTick(): number {
    return this.tick;
  }

  parameters(): ParameterValues {
    return { 'walker.speed': this.speed, 'walker.jump': this.jump };
  }
}
