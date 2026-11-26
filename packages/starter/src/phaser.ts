import Phaser from 'phaser';
import type { RawEvent } from '@gamedna/core';
import { FixedStepClock } from '@gamedna/kit/loop';
import type { FixedStepSimulation } from './simulation.js';
import { loadSettings, saveSettings, type ComfortSettings } from './settings.js';

/** Logical key name → Phaser key names, e.g. { left: ['LEFT', 'A'] }. */
export type KeyBindings = Record<string, string[]>;

export type UiMode = 'title' | 'playing' | 'paused';

/**
 * Phaser scene that owns a fixed-step simulation. Phaser handles drawing, audio and keyboard;
 * all game rules stay in the simulation, so scenario runs and live play execute the same code.
 */
export abstract class SimScene<S extends FixedStepSimulation> extends Phaser.Scene {
  sim!: S;
  readonly clock = new FixedStepClock(60);
  uiMode: UiMode = 'title';
  settings!: ComfortSettings;
  private keyMap: Array<{ logical: string; keys: Phaser.Input.Keyboard.Key[] }> = [];
  private keyState = new Map<string, boolean>();

  protected abstract readonly gameId: string;

  protected initComfort(): void {
    this.settings = loadSettings(this.gameId);
  }

  protected toggleSetting(key: keyof ComfortSettings): void {
    this.settings = { ...this.settings, [key]: !this.settings[key] };
    saveSettings(this.gameId, this.settings);
    if (key === 'muted') this.sound.mute = this.settings.muted;
  }

  protected bindKeys(bindings: KeyBindings): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    this.keyMap = Object.entries(bindings).map(([logical, names]) => ({
      logical,
      keys: names.map((n) => kb.addKey(n, true)),
    }));
  }

  private pollKeyboard(): void {
    for (const { logical, keys } of this.keyMap) {
      const down = keys.some((k) => k.isDown);
      if (this.keyState.get(logical) !== down) {
        this.keyState.set(logical, down);
        this.sim.setInput(logical, down);
      }
    }
  }

  override update(_time: number, delta: number): void {
    if (this.uiMode === 'playing') {
      this.pollKeyboard();
      const steps = this.clock.advance(delta);
      for (let i = 0; i < steps; i++) {
        this.sim.step();
        const events = this.sim.drainEvents();
        if (events.length) this.onSimEvents(events);
      }
    } else {
      this.clock.reset();
    }
    this.renderState(delta);
  }

  /** React to simulation events with audio-visual feedback. */
  protected abstract onSimEvents(events: RawEvent[]): void;
  /** Draw the current simulation state. Must not change the simulation. */
  protected abstract renderState(deltaMs: number): void;
}

export interface BootOptions {
  parent: string | HTMLElement;
  width: number;
  height: number;
  backgroundColor: string;
  pixelArt?: boolean;
  scene: Phaser.Types.Scenes.SceneType | Phaser.Types.Scenes.SceneType[];
}

export function bootGame(o: BootOptions): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: o.parent,
    width: o.width,
    height: o.height,
    backgroundColor: o.backgroundColor,
    pixelArt: o.pixelArt ?? false,
    antialias: !o.pixelArt,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { disableWebAudio: false },
    banner: false,
    scene: o.scene,
  });
}

/** Simple camera shake that respects reduced motion and a style-pack cap. */
export function shake(scene: Phaser.Scene, intensityPx: number, durationMs: number, reducedMotion: boolean, capPx: number): void {
  if (reducedMotion || intensityPx <= 0) return;
  const px = Math.min(intensityPx, capPx);
  scene.cameras.main.shake(durationMs, px / scene.scale.width);
}
