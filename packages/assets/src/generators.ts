import { createRng, deriveSeed, GameDNAError, type Rng } from '@gamedna/core';
import { getStylePack, hexToRgb, STYLE_PACK_IDS, type StylePack } from './style-packs.js';
import { synthesizeSfx, SFX_KINDS, type SfxKind } from './sfx.js';

export const GENERATOR_VERSION = '0.1.0';
export const ASSET_TYPES = ['sprite', 'tile', 'background', 'icon', 'particles', 'sfx'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const SPRITE_KINDS = ['player', 'enemy', 'pickup'] as const;
export const TILE_KINDS = ['solid', 'hazard', 'platform'] as const;
export const ICON_KINDS = ['key', 'heart', 'star', 'exit'] as const;

export interface AssetRequest {
  type: AssetType;
  styleId: string;
  seed: number;
  width?: number;
  height?: number;
  /** Generator-specific: kind, frames, layers, durationMs. */
  params?: Record<string, string | number | boolean>;
}

export type AssetPayload =
  | { format: 'svg'; text: string }
  | { format: 'rgba'; pixels: Uint8Array }
  | { format: 'json'; text: string }
  | { format: 'wav'; bytes: Uint8Array };

export interface GeneratedAsset {
  type: AssetType;
  styleId: string;
  seed: number;
  width: number;
  height: number;
  frames: number;
  kind: string;
  generator: string;
  generatorVersion: string;
  license: string;
  payload: AssetPayload;
}

const MAX_DIM = 2048;

function dims(req: AssetRequest, dw: number, dh: number): [number, number] {
  const w = Math.trunc(req.width ?? dw);
  const h = Math.trunc(req.height ?? dh);
  if (w < 4 || h < 4 || w > MAX_DIM || h > MAX_DIM) {
    throw new GameDNAError('INVALID_INPUT', `Asset size ${w}x${h} is outside 4..${MAX_DIM}`, { fix: 'Request a size between 4 and 2048 pixels per side.' });
  }
  return [w, h];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new GameDNAError('INVALID_INPUT', `${label} must be one of ${allowed.join(', ')}`);
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

function svgDoc(w: number, h: number, body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

function glowDefs(id: string, blur: number): string {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(blur)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

// ---------------------------------------------------------------- pixel raster helpers

class Raster {
  readonly pixels: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.pixels = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, hex: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hexToRgb(hex);
    const i = (Math.trunc(y) * this.w + Math.trunc(x)) * 4;
    this.pixels[i] = r;
    this.pixels[i + 1] = g;
    this.pixels[i + 2] = b;
    this.pixels[i + 3] = 255;
  }
  fill(x: number, y: number, w: number, h: number, hex: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }
  alpha(x: number, y: number): number {
    return this.pixels[(y * this.w + x) * 4 + 3] ?? 0;
  }
}

/** Mirrored pixel creature: random half-grid, mirrored, outlined in ink. */
function pixelCreature(r: Raster, ox: number, oy: number, size: number, rng: Rng, body: string, detail: string, ink: string, bob: number): void {
  const cols = Math.ceil(size / 2);
  const grid: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < cols; x++) {
      const edge = y === 0 || y === size - 1 || x === 0;
      row.push(edge ? rng.bool(0.25) : rng.bool(0.62));
    }
    grid.push(row);
  }
  const filled = (x: number, y: number): boolean => {
    if (y < 0 || y >= size || x < 0 || x >= size) return false;
    const cx = x < cols ? x : size - 1 - x;
    return grid[y]?.[cx] ?? false;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (filled(x, y)) r.set(ox + x, oy + y + bob, (x + y) % 5 === 0 ? detail : body);
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) r.set(ox + x, oy + y + bob, ink);
    }
  }
  // Eyes on the upper third keep the silhouette readable as a character.
  const ey = oy + Math.floor(size / 3) + bob;
  const ex = Math.max(1, Math.floor(size / 2) - 2);
  r.set(ox + ex, ey, ink);
  r.set(ox + size - 1 - ex, ey, ink);
}

// ---------------------------------------------------------------- generators

function sprite(req: AssetRequest, pack: StylePack, rng: Rng): GeneratedAsset {
  const kind = oneOf(req.params?.['kind'], SPRITE_KINDS, 'player', 'params.kind');
  const frames = Math.trunc(Number(req.params?.['frames'] ?? 1));
  if (!(frames >= 1 && frames <= 8)) throw new GameDNAError('INVALID_INPUT', 'params.frames must be 1..8');
  const base = pack.scale.spritePx;
  const [fw, fh] = dims({ ...req, width: req.width ? Math.trunc(req.width / frames) : undefined }, base, base);
  const w = fw * frames;
  const h = fh;
  const color = kind === 'player' ? pack.roles.accent : kind === 'enemy' ? pack.roles.hazard : pack.roles.pickup;
  const common = { type: 'sprite' as const, styleId: pack.id, seed: req.seed, width: w, height: h, frames, kind, generatorVersion: GENERATOR_VERSION, license: pack.license };

  if (pack.rendering.mode === 'raster-pixel') {
    const r = new Raster(w, h);
    const size = Math.min(fw, fh) - 2;
    for (let i = 0; i < frames; i++) {
      const frameRng = createRng(req.seed); // identical body per frame; only the bob changes
      pixelCreature(r, i * fw + 1, 1, size, frameRng, color, pack.palette['cream'] ?? pack.roles.foreground, pack.roles.ui, i % 2 === 1 && frames > 1 ? -1 : 0);
    }
    return { ...common, generator: 'pixel-creature', payload: { format: 'rgba', pixels: r.pixels } };
  }

  const parts: string[] = [];
  let defs = '';
  for (let i = 0; i < frames; i++) {
    const cx = i * fw + fw / 2;
    const cy = fh / 2 + (frames > 1 ? Math.sin((i / frames) * Math.PI * 2) * pack.motion.idleBobPx : 0);
    const rad = Math.min(fw, fh) * 0.38;
    if (pack.rendering.mode === 'vector-glow') {
      defs = glowDefs('glow', Math.max(1, rad * 0.18));
      const sides = kind === 'player' ? 3 : kind === 'enemy' ? rng.int(5, 8) : 4;
      const spike = kind === 'enemy' ? 0.55 + rng.next() * 0.25 : 1;
      const pts: string[] = [];
      const n = kind === 'enemy' ? sides * 2 : sides;
      const rot = kind === 'player' ? -Math.PI / 2 : rng.next() * Math.PI;
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        const rr = kind === 'enemy' && k % 2 === 1 ? rad * spike : rad;
        pts.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`);
      }
      parts.push(`<polygon points="${pts.join(' ')}" fill="${pack.roles.background}" fill-opacity="0.35" stroke="${color}" stroke-width="${f(Math.max(1.5, rad * 0.14))}" stroke-linejoin="round" filter="url(#glow)"/>`);
      parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad * 0.16)}" fill="${pack.roles.foreground}"/>`);
    } else {
      // vector-soft: rounded body, soft shadow ellipse, single eye.
      const bw = rad * (kind === 'pickup' ? 1.2 : 1.5 + rng.next() * 0.2);
      const bh = rad * (kind === 'pickup' ? 1.2 : 1.8 + rng.next() * 0.2);
      parts.push(`<ellipse cx="${f(cx)}" cy="${f(fh * 0.9)}" rx="${f(bw * 0.5)}" ry="${f(fh * 0.06)}" fill="${pack.roles.shadow}" fill-opacity="0.35"/>`);
      if (kind === 'pickup') {
        parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(bw / 2)}" fill="none" stroke="${color}" stroke-width="${f(rad * 0.22)}"/>`);
        parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(bw / 5)}" fill="${color}"/>`);
      } else {
        parts.push(`<rect x="${f(cx - bw / 2)}" y="${f(cy - bh / 2)}" width="${f(bw)}" height="${f(bh)}" rx="${f(bw * 0.38)}" fill="${color}"/>`);
        parts.push(`<circle cx="${f(cx + bw * 0.14)}" cy="${f(cy - bh * 0.16)}" r="${f(rad * 0.16)}" fill="${pack.roles.foreground}"/>`);
      }
    }
  }
  return { ...common, generator: pack.rendering.mode === 'vector-glow' ? 'neon-polygon' : 'soft-silhouette', payload: { format: 'svg', text: svgDoc(w, h, parts.join(''), defs) } };
}

function tile(req: AssetRequest, pack: StylePack, rng: Rng): GeneratedAsset {
  const kind = oneOf(req.params?.['kind'], TILE_KINDS, 'solid', 'params.kind');
  const [w, h] = dims(req, pack.scale.tilePx, pack.scale.tilePx);
  const common = { type: 'tile' as const, styleId: pack.id, seed: req.seed, width: w, height: h, frames: 1, kind, generatorVersion: GENERATOR_VERSION, license: pack.license };
  if (pack.rendering.mode === 'raster-pixel') {
    const r = new Raster(w, h);
    if (kind === 'hazard') {
      const teeth = Math.max(2, Math.floor(w / 4));
      const tw = w / teeth;
      for (let t = 0; t < teeth; t++) {
        // Upward-pointing teeth: narrow at the tip (top), full width at the base.
        for (let y = Math.floor(h / 4); y < h; y++) {
          const half = ((y - h / 4 + 1) / (h * 0.75)) * (tw / 2);
          for (let x = Math.floor(t * tw + tw / 2 - half); x < Math.ceil(t * tw + tw / 2 + half); x++) r.set(x, y, y === h - 1 ? pack.roles.ui : pack.roles.hazard);
        }
      }
    } else {
      const top = kind === 'platform' ? pack.palette['sand']! : pack.palette['leaf']!;
      r.fill(0, 0, w, h, pack.palette['clay']!);
      r.fill(0, 0, w, Math.max(2, Math.floor(h / 4)), top);
      for (let i = 0; i < Math.floor((w * h) / 24); i++) r.set(rng.int(0, w - 1), rng.int(Math.floor(h / 4) + 1, h - 1), pack.palette['rust']!);
      for (let x = 0; x < w; x++) r.set(x, h - 1, pack.roles.ui);
    }
    return { ...common, generator: 'pixel-tile', payload: { format: 'rgba', pixels: r.pixels } };
  }
  let body = '';
  let defs = '';
  if (pack.rendering.mode === 'vector-glow') {
    defs = glowDefs('glow', 1.5);
    const stroke = kind === 'hazard' ? pack.roles.hazard : kind === 'platform' ? pack.roles.accentAlt : pack.roles.accent;
    body += `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="${pack.roles.surface}" stroke="${stroke}" stroke-width="2" filter="url(#glow)"/>`;
    const lines = rng.int(1, 3);
    for (let i = 1; i <= lines; i++) body += `<line x1="${f((w * i) / (lines + 1))}" y1="4" x2="${f((w * i) / (lines + 1))}" y2="${h - 4}" stroke="${pack.roles.shadow}" stroke-width="1"/>`;
    if (kind === 'hazard') body += `<polyline points="4,${h - 4} ${f(w / 2)},4 ${w - 4},${h - 4}" fill="none" stroke="${pack.roles.hazard}" stroke-width="2"/>`;
  } else {
    if (kind === 'hazard') {
      const teeth = 3;
      const tw = w / teeth;
      let pts = `0,${h}`;
      for (let t = 0; t < teeth; t++) pts += ` ${f(t * tw + tw / 2)},${f(h * (0.15 + rng.next() * 0.15))} ${f((t + 1) * tw)},${h}`;
      body += `<polygon points="${pts}" fill="${pack.roles.hazard}"/>`;
    } else {
      const fill = kind === 'platform' ? pack.roles.shadow : pack.roles.surface;
      body += `<rect x="0" y="0" width="${w}" height="${h}" rx="${f(w * 0.12)}" fill="${fill}"/>`;
      body += `<rect x="${f(w * 0.1)}" y="${f(h * 0.08)}" width="${f(w * 0.8)}" height="${f(h * 0.12)}" rx="${f(h * 0.06)}" fill="${pack.roles.background}" fill-opacity="0.18"/>`;
    }
  }
  return { ...common, generator: pack.rendering.mode === 'vector-glow' ? 'neon-tile' : 'soft-tile', payload: { format: 'svg', text: svgDoc(w, h, body, defs) } };
}

/** Smooth ridge line from seeded sine octaves. */
function ridge(rng: Rng, w: number, baseY: number, amp: number, steps: number): Array<[number, number]> {
  const octaves = [1, 2.3, 5.1].map((freq, i) => ({ freq, phase: rng.next() * Math.PI * 2, amp: amp / (i + 1) }));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    let y = baseY;
    for (const o of octaves) y += Math.sin((x / w) * Math.PI * 2 * o.freq + o.phase) * o.amp;
    pts.push([x, y]);
  }
  return pts;
}

function background(req: AssetRequest, pack: StylePack, rng: Rng): GeneratedAsset {
  const [w, h] = dims(req, 960, 540);
  const layers = Math.trunc(Number(req.params?.['layers'] ?? 4));
  if (!(layers >= 1 && layers <= 6)) throw new GameDNAError('INVALID_INPUT', 'params.layers must be 1..6');
  const common = { type: 'background' as const, styleId: pack.id, seed: req.seed, width: w, height: h, frames: 1, kind: 'scene', generatorVersion: GENERATOR_VERSION, license: pack.license };
  if (pack.rendering.mode === 'raster-pixel') {
    const r = new Raster(w, h);
    const bands = [pack.palette['sky']!, pack.palette['cream']!];
    for (let y = 0; y < h; y++) r.fill(0, y, w, 1, y < h * 0.55 ? bands[0]! : bands[1]!);
    const hills = [pack.palette['deep']!, pack.palette['moss']!, pack.palette['leaf']!].slice(0, Math.min(3, layers));
    hills.forEach((c, i) => {
      const line = ridge(rng, w, h * (0.5 + i * 0.13), h * 0.06, Math.max(8, Math.floor(w / 4)));
      for (const [x, y] of line) r.fill(Math.floor(x), Math.floor(y), 4, h - Math.floor(y), c);
    });
    return { ...common, generator: 'pixel-hills', payload: { format: 'rgba', pixels: r.pixels } };
  }
  if (pack.rendering.mode === 'vector-glow') {
    let body = `<rect width="${w}" height="${h}" fill="${pack.roles.background}"/>`;
    const horizon = h * 0.42;
    for (let i = 0; i < 60; i++) body += `<circle cx="${f(rng.next() * w)}" cy="${f(rng.next() * horizon)}" r="${f(0.6 + rng.next() * 1.4)}" fill="${pack.roles.foreground}" fill-opacity="${f(0.2 + rng.next() * 0.6)}"/>`;
    body += `<rect y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="${pack.roles.surface}"/>`;
    const cols = 12 + layers * 2;
    for (let i = 0; i <= cols; i++) {
      const xTop = w / 2 + ((i - cols / 2) / cols) * w * 0.3;
      const xBot = w / 2 + ((i - cols / 2) / cols) * w * 2.2;
      body += `<line x1="${f(xTop)}" y1="${f(horizon)}" x2="${f(xBot)}" y2="${h}" stroke="${pack.roles.shadow}" stroke-width="1"/>`;
    }
    for (let j = 1; j <= 8; j++) {
      const y = horizon + (h - horizon) * (j / 8) ** 2;
      body += `<line x1="0" y1="${f(y)}" x2="${w}" y2="${f(y)}" stroke="${pack.roles.shadow}" stroke-width="1"/>`;
    }
    body += `<line x1="0" y1="${f(horizon)}" x2="${w}" y2="${f(horizon)}" stroke="${pack.roles.accentAlt}" stroke-width="2" stroke-opacity="0.8"/>`;
    return { ...common, generator: 'neon-grid', payload: { format: 'svg', text: svgDoc(w, h, body) } };
  }
  // layered-minimal: sky gradient, then ridges that darken toward the viewer.
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pack.palette['ivory']}"/><stop offset="1" stop-color="${pack.palette['mist']}"/></linearGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  body += `<circle cx="${f(w * (0.6 + rng.next() * 0.25))}" cy="${f(h * (0.18 + rng.next() * 0.1))}" r="${f(h * 0.07)}" fill="${pack.palette['ember']}" fill-opacity="0.55"/>`;
  const tones = [pack.palette['fog']!, pack.palette['stone']!, pack.palette['slate']!, pack.palette['dusk']!, pack.palette['night']!, pack.palette['night']!];
  for (let i = 0; i < layers; i++) {
    const line = ridge(rng, w, h * (0.42 + i * (0.4 / layers)), h * (0.09 - i * 0.01), 48);
    const d = `M0,${h} ` + line.map(([x, y]) => `L${f(x)},${f(y)}`).join(' ') + ` L${w},${h} Z`;
    body += `<path d="${d}" fill="${tones[i]}"/>`;
  }
  return { ...common, generator: 'layered-ridges', payload: { format: 'svg', text: svgDoc(w, h, body, defs) } };
}

function icon(req: AssetRequest, pack: StylePack, _rng: Rng): GeneratedAsset {
  const kind = oneOf(req.params?.['kind'], ICON_KINDS, 'star', 'params.kind');
  const [w, h] = dims(req, 24, 24);
  const s = Math.min(w, h);
  const c = kind === 'heart' ? pack.roles.hazard : kind === 'exit' ? pack.roles.accentAlt : pack.roles.pickup;
  const glow = pack.rendering.mode === 'vector-glow';
  const defs = glow ? glowDefs('glow', s * 0.06) : '';
  const fx = glow ? ' filter="url(#glow)"' : '';
  const sw = f(Math.max(1, s * 0.09));
  let body = '';
  if (kind === 'key') {
    body = `<circle cx="${f(s * 0.32)}" cy="${f(s * 0.5)}" r="${f(s * 0.18)}" fill="none" stroke="${c}" stroke-width="${sw}"${fx}/><path d="M${f(s * 0.5)},${f(s * 0.5)} H${f(s * 0.9)} M${f(s * 0.78)},${f(s * 0.5)} V${f(s * 0.68)} M${f(s * 0.66)},${f(s * 0.5)} V${f(s * 0.64)}" stroke="${c}" stroke-width="${sw}" fill="none"${fx}/>`;
  } else if (kind === 'heart') {
    body = `<path d="M${f(s / 2)},${f(s * 0.85)} C${f(s * 0.05)},${f(s * 0.5)} ${f(s * 0.15)},${f(s * 0.1)} ${f(s / 2)},${f(s * 0.32)} C${f(s * 0.85)},${f(s * 0.1)} ${f(s * 0.95)},${f(s * 0.5)} ${f(s / 2)},${f(s * 0.85)} Z" fill="${c}"${fx}/>`;
  } else if (kind === 'exit') {
    body = `<rect x="${f(s * 0.22)}" y="${f(s * 0.1)}" width="${f(s * 0.56)}" height="${f(s * 0.8)}" rx="${f(s * 0.28)}" fill="none" stroke="${c}" stroke-width="${sw}"${fx}/><circle cx="${f(s * 0.62)}" cy="${f(s * 0.55)}" r="${f(s * 0.05)}" fill="${c}"/>`;
  } else {
    const pts: string[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
      const r = k % 2 === 0 ? s * 0.45 : s * 0.2;
      pts.push(`${f(s / 2 + Math.cos(a) * r)},${f(s / 2 + Math.sin(a) * r)}`);
    }
    body = `<polygon points="${pts.join(' ')}" fill="${c}"${fx}/>`;
  }
  return { type: 'icon', styleId: pack.id, seed: req.seed, width: w, height: h, frames: 1, kind, generator: 'glyph', generatorVersion: GENERATOR_VERSION, license: pack.license, payload: { format: 'svg', text: svgDoc(w, h, body, defs) } };
}

function particles(req: AssetRequest, pack: StylePack, rng: Rng): GeneratedAsset {
  const kind = String(req.params?.['kind'] ?? 'impact');
  const isPixel = pack.rendering.mode === 'raster-pixel';
  const isNeon = pack.rendering.mode === 'vector-glow';
  const def = {
    schema: 'gamedna.particles/v1',
    kind,
    shape: pack.feedback.particleShape,
    blend: isNeon ? 'add' : 'normal',
    count: isNeon ? rng.int(14, 22) : isPixel ? rng.int(5, 8) : rng.int(6, 10),
    speed: { min: isNeon ? 120 : 40, max: isNeon ? 320 : 110 },
    angle: { min: 0, max: 360 },
    lifetimeMs: { min: isNeon ? 180 : 260, max: isNeon ? 420 : 620 },
    gravity: isPixel ? 300 : 0,
    scale: { start: isPixel ? 1 : 0.9, end: isPixel ? 1 : 0 },
    quantizeToPixels: isPixel,
    colors: [pack.roles.accent, pack.roles.accentAlt, pack.roles.foreground],
    reducedMotion: { count: 3, speedMultiplier: 0.4 },
  };
  return { type: 'particles', styleId: pack.id, seed: req.seed, width: 0, height: 0, frames: 1, kind, generator: 'particle-def', generatorVersion: GENERATOR_VERSION, license: pack.license, payload: { format: 'json', text: `${JSON.stringify(def, null, 2)}\n` } };
}

function sfx(req: AssetRequest, pack: StylePack): GeneratedAsset {
  const kind = oneOf(req.params?.['kind'], SFX_KINDS, 'ui', 'params.kind') as SfxKind;
  const bytes = synthesizeSfx(kind, req.seed, pack.id);
  return { type: 'sfx', styleId: pack.id, seed: req.seed, width: 0, height: 0, frames: 1, kind, generator: 'sfx-synth', generatorVersion: GENERATOR_VERSION, license: pack.license, payload: { format: 'wav', bytes } };
}

export function generateAsset(req: AssetRequest): GeneratedAsset {
  const pack = getStylePack(req.styleId);
  if (!pack) throw new GameDNAError('NOT_FOUND', `Unknown style pack "${req.styleId}"`, { details: { available: STYLE_PACK_IDS } });
  if (!Number.isInteger(req.seed) || req.seed < 0 || req.seed > 2 ** 31 - 1) throw new GameDNAError('INVALID_INPUT', 'seed must be an integer in 0..2147483647');
  const rng = createRng(deriveSeed(req.seed, `${req.type}:${pack.id}`));
  switch (req.type) {
    case 'sprite':
      return sprite(req, pack, rng);
    case 'tile':
      return tile(req, pack, rng);
    case 'background':
      return background(req, pack, rng);
    case 'icon':
      return icon(req, pack, rng);
    case 'particles':
      return particles(req, pack, rng);
    case 'sfx':
      return sfx(req, pack);
    default:
      throw new GameDNAError('INVALID_INPUT', `Unknown asset type "${String((req as { type: unknown }).type)}"`, { details: { available: ASSET_TYPES } });
  }
}

export function fileExtension(asset: GeneratedAsset): string {
  switch (asset.payload.format) {
    case 'svg':
      return 'svg';
    case 'rgba':
      return 'png';
    case 'json':
      return 'json';
    case 'wav':
      return 'wav';
  }
}
