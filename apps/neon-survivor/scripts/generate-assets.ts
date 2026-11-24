/** Regenerates every Neon Survivor asset from recorded seeds (neon-arcade style pack). */
import path from 'node:path';
import { materializeAsset, type AssetRequest } from '@gamedna/assets/node';

const root = path.resolve(import.meta.dirname, '..');
const style = 'neon-arcade';
const assets: Array<[string, AssetRequest]> = [
  ['background', { type: 'background', styleId: style, seed: 101, width: 960, height: 540, params: { layers: 4 } }],
  ['player', { type: 'sprite', styleId: style, seed: 111, width: 32, height: 32, params: { kind: 'player' } }],
  ['enemy-chaser', { type: 'sprite', styleId: style, seed: 121, width: 28, height: 28, params: { kind: 'enemy' } }],
  ['enemy-drifter', { type: 'sprite', styleId: style, seed: 122, width: 22, height: 22, params: { kind: 'enemy' } }],
  ['enemy-brute', { type: 'sprite', styleId: style, seed: 123, width: 42, height: 42, params: { kind: 'enemy' } }],
  ['heart', { type: 'icon', styleId: style, seed: 131, width: 20, height: 20, params: { kind: 'heart' } }],
  ['sparks', { type: 'particles', styleId: style, seed: 141, params: { kind: 'impact' } }],
  ['sfx-pulse', { type: 'sfx', styleId: style, seed: 151, params: { kind: 'pulse' } }],
  ['sfx-hit', { type: 'sfx', styleId: style, seed: 152, params: { kind: 'hit' } }],
  ['sfx-explosion', { type: 'sfx', styleId: style, seed: 153, params: { kind: 'explosion' } }],
  ['sfx-death', { type: 'sfx', styleId: style, seed: 154, params: { kind: 'death' } }],
  ['sfx-win', { type: 'sfx', styleId: style, seed: 155, params: { kind: 'win' } }],
  ['sfx-ui', { type: 'sfx', styleId: style, seed: 156, params: { kind: 'ui' } }],
];

for (const [id, req] of assets) {
  const { entry, diagnostics } = materializeAsset(root, id, req, { createdWith: 'apps/neon-survivor/scripts/generate-assets.ts' });
  const failed = diagnostics.filter((d) => d.status === 'failed');
  console.log(`${failed.length ? 'FAIL' : 'ok  '} ${entry.file} ${entry.sha256.slice(0, 12)}${failed.length ? ` ${failed.map((d) => d.message).join('; ')}` : ''}`);
  if (failed.length) process.exitCode = 1;
}
