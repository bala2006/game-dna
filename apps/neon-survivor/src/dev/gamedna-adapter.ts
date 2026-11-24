/**
 * Development-only GameDNA bridge wiring. Never imported by production code paths:
 * main.ts loads this module behind `import.meta.env.DEV`.
 */
import Phaser from 'phaser';
import { installBridge } from '@gamedna/phaser-adapter';
import { ProjectRecordSchema, type ParameterValues } from '@gamedna/core';
import projectJson from '../../.gamedna/project.json';
import tuning from '../game/tuning.json';
import type { NeonScene } from '../game/scene.js';

export function installGameDNA(game: Phaser.Game, scene: NeonScene): void {
  const project = ProjectRecordSchema.parse(projectJson);
  const start = () => {
    const { recordLiveEvents } = installBridge({
      projectId: project.projectId,
      sim: scene.sim,
      specs: project.parameters,
      baseline: tuning as ParameterValues,
      setControlled: (on) => scene.setControlled(on),
      onReset: () => scene.refresh(),
      engine: { id: 'phaser', version: Phaser.VERSION },
      viewport: project.viewport,
    });
    scene.devHooks.onEvents = recordLiveEvents;
    const params = new URLSearchParams(location.search);
    // Workbench previews skip the title screen so every variant starts identically.
    if (params.has('gamedna') && params.get('gdSkipTitle') !== '0') scene.uiMode = 'playing';
  };
  if (scene.sim) start();
  else scene.events.once(Phaser.Scenes.Events.CREATE, start);
  void game;
}
