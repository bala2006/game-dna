import Phaser from 'phaser';
import type { ParameterValues, RawEvent } from '@gamedna/core';
import { SimScene, shake } from '@gamedna/starter/phaser';
import { num } from '@gamedna/starter';
import { ARENA_H, ARENA_W, NeonSurvivorSim, WALL, type EnemyKind } from './sim.js';
import tuning from './tuning.json';

const CYAN = 0x22e6ff;
const LIME = 0xb6ff3b;
const WHITE = '#f4f7ff';
const SOUNDS = ['pulse', 'hit', 'explosion', 'death', 'win', 'ui'] as const;
const ENEMY_TEXTURE: Record<EnemyKind, string> = { chaser: 'enemy-chaser', drifter: 'enemy-drifter', brute: 'enemy-brute', dummy: 'enemy-chaser' };

/** Neon-arcade presentation of the Neon Survivor simulation. */
export class NeonScene extends SimScene<NeonSurvivorSim> {
  protected readonly gameId = 'neon-survivor';
  private player!: Phaser.GameObjects.Image;
  private pulse!: Phaser.GameObjects.Arc;
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private hearts: Phaser.GameObjects.Image[] = [];
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayBody!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('neon');
  }

  preload(): void {
    this.load.setPath('assets/generated/');
    this.load.svg('background', 'background.svg', { width: 960, height: 540 });
    this.load.svg('player', 'player.svg', { width: 32, height: 32 });
    this.load.svg('enemy-chaser', 'enemy-chaser.svg', { width: 28, height: 28 });
    this.load.svg('enemy-drifter', 'enemy-drifter.svg', { width: 22, height: 22 });
    this.load.svg('enemy-brute', 'enemy-brute.svg', { width: 42, height: 42 });
    this.load.svg('heart', 'heart.svg', { width: 20, height: 20 });
    for (const s of SOUNDS) this.load.audio(`sfx-${s}`, `sfx-${s}.wav`);
  }

  create(): void {
    this.initComfort();
    this.sound.mute = this.settings.muted;
    this.sim = new NeonSurvivorSim();
    this.sim.reset(1, tuning as ParameterValues, {});

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    g.generateTexture('spark', 4, 4);
    g.destroy();

    this.add.image(0, 0, 'background').setOrigin(0, 0);
    const frame = this.add.graphics();
    frame.lineStyle(2, CYAN, 0.6).strokeRect(WALL, WALL, ARENA_W - WALL * 2, ARENA_H - WALL * 2);
    this.pulse = this.add.circle(0, 0, 10, CYAN, 0).setStrokeStyle(3, CYAN, 1).setVisible(false);
    this.player = this.add.image(0, 0, 'player').setScale(1.25);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 320 },
      lifespan: { min: 180, max: 420 },
      scale: { start: 1, end: 0 },
      tint: [0x22e6ff, 0xff2bd6, 0xf4f7ff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });

    const font = { fontFamily: '"Arial Black", system-ui, sans-serif', color: WHITE };
    this.hud = this.add.text(ARENA_W - WALL - 8, 4, '', { ...font, fontSize: '15px' }).setOrigin(1, 0);
    for (let i = 0; i < 10; i++) this.hearts.push(this.add.image(WALL + 12 + i * 22, 13, 'heart').setVisible(false));
    this.banner = this.add.text(480, 110, '', { ...font, fontSize: '28px', color: '#b6ff3b' }).setOrigin(0.5).setAlpha(0);

    const shade = this.add.rectangle(0, 0, 960, 540, 0x0a0612, 0.86).setOrigin(0, 0);
    this.overlayTitle = this.add.text(480, 190, 'NEON SURVIVOR', { ...font, fontSize: '56px', color: '#22e6ff' }).setOrigin(0.5);
    this.overlayBody = this.add.text(480, 330, '', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: WHITE, align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [shade, this.overlayTitle, this.overlayBody]);

    this.bindKeys({ left: ['LEFT', 'A'], right: ['RIGHT', 'D'], up: ['UP', 'W'], down: ['DOWN', 'S'], attack: ['SPACE', 'J'], restart: ['R'] });
    const kb = this.input.keyboard;
    kb?.on('keydown-ENTER', () => {
      if (this.uiMode === 'title') {
        this.uiMode = 'playing';
        this.play('ui');
      }
    });
    const togglePause = () => {
      if (this.uiMode === 'playing') this.uiMode = 'paused';
      else if (this.uiMode === 'paused') this.uiMode = 'playing';
    };
    kb?.on('keydown-P', togglePause);
    kb?.on('keydown-ESC', togglePause);
    kb?.on('keydown-M', () => this.toggleSetting('muted'));
    kb?.on('keydown-V', () => {
      this.toggleSetting('reducedMotion');
      this.showBanner(this.settings.reducedMotion ? 'REDUCED MOTION ON' : 'REDUCED MOTION OFF');
    });
  }

  refresh(): void {
    for (const s of this.enemySprites.values()) s.destroy();
    this.enemySprites.clear();
  }

  private play(name: (typeof SOUNDS)[number]): void {
    if (this.settings.muted) return;
    if (this.cache.audio.exists(`sfx-${name}`)) this.sound.play(`sfx-${name}`, { volume: 0.4 });
  }

  private showBanner(text: string): void {
    this.banner.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 900, duration: 400 });
  }

  protected onSimEvents(events: RawEvent[]): void {
    const p = this.sim.parameters();
    const sparks = Math.round(num(p, 'feedback.particles', 8));
    for (const e of events) {
      const enemy = typeof e.data?.['enemyId'] === 'number' ? this.sim.enemies.find((x) => x.id === e.data?.['enemyId']) : undefined;
      switch (e.type) {
        case 'attack':
          this.play('pulse');
          break;
        case 'hit':
          this.play('hit');
          if (enemy && sparks > 0) this.sparks.explode(this.settings.reducedMotion ? Math.min(3, sparks) : sparks, enemy.x, enemy.y);
          break;
        case 'shake':
          shake(this, Number(e.data?.['intensity'] ?? 0), 110, this.settings.reducedMotion, 10);
          break;
        case 'enemyKilled':
          this.play('explosion');
          break;
        case 'waveStart':
          this.showBanner(`WAVE ${e.data?.['wave']}`);
          break;
        case 'playerHit':
          if (!this.settings.reducedMotion) this.cameras.main.flash(90, 255, 59, 92);
          break;
        case 'gameOver':
          this.play('death');
          break;
        case 'victory':
          this.play('win');
          break;
      }
    }
  }

  protected renderState(): void {
    const sim = this.sim;
    const blink = sim.invulnTicks > 0 && Math.floor(sim.currentTick() / 4) % 2 === 0;
    this.player
      .setPosition(sim.x, sim.y)
      .setRotation(Math.atan2(sim.facingY, sim.facingX) + Math.PI / 2)
      .setAlpha(blink ? 0.35 : 1);

    const since = sim.currentTick() - sim.lastAttackTick;
    const radius = num(sim.parameters(), 'attack.radius', 84);
    if (since >= 0 && since < 12) {
      const t = since / 12;
      this.pulse.setVisible(true).setPosition(sim.x, sim.y).setRadius(radius * (0.4 + 0.6 * t)).setStrokeStyle(3, CYAN, 1 - t);
    } else this.pulse.setVisible(false);

    const seen = new Set<number>();
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      seen.add(e.id);
      let s = this.enemySprites.get(e.id);
      if (!s) {
        s = this.add.image(e.x, e.y, ENEMY_TEXTURE[e.kind]).setScale(e.kind === 'dummy' ? 1.1 : 1.3);
        this.enemySprites.set(e.id, s);
      }
      s.setPosition(e.x, e.y).setRotation(sim.currentTick() * 0.03 * (e.id % 2 ? 1 : -1));
      if (e.flashTicks > 0) s.setTintFill(0xffffff);
      else s.clearTint();
    }
    for (const [id, s] of this.enemySprites) {
      if (!seen.has(id)) {
        s.destroy();
        this.enemySprites.delete(id);
      }
    }
    this.player.setDepth(10);
    this.pulse.setDepth(9);
    this.hearts.forEach((h, i) => h.setVisible(i < sim.maxHealth).setAlpha(i < sim.health ? 1 : 0.2).setDepth(20));
    const alive = sim.enemies.filter((e) => e.alive).length;
    this.hud.setText(`SCORE ${sim.score}   WAVE ${sim.wave}/${sim.totalWaves}   ENEMIES ${alive}${this.settings.reducedMotion ? '   RM' : ''}`).setDepth(20);
    this.sparks.setDepth(15);

    let body = '';
    if (sim.state === 'gameOver') body = `Final score ${sim.score}\n\nPress R to try again`;
    else if (sim.state === 'victory') body = `All waves cleared. Score ${sim.score}\n\nPress R to play again`;
    else if (this.uiMode === 'title') body = 'Press Enter to begin\n\nArrows / WASD  move   ·   Space / J  pulse attack\nR  restart   ·   P  pause   ·   V  reduced motion   ·   M  mute';
    else if (this.uiMode === 'paused') body = 'Paused\n\nPress P to continue';
    this.overlay.setVisible(body !== '').setDepth(30);
    this.overlayTitle.setText(sim.state === 'gameOver' ? 'GAME OVER' : sim.state === 'victory' ? 'VICTORY' : this.uiMode === 'paused' ? 'PAUSED' : 'NEON SURVIVOR');
    this.overlayBody.setText(body);
    this.banner.setDepth(25);
  }
}
