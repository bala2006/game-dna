import { getStylePack, paletteSet } from './style-packs.js';
import type { GeneratedAsset } from './generators.js';

export interface AssetDiagnostic {
  check: 'dimensions' | 'transparency' | 'palette' | 'sprite-sheet' | 'attribution' | 'format';
  status: 'passed' | 'failed' | 'not_tested';
  message: string;
  fix?: string;
}

export interface AssetExpectations {
  width?: number;
  height?: number;
  frames?: number;
  requireTransparency?: boolean;
}

export interface ManifestEntry {
  id: string;
  file: string;
  type: string;
  kind: string;
  styleId: string;
  seed: number;
  width: number;
  height: number;
  frames: number;
  generator: string;
  generatorVersion: string;
  sha256: string;
  license: string;
  createdAt: string;
  createdWith: string;
}

function svgColors(svg: string): string[] {
  return [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
}

/** Validate a generated asset; every failure comes with a corrective suggestion (GD-012). */
export function validateAsset(asset: GeneratedAsset, expect: AssetExpectations = {}, manifest?: Partial<ManifestEntry>): AssetDiagnostic[] {
  const out: AssetDiagnostic[] = [];
  const pack = getStylePack(asset.styleId);
  const visual = asset.type === 'sprite' || asset.type === 'tile' || asset.type === 'background' || asset.type === 'icon';

  if (visual) {
    const okW = expect.width === undefined || expect.width === asset.width;
    const okH = expect.height === undefined || expect.height === asset.height;
    out.push(
      okW && okH
        ? { check: 'dimensions', status: 'passed', message: `${asset.width}x${asset.height} px` }
        : { check: 'dimensions', status: 'failed', message: `Expected ${expect.width ?? '*'}x${expect.height ?? '*'}, got ${asset.width}x${asset.height}`, fix: 'Regenerate with the requested width/height, or update the expectation in the game.' },
    );
  }

  const needsAlpha = expect.requireTransparency ?? (asset.type === 'sprite' || asset.type === 'icon');
  if (visual && needsAlpha) {
    if (asset.payload.format === 'rgba') {
      const px = asset.payload.pixels;
      const corners = [0, asset.width - 1, (asset.height - 1) * asset.width, asset.height * asset.width - 1];
      const transparent = corners.some((i) => px[i * 4 + 3] === 0);
      out.push(transparent ? { check: 'transparency', status: 'passed', message: 'Has transparent background pixels' } : { check: 'transparency', status: 'failed', message: 'No transparent corner pixels; sprite will draw a box', fix: 'Leave the background alpha at 0 or shrink the shape inside the frame.' });
    } else if (asset.payload.format === 'svg') {
      const fullRect = new RegExp(`<rect[^>]*width="${asset.width}"[^>]*height="${asset.height}"[^>]*fill="#`, 'i').test(asset.payload.text);
      out.push(fullRect ? { check: 'transparency', status: 'failed', message: 'SVG paints a full-size opaque rectangle', fix: 'Remove the background rect so the sprite composes over the scene.' } : { check: 'transparency', status: 'passed', message: 'No full-bleed background rectangle' });
    }
  }

  if (pack && visual) {
    const allowed = paletteSet(pack);
    let used: string[] = [];
    if (asset.payload.format === 'svg') used = svgColors(asset.payload.text);
    else if (asset.payload.format === 'rgba') {
      const set = new Set<string>();
      const px = asset.payload.pixels;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        set.add(`#${[px[i], px[i + 1], px[i + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`);
      }
      used = [...set];
    }
    const outside = used.filter((c) => !allowed.has(c));
    out.push(outside.length === 0 ? { check: 'palette', status: 'passed', message: `${used.length} color(s), all in the ${pack.name} palette` } : { check: 'palette', status: 'failed', message: `Colors outside the ${pack.name} palette: ${outside.join(', ')}`, fix: `Map each color to the nearest palette entry (${[...allowed].join(', ')}).` });
  } else if (!pack) {
    out.push({ check: 'palette', status: 'failed', message: `Unknown style pack ${asset.styleId}`, fix: 'Use pixel-adventure, neon-arcade or layered-minimal.' });
  }

  if (asset.type === 'sprite') {
    const frames = expect.frames ?? asset.frames;
    out.push(asset.width % frames === 0 ? { check: 'sprite-sheet', status: 'passed', message: `${frames} frame(s) of ${asset.width / frames}x${asset.height}` } : { check: 'sprite-sheet', status: 'failed', message: `Width ${asset.width} is not divisible by ${frames} frames`, fix: 'Use a sheet width that is an exact multiple of the frame width.' });
  }

  if (asset.payload.format === 'wav') {
    const b = asset.payload.bytes;
    const riff = String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0) === 'RIFF';
    out.push(riff && b.length > 44 ? { check: 'format', status: 'passed', message: `PCM WAV, ${b.length - 44} data bytes` } : { check: 'format', status: 'failed', message: 'Not a valid RIFF/WAVE payload', fix: 'Regenerate the sound effect.' });
  }
  if (asset.payload.format === 'json') {
    try {
      JSON.parse(asset.payload.text);
      out.push({ check: 'format', status: 'passed', message: 'Valid JSON particle definition' });
    } catch {
      out.push({ check: 'format', status: 'failed', message: 'Particle definition is not valid JSON', fix: 'Regenerate the particle definition.' });
    }
  }

  if (manifest) {
    const missing = (['generator', 'generatorVersion', 'seed', 'license', 'sha256'] as const).filter((k) => manifest[k] === undefined || manifest[k] === '');
    out.push(missing.length === 0 && manifest.license && !/unknown/i.test(manifest.license) ? { check: 'attribution', status: 'passed', message: `Provenance recorded (${manifest.generator} v${manifest.generatorVersion}, seed ${manifest.seed}, ${manifest.license})` } : { check: 'attribution', status: 'failed', message: `Missing or unknown provenance fields: ${missing.join(', ') || 'license'}`, fix: 'Record generator, version, seed, license and hash in .gamedna/assets-manifest.json.' });
  } else {
    out.push({ check: 'attribution', status: 'not_tested', message: 'No manifest entry supplied' });
  }
  return out;
}
