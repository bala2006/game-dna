import Phaser from 'phaser';
import type { ParameterValues, RawEvent } from '@gamedna/core';
import { SimScene, shake } from '@gamedna/starter/phaser';
import { num } from '@gamedna/starter';
import { GravityShiftSim, PLAYER_H, PLAYER_W } from './sim.js';
import { TILE } from './levels.js';
import tuning from './tuning.json';

export const HUD_H = 28;
const INK = '#23272f';
const EMBER = 0xe07a4f;
const FOG = 0xcfc7bb;
/** Sprites are drawn with margins; scale so the visible body matches the hitbox. */
const PLAYER_SCALE = 1.45;
const SOUNDS = ['jump', 'land', 'pickup', 'death', 'win', 'ui'] as const;

/** Layered-minimal presentation of the Gravity Shift simulation. */
export class GravityScene extends SimScene<GravityShiftSim> {
  protected readonly gameId = 'gravity-shift';
  private world!: Phaser.GameObjects.Container;
  private levelLayer!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Image;
  private keySprites = new Map<string, Phaser.GameObjects.Image>();
  private exitSprites: Phaser.GameObjects.Image[] = [];
  private builtLevel = '';
  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayBody!: Phaser.GameObjects.Text;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private squash = 0;

  constructor() {
    super('gravity');
  }

  preload(): void {
    this.load.setPath('assets/generated/');
    this.load.svg('background', 'background.svg', { width: 960, height: 540 });
    this.load.svg('tile-solid', 'tile-solid.svg', { width: 32, height: 32 });
    this.load.svg('tile-spike', 'tile-spike.svg', { width: 32, height: 32 });
    this.load.svg('player', 'player.svg', { width: 24, height: 30 });
    this.load.svg('key', 'key.svg', { width: 24, height: 24 });
    this.load.svg('exit', 'exit.svg', { width: 32, height: 32 });
    for (const s of SOUNDS) this.load.audio(`sfx-${s}`, `sfx-${s}.wav`);
  }

  create(): void {
    this.initComfort();
    this.sound.mute = this.settings.muted;
    this.sim = new GravityShiftSim();
    this.sim.reset(1, tuning as ParameterValues, { level: 'level-1' });

    const g = this.add.graphics();
    g.fillStyle(0xfaf7f2, 1).fillCircle(4, 4, 4);
    g.generateTexture('dot', 8, 8);
    g.destroy();

    // Background stays light so tiles and actors keep contrast (technical-art skill: value hierarchy).
    this.add.image(0, 0, 'background').setOrigin(0, 0).setAlpha(0.7);
    this.world = this.add.container(0, HUD_H);
    this.levelLayer = this.add.container(0, 0);
    this.world.add(this.levelLayer);
    this.player = this.add.image(0, 0, 'player');
    this.world.add(this.player);
    this.dust = this.add.particles(0, 0, 'dot', {
      speed: { min: 20, max: 70 },
      angle: { min: 200, max: 340 },
      lifespan: { min: 250, max: 520 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [0xcfc7bb, 0x9c958c],
      emitting: false,
    });
    this.world.add(this.dust);

    const font = { fontFamily: 'Georgia, "Iowan Old Style", serif', color: INK };
    this.add.rectangle(0, 0, 960, HUD_H, 0xfaf7f2, 0.85).setOrigin(0, 0);
    this.hudLeft = this.add.text(12, 5, '', { ...font, fontSize: '16px' });
    this.hudRight = this.add.text(948, 5, '', { ...font, fontSize: '16px' }).setOrigin(1, 0);
    this.hint = this.add.text(480, 540 - 22, '', { ...font, fontSize: '14px', color: '#faf7f2' }).setOrigin(0.5, 0.5);
    this.toast = this.add.text(480, 80, '', { ...font, fontSize: '18px' }).setOrigin(0.5).setAlpha(0);

    const shade = this.add.rectangle(0, 0, 960, 540, 0xe9e4dc, 0.92).setOrigin(0, 0);
    this.overlayTitle = this.add.text(480, 190, 'G R A V I T Y   S H I F T', { ...font, fontSize: '44px' }).setOrigin(0.5);
    this.overlayBody = this.add.text(480, 320, '', { ...font, fontSize: '18px', align: 'center', lineSpacing: 8 }).setOrigin(0.5);
    this.overlay = this.add.container(0, 0, [shade, this.overlayTitle, this.overlayBody]);

    this.bindKeys({ left: ['LEFT', 'A'], right: ['RIGHT', 'D'], jump: ['SPACE', 'UP', 'W'], flip: ['SHIFT', 'G'], restart: ['R'] });
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
      this.flashToast(this.settings.reducedMotion ? 'Reduced motion on' : 'Reduced motion off');
    });
  }

  /** Called by the dev bridge after a parameter or seed reset. */
  refresh(): void {
    this.builtLevel = '';
  }

  private play(name: (typeof SOUNDS)[number]): void {
    if (this.controlled || this.settings.muted) return;
    if (this.cache.audio.exists(`sfx-${name}`)) this.sound.play(`sfx-${name}`, { volume: 0.45 });
  }

  private flashToast(text: string): void {
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 500 });
  }

  private buildLevel(): void {
    this.levelLayer.removeAll(true);
    this.keySprites.clear();
    this.exitSprites = [];
    const lvl = this.sim.level;
    lvl.solid.forEach((row, r) =>
      row.forEach((solid, c) => {
        if (solid) this.levelLayer.add(this.add.image(c * TILE, r * TILE, 'tile-solid').setOrigin(0, 0));
      }),
    );
    for (const h of lvl.hazards) {
      this.levelLayer.add(this.add.image(h.col * TILE + TILE / 2, h.row * TILE + TILE / 2, 'tile-spike').setFlipY(h.ceiling));
    }
    for (const e of lvl.exits) {
      const img = this.add.image(e.col * TILE + TILE / 2, e.row * TILE + TILE / 2 - 8, 'exit').setScale(1.5);
      this.exitSprites.push(img);
      this.levelLayer.add(img);
    }
    for (const k of lvl.keys) {
      const img = this.add.image(k.col * TILE + TILE / 2, k.row * TILE + TILE / 2, 'key').setScale(1.3);
      this.keySprites.set(k.id, img);
      this.levelLayer.add(img);
    }
    this.builtLevel = lvl.def.id;
    this.hint.setText(lvl.def.hint);
  }

  protected onSimEvents(events: RawEvent[]): void {
    const p = this.sim.parameters();
    const dust = Math.round(num(p, 'feedback.dustParticles', 6));
    const footX = this.sim.x + PLAYER_W / 2;
    const footY = this.sim.gravitySign === 1 ? this.sim.y + PLAYER_H : this.sim.y;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.play('jump');
          if (dust > 0) this.dust.explode(Math.ceil(dust / 2), footX, footY);
          break;
        case 'land':
          this.play('land');
          this.squash = num(p, 'feedback.landSquash', 0.18);
          if (dust > 0) this.dust.explode(dust, footX, footY);
          if (Number(e.data?.['impact'] ?? 0) > 600) shake(this, num(p, 'feedback.landShakePx', 0), 90, this.settings.reducedMotion, 4);
          break;
        case 'keyCollected':
          this.play('pickup');
          this.flashToast(`Key ${e.data?.['keys']} of ${e.data?.['total']}`);
          break;
        case 'exitLocked':
          this.flashToast('The door is sealed. Find every key.');
          break;
        case 'death':
          this.play('death');
          if (!this.settings.reducedMotion) this.cameras.main.flash(120, 138, 59, 85);
          break;
        case 'levelComplete':
          this.play('win');
          break;
        case 'flip':
          this.play('ui');
          break;
      }
    }
  }

  protected renderState(deltaMs: number): void {
    const sim = this.sim;
    if (this.builtLevel !== sim.level.def.id) this.buildLevel();
    this.squash = Math.max(0, this.squash - deltaMs / 400);
    const s = this.squash;
    this.player
      .setPosition(sim.x + PLAYER_W / 2, sim.y + PLAYER_H / 2)
      .setFlipY(sim.gravitySign === -1)
      .setScale(PLAYER_SCALE * (1 + s), PLAYER_SCALE * (1 - s))
      .setAlpha(sim.alive ? 1 : 0.25);
    for (const [id, img] of this.keySprites) img.setVisible(!sim.collected.has(id));
    const open = sim.collected.size >= sim.level.keys.length;
    for (const x of this.exitSprites) x.setTint(open ? EMBER : FOG).setAlpha(open ? 1 : 0.8);
    this.hudLeft.setText(sim.level.def.name);
    this.hudRight.setText(`Keys ${sim.collected.size}/${sim.level.keys.length}   ·   Deaths ${sim.deaths}${this.settings.reducedMotion ? '   ·   Reduced motion' : ''}`);

    let body = '';
    if (this.controlled) body = '';
    else if (sim.won) body = 'You found your way out.\n\nPress R to play again.';
    else if (this.uiMode === 'title') body = 'Press Enter to begin\n\nArrows / A D  move   ·   Space  jump   ·   Shift / G  reverse gravity\nR  restart   ·   P  pause   ·   V  reduced motion   ·   M  mute';
    else if (this.uiMode === 'paused') body = 'Paused\n\nPress P to continue';
    this.overlay.setVisible(body !== '');
    this.overlayTitle.setText(sim.won ? 'E S C A P E D' : this.uiMode === 'paused' ? 'P A U S E D' : 'G R A V I T Y   S H I F T');
    this.overlayBody.setText(body);
  }
}
