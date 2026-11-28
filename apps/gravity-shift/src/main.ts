import { bootGame } from '@gamedna/starter/phaser';
import { GravityScene } from './game/scene.js';

const scene = new GravityScene();
bootGame({ parent: 'game', width: 960, height: 540, backgroundColor: '#e9e4dc', scene });

