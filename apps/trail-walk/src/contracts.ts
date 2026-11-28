import { defineContracts } from '@gamedna/kit/contracts';

/**
 * Shared facts for Trail Walk. The walker simulation (sim.ts), the world layout (layout.ts), the
 * scenery and the camera rig (main.ts) read these. Creative direction lives in `.gamedna/contract.md`.
 */
export const CONTRACTS = defineContracts({
  name: 'trail-walk',
  spatial: {
    unit: 'meter',
    up: '+y',
    forward: '+z',
    ground: 'xz',
    scales: { walkerHeight: 1.75, walkerRadius: 0.3, reach: 1.2 },
    transformOwners: { walker: 'movement', camera: 'presentation', npcWalkers: 'presentation' },
  },
  simulation: {
    hz: 60,
    maxStepsPerFrame: 5,
    deterministic: true,
    order: ['input', 'movement', 'collision', 'collect'],
    owners: { 'walker.position': 'movement', 'walker.velocity': 'movement', collected: 'collect' },
  },
  interaction: {
    actions: {
      moveX: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] },
      moveY: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] },
      jump: { kind: 'button', devices: ['keyboard', 'gamepad', 'touch'] },
      sprint: { kind: 'button', devices: ['keyboard', 'gamepad', 'touch'] },
      interact: { kind: 'button', devices: ['keyboard', 'gamepad', 'touch'] },
      look: { kind: 'look', devices: ['mouse', 'gamepad', 'touch'] },
    },
    minTouchTargetPx: 48,
  },
  performance: { targetFps: 60, targetHardware: 'integrated laptop GPU or mid-range phone', simulationBudgetMs: 2, maxDrawCalls: 500, quality: ['high', 'low'] },
  events: ['collect', 'finish', 'jump', 'land'],
});
