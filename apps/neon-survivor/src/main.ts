import { bootGame } from '@gamedna/starter/phaser';
import { NeonScene } from './game/scene.js';

const scene = new NeonScene();
const game = bootGame({ parent: 'game', width: 960, height: 540, backgroundColor: '#0a0612', scene });

// Development only: the GameDNA bridge. Vite removes this branch from production builds.
if (import.meta.env.DEV) {
  void import('./dev/gamedna-adapter.js').then((m) => m.installGameDNA(game, scene));
}
