/**
 * Three original GameDNA style packs. Each pack is a visual language, not a color swap:
 * rendering mode, scale, typography, camera, motion and feedback all differ.
 */
export interface StylePack {
  id: 'pixel-adventure' | 'neon-arcade' | 'layered-minimal';
  name: string;
  summary: string;
  license: string;
  palette: Record<string, string>;
  roles: {
    background: string;
    surface: string;
    foreground: string;
    accent: string;
    accentAlt: string;
    hazard: string;
    pickup: string;
    ui: string;
    shadow: string;
  };
  typography: {
    family: string;
    display: string;
    bodyWeight: number;
    displayWeight: number;
    hudSizePx: number;
    titleSizePx: number;
    letterSpacingPx: number;
    transform: 'none' | 'uppercase';
  };
  scale: { tilePx: number; spritePx: number; pixelScale: number };
  rendering: { mode: 'raster-pixel' | 'vector-glow' | 'vector-soft'; antialias: boolean; roundPixels: boolean };
  camera: { follow: 'snap' | 'damped' | 'locked'; lerp: number; shakeMaxPx: number; zoom: number };
  motion: { easing: string; animationFps: number; uiTransitionMs: number; idleBobPx: number };
  feedback: { particleShape: 'square' | 'spark' | 'soft-dot'; flash: 'none' | 'additive' | 'tint'; squash: number; notes: string };
  recipes: string[];
  generators: Array<'sprite' | 'tile' | 'background' | 'icon' | 'particles' | 'sfx'>;
}

const LICENSE = 'MIT, original GameDNA work (procedurally generated)';

export const STYLE_PACKS: Record<StylePack['id'], StylePack> = {
  'pixel-adventure': {
    id: 'pixel-adventure',
    name: 'Pixel Adventure',
    summary: 'Chunky 12-color raster art at integer scale, stepped animation and snappy pixel-snapped camera.',
    license: LICENSE,
    palette: {
      ink: '#1d1626',
      plum: '#3b2a4a',
      moss: '#3f6b3a',
      leaf: '#7fb04a',
      sand: '#e8c872',
      clay: '#b86b3c',
      rust: '#7a3a2a',
      sky: '#8fc8e8',
      deep: '#2f5f8a',
      cream: '#f4ecd8',
      rose: '#d9576b',
      gold: '#f2a93b',
    },
    roles: { background: '#8fc8e8', surface: '#3f6b3a', foreground: '#f4ecd8', accent: '#f2a93b', accentAlt: '#7fb04a', hazard: '#d9576b', pickup: '#f2a93b', ui: '#1d1626', shadow: '#3b2a4a' },
    typography: { family: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace', display: 'ui-monospace, Menlo, Consolas, monospace', bodyWeight: 400, displayWeight: 700, hudSizePx: 14, titleSizePx: 40, letterSpacingPx: 1, transform: 'uppercase' },
    scale: { tilePx: 16, spritePx: 12, pixelScale: 3 },
    rendering: { mode: 'raster-pixel', antialias: false, roundPixels: true },
    camera: { follow: 'snap', lerp: 1, shakeMaxPx: 3, zoom: 3 },
    motion: { easing: 'steps(4)', animationFps: 8, uiTransitionMs: 120, idleBobPx: 1 },
    feedback: { particleShape: 'square', flash: 'tint', squash: 0.2, notes: 'One-frame squash on land, square dust puffs, 2-3 frame white tint on hit.' },
    recipes: [
      'Render at native resolution and scale by an integer; never use fractional zoom.',
      'Keep sprites to 3-4 colors plus the ink outline so silhouettes read at 12 px.',
      'Animate at 8 fps on a stepped curve; keep physics at the full tick rate.',
      'Use the ink color for outlines and UI text so contrast stays above 7:1 on sky.',
    ],
    generators: ['sprite', 'tile', 'background', 'icon', 'particles', 'sfx'],
  },
  'neon-arcade': {
    id: 'neon-arcade',
    name: 'Neon Arcade',
    summary: 'Glowing geometric vector shapes on a near-black field, additive feedback and fast easing.',
    license: LICENSE,
    palette: {
      void: '#0a0612',
      night: '#170d2b',
      grid: '#2a1b4f',
      cyan: '#22e6ff',
      magenta: '#ff2bd6',
      lime: '#b6ff3b',
      amber: '#ffb21f',
      white: '#f4f7ff',
      violet: '#8a5cff',
      red: '#ff3b5c',
    },
    roles: { background: '#0a0612', surface: '#170d2b', foreground: '#f4f7ff', accent: '#22e6ff', accentAlt: '#ff2bd6', hazard: '#ff3b5c', pickup: '#b6ff3b', ui: '#f4f7ff', shadow: '#2a1b4f' },
    typography: { family: 'system-ui, "Segoe UI", Roboto, sans-serif', display: '"Arial Black", system-ui, sans-serif', bodyWeight: 600, displayWeight: 900, hudSizePx: 16, titleSizePx: 56, letterSpacingPx: 4, transform: 'uppercase' },
    scale: { tilePx: 32, spritePx: 28, pixelScale: 1 },
    rendering: { mode: 'vector-glow', antialias: true, roundPixels: false },
    camera: { follow: 'locked', lerp: 1, shakeMaxPx: 10, zoom: 1 },
    motion: { easing: 'cubic-out', animationFps: 60, uiTransitionMs: 160, idleBobPx: 0 },
    feedback: { particleShape: 'spark', flash: 'additive', squash: 0, notes: 'Additive sparks, short white flash, screen shake capped and disabled by reduced motion.' },
    recipes: [
      'Give every actor a distinct hue: player cyan, enemies magenta/red, pickups lime.',
      'Draw shapes as 2-3 px strokes with a blurred copy underneath for glow.',
      'Keep the field dark and uncluttered; the grid stays at low contrast so actors read first.',
      'Cap shake at 10 px and offer reduced motion; never flash the full screen faster than 3 Hz.',
    ],
    generators: ['sprite', 'tile', 'background', 'icon', 'particles', 'sfx'],
  },
  'layered-minimal': {
    id: 'layered-minimal',
    name: 'Layered Minimal',
    summary: 'Muted layered silhouettes with atmospheric depth, soft shapes and slow damped motion.',
    license: LICENSE,
    palette: {
      mist: '#e9e4dc',
      fog: '#cfc7bb',
      stone: '#9c958c',
      slate: '#5e6670',
      dusk: '#3a4250',
      night: '#23272f',
      ember: '#e07a4f',
      sage: '#8fa58c',
      ivory: '#faf7f2',
      wine: '#8a3b55',
    },
    roles: { background: '#e9e4dc', surface: '#3a4250', foreground: '#23272f', accent: '#e07a4f', accentAlt: '#8fa58c', hazard: '#8a3b55', pickup: '#e07a4f', ui: '#23272f', shadow: '#5e6670' },
    typography: { family: 'Georgia, "Iowan Old Style", "Times New Roman", serif', display: 'Georgia, serif', bodyWeight: 400, displayWeight: 400, hudSizePx: 16, titleSizePx: 48, letterSpacingPx: 6, transform: 'uppercase' },
    scale: { tilePx: 32, spritePx: 24, pixelScale: 1 },
    rendering: { mode: 'vector-soft', antialias: true, roundPixels: false },
    camera: { follow: 'damped', lerp: 0.12, shakeMaxPx: 4, zoom: 1 },
    motion: { easing: 'sine-in-out', animationFps: 30, uiTransitionMs: 400, idleBobPx: 2 },
    feedback: { particleShape: 'soft-dot', flash: 'none', squash: 0.12, notes: 'Soft dust motes, gentle squash and stretch, color shifts instead of flashes.' },
    recipes: [
      'Build depth from 3-4 background layers that lighten toward the horizon (atmospheric perspective).',
      'Reserve the single warm accent (ember) for the player and goals so they read instantly.',
      'Use hazard wine with a shape cue (spikes), not color alone.',
      'Prefer slow, damped camera follow and long UI fades; avoid hard shake.',
    ],
    generators: ['sprite', 'tile', 'background', 'icon', 'particles', 'sfx'],
  },
};

export type StylePackId = StylePack['id'];
export const STYLE_PACK_IDS = Object.keys(STYLE_PACKS) as StylePackId[];

export function getStylePack(id: string): StylePack | undefined {
  return (STYLE_PACKS as Record<string, StylePack>)[id];
}

export function paletteSet(pack: StylePack): Set<string> {
  return new Set(Object.values(pack.palette).map((c) => c.toLowerCase()));
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
