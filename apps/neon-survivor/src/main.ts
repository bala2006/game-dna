import { bootGame } from '@gamedna/starter/phaser';
import { NeonScene } from './game/scene.js';

const scene = new NeonScene();
bootGame({ parent: 'game', width: 960, height: 540, backgroundColor: '#0a0612', scene });

