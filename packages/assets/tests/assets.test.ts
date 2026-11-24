import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ASSET_TYPES, STYLE_PACK_IDS, STYLE_PACKS, generateAsset, validateAsset, type AssetType } from '../src/index.js';
import { assetHash, assetBytes } from '../src/node.js';

const kindFor: Record<AssetType, string | undefined> = { sprite: 'enemy', tile: 'hazard', background: undefined, icon: 'key', particles: 'impact', sfx: 'hit' };

describe('style packs', () => {
  it('ships three packs that differ beyond color', () => {
    expect(STYLE_PACK_IDS).toHaveLength(3);
    const modes = new Set(STYLE_PACK_IDS.map((id) => STYLE_PACKS[id].rendering.mode));
    const cams = new Set(STYLE_PACK_IDS.map((id) => STYLE_PACKS[id].camera.follow));
    const fonts = new Set(STYLE_PACK_IDS.map((id) => STYLE_PACKS[id].typography.family));
    expect(modes.size).toBe(3);
    expect(cams.size).toBe(3);
    expect(fonts.size).toBe(3);
  });
  it('role colors are palette members', () => {
    for (const id of STYLE_PACK_IDS) {
      const pal = new Set(Object.values(STYLE_PACKS[id].palette));
      for (const c of Object.values(STYLE_PACKS[id].roles)) expect(pal.has(c), `${id} ${c}`).toBe(true);
    }
  });
});

describe('generators', () => {
  for (const style of STYLE_PACK_IDS) {
    for (const type of ASSET_TYPES) {
      it(`${style}/${type} is byte-deterministic and passes validation`, () => {
        const params: Record<string, string> = kindFor[type] ? { kind: kindFor[type] as string } : {};
        const req = { type, styleId: style, seed: 1234, params };
        const a = generateAsset(req);
        const b = generateAsset(req);
        expect(assetHash(a)).toBe(assetHash(b));
        const diag = validateAsset(a, {}, { generator: a.generator, generatorVersion: a.generatorVersion, seed: a.seed, license: a.license, sha256: assetHash(a) });
        expect(diag.filter((d) => d.status === 'failed'), JSON.stringify(diag)).toEqual([]);
      });
    }
  }

  it('different seeds produce different sprites (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const a = assetHash(generateAsset({ type: 'sprite', styleId: 'pixel-adventure', seed, params: { kind: 'enemy' } }));
        const b = assetHash(generateAsset({ type: 'sprite', styleId: 'pixel-adventure', seed: seed + 1, params: { kind: 'enemy' } }));
        return a !== b;
      }),
      { numRuns: 30 },
    );
  });

  it('writes valid PNG and WAV headers', () => {
    const png = assetBytes(generateAsset({ type: 'tile', styleId: 'pixel-adventure', seed: 1 }));
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const wav = assetBytes(generateAsset({ type: 'sfx', styleId: 'neon-arcade', seed: 1, params: { kind: 'jump' } }));
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('builds sprite sheets whose width divides by frame count', () => {
    const a = generateAsset({ type: 'sprite', styleId: 'neon-arcade', seed: 3, width: 112, height: 28, params: { kind: 'player', frames: 4 } });
    expect(a.width).toBe(112);
    expect(validateAsset(a, { frames: 4 }).find((d) => d.check === 'sprite-sheet')?.status).toBe('passed');
  });

  it('diagnoses wrong dimensions, off-palette colors and missing attribution with fixes', () => {
    const a = generateAsset({ type: 'icon', styleId: 'neon-arcade', seed: 1, params: { kind: 'star' } });
    const tampered = { ...a, payload: { format: 'svg' as const, text: a.payload.format === 'svg' ? a.payload.text.replace(/#b6ff3b/g, '#123456') : '' } };
    const diag = validateAsset(tampered, { width: 32 }, { license: 'unknown' });
    const failed = diag.filter((d) => d.status === 'failed').map((d) => d.check).sort();
    expect(failed).toEqual(['attribution', 'dimensions', 'palette']);
    expect(diag.every((d) => d.status !== 'failed' || d.fix)).toBe(true);
  });

  it('rejects oversize requests and unknown packs', () => {
    expect(() => generateAsset({ type: 'background', styleId: 'neon-arcade', seed: 1, width: 99999 })).toThrow(/outside/);
    expect(() => generateAsset({ type: 'sprite', styleId: 'nope', seed: 1 })).toThrow(/Unknown style/);
  });
});
