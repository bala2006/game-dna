/** Regenerates every Gravity Shift asset from recorded seeds (layered-minimal style pack). */
import path from 'node:path';
import { materializeAsset, type AssetRequest } from '@gamedna/assets/node';

const root = path.resolve(import.meta.dirname, '..');
const style = 'layered-minimal';
const assets: Array<[string, AssetRequest]> = [
  ['background', { type: 'background', styleId: style, seed: 11, width: 960, height: 540, params: { layers: 3 } }],
  ['tile-solid', { type: 'tile', styleId: style, seed: 21, width: 32, height: 32, params: { kind: 'solid' } }],
  ['tile-spike', { type: 'tile', styleId: style, seed: 22, width: 32, height: 32, params: { kind: 'hazard' } }],
  ['player', { type: 'sprite', styleId: style, seed: 31, width: 24, height: 30, params: { kind: 'player' } }],
  ['key', { type: 'icon', styleId: style, seed: 41, width: 24, height: 24, params: { kind: 'key' } }],
  ['exit', { type: 'icon', styleId: style, seed: 42, width: 32, height: 32, params: { kind: 'exit' } }],
  ['dust', { type: 'particles', styleId: style, seed: 51, params: { kind: 'dust' } }],
  ['sfx-jump', { type: 'sfx', styleId: style, seed: 61, params: { kind: 'jump' } }],
  ['sfx-land', { type: 'sfx', styleId: style, seed: 62, params: { kind: 'land' } }],
  ['sfx-pickup', { type: 'sfx', styleId: style, seed: 63, params: { kind: 'pickup' } }],
  ['sfx-death', { type: 'sfx', styleId: style, seed: 64, params: { kind: 'death' } }],
  ['sfx-win', { type: 'sfx', styleId: style, seed: 65, params: { kind: 'win' } }],
  ['sfx-ui', { type: 'sfx', styleId: style, seed: 66, params: { kind: 'ui' } }],
];

for (const [id, req] of assets) {
  const { entry, diagnostics } = materializeAsset(root, id, req, { createdWith: 'apps/gravity-shift/scripts/generate-assets.ts' });
  const failed = diagnostics.filter((d) => d.status === 'failed');
  console.log(`${failed.length ? 'FAIL' : 'ok  '} ${entry.file} ${entry.sha256.slice(0, 12)}${failed.length ? ` ${failed.map((d) => d.message).join('; ')}` : ''}`);
  if (failed.length) process.exitCode = 1;
}
