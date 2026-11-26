import { defineContracts } from '@gamedna/kit/contracts';

/**
 * Shared facts for Ridgeline Racer. The simulation (sim.ts), track (track.ts), scenery, camera and
 * HUD (main.ts) all read these instead of repeating units or rates. Creative direction lives in
 * `.gamedna/contract.md`.
 */
export const CONTRACTS = defineContracts({
  name: 'ridgeline-racer',
  spatial: {
    unit: 'meter',
    up: '+y',
    forward: '+z',
    ground: 'xz',
    scales: { carLength: 4.3, roadWidth: 12, driverHeight: 1.75 },
    transformOwners: { car: 'vehicle', marshals: 'presentation', camera: 'presentation' },
  },
  simulation: {
    hz: 60,
    maxStepsPerFrame: 5,
    deterministic: true,
    order: ['input', 'vehicle', 'barriers', 'race'],
    owners: { 'car.position': 'vehicle', 'car.velocity': 'vehicle', 'race.phase': 'race', 'race.lap': 'race' },
  },
  interaction: {
    actions: {
      steer: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] },
      throttle: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] },
      brake: { kind: 'axis', devices: ['keyboard', 'gamepad', 'touch'] },
      camera: { kind: 'button', devices: ['keyboard', 'gamepad', 'touch'] },
      look: { kind: 'look', devices: ['mouse', 'gamepad'] },
    },
    minTouchTargetPx: 48,
    reducedMotion: false,
  },
  performance: { targetFps: 60, targetHardware: 'integrated laptop GPU or mid-range phone', simulationBudgetMs: 2, maxDrawCalls: 400, quality: ['high', 'low'] },
  events: ['notice', 'hit', 'finish'],
});
