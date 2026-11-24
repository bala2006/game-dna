import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInside, writeFileAtomic, writeJsonAtomic } from '@gamedna/core/node';
import { fileExtension, generateAsset, type AssetRequest, type GeneratedAsset } from './generators.js';
import { assetBytes, assetHash } from './node.js';
import { validateAsset, type AssetDiagnostic, type ManifestEntry } from './validate.js';

export interface AssetManifest {
  schemaVersion: 1;
  note: string;
  assets: ManifestEntry[];
}

export const MANIFEST_FILE = '.gamedna/assets-manifest.json';
export const DEFAULT_ASSET_DIR = 'public/assets/generated';

export function readManifest(root: string): AssetManifest {
  const file = resolveInside(root, MANIFEST_FILE);
  if (!existsSync(file)) {
    return { schemaVersion: 1, note: 'Every asset listed here was generated procedurally by GameDNA from the recorded seed and generator version.', assets: [] };
  }
  return JSON.parse(readFileSync(file, 'utf8')) as AssetManifest;
}

export interface MaterializedAsset {
  asset: GeneratedAsset;
  entry: ManifestEntry;
  bytes: Buffer;
  diagnostics: AssetDiagnostic[];
  replaced: boolean;
}

/**
 * Generate an asset, write it under the project, and upsert its manifest entry.
 * `id` becomes the file name, so it is restricted to safe characters.
 */
export function materializeAsset(
  root: string,
  id: string,
  req: AssetRequest,
  options: { dir?: string; createdWith?: string; now?: string } = {},
): MaterializedAsset {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) throw new Error('Asset id must be lowercase kebab-case (max 63 chars)');
  const asset = generateAsset(req);
  const bytes = assetBytes(asset);
  const dir = options.dir ?? DEFAULT_ASSET_DIR;
  const rel = path.posix.join(dir, `${id}.${fileExtension(asset)}`);
  const abs = resolveInside(root, rel);
  writeFileAtomic(abs, bytes);
  const entry: ManifestEntry = {
    id,
    file: rel,
    type: asset.type,
    kind: asset.kind,
    styleId: asset.styleId,
    seed: asset.seed,
    width: asset.width,
    height: asset.height,
    frames: asset.frames,
    generator: asset.generator,
    generatorVersion: asset.generatorVersion,
    sha256: assetHash(asset),
    license: asset.license,
    createdAt: options.now ?? new Date().toISOString(),
    createdWith: options.createdWith ?? 'gamedna-assets',
  };
  const manifest = readManifest(root);
  const existing = manifest.assets.find((a) => a.id === id);
  // Keep the original creation time when regeneration yields identical bytes.
  if (existing && existing.sha256 === entry.sha256) entry.createdAt = existing.createdAt;
  manifest.assets = [...manifest.assets.filter((a) => a.id !== id), entry].sort((a, b) => a.id.localeCompare(b.id));
  writeJsonAtomic(resolveInside(root, MANIFEST_FILE), manifest);
  const expectations = { ...(req.width ? { width: req.width } : {}), ...(req.height ? { height: req.height } : {}) };
  return { asset, entry, bytes, diagnostics: validateAsset(asset, expectations, entry), replaced: Boolean(existing) };
}
