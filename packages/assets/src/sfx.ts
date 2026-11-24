import { createRng, deriveSeed } from '@gamedna/core';

export const SFX_KINDS = ['jump', 'land', 'hit', 'pickup', 'explosion', 'pulse', 'ui', 'death', 'win'] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

export const SFX_SAMPLE_RATE = 22_050;

interface Voice {
  wave: 'sine' | 'square' | 'saw' | 'triangle' | 'noise';
  startHz: number;
  endHz: number;
  gain: number;
  attackS: number;
  decayS: number;
  delayS?: number;
}

/** Original recipes per effect. Style packs nudge timbre: pixel = square, neon = saw, minimal = sine. */
function recipe(kind: SfxKind, style: string, jitter: () => number): { durationS: number; voices: Voice[] } {
  const tone: Voice['wave'] = style === 'pixel-adventure' ? 'square' : style === 'neon-arcade' ? 'saw' : 'sine';
  const j = (hz: number) => hz * (1 + jitter() * 0.06);
  switch (kind) {
    case 'jump':
      return { durationS: 0.16, voices: [{ wave: tone, startHz: j(320), endHz: j(720), gain: 0.35, attackS: 0.005, decayS: 0.15 }] };
    case 'land':
      return { durationS: 0.09, voices: [{ wave: 'noise', startHz: 0, endHz: 0, gain: 0.3, attackS: 0.002, decayS: 0.08 }, { wave: 'sine', startHz: j(120), endHz: j(60), gain: 0.4, attackS: 0.002, decayS: 0.08 }] };
    case 'hit':
      return { durationS: 0.14, voices: [{ wave: 'noise', startHz: 0, endHz: 0, gain: 0.35, attackS: 0.001, decayS: 0.09 }, { wave: tone, startHz: j(220), endHz: j(80), gain: 0.3, attackS: 0.001, decayS: 0.13 }] };
    case 'pickup':
      return { durationS: 0.22, voices: [{ wave: 'triangle', startHz: j(880), endHz: j(880), gain: 0.3, attackS: 0.004, decayS: 0.09 }, { wave: 'triangle', startHz: j(1320), endHz: j(1320), gain: 0.3, attackS: 0.004, decayS: 0.12, delayS: 0.08 }] };
    case 'explosion':
      return { durationS: 0.45, voices: [{ wave: 'noise', startHz: 0, endHz: 0, gain: 0.5, attackS: 0.003, decayS: 0.42 }, { wave: 'sine', startHz: j(90), endHz: j(35), gain: 0.4, attackS: 0.003, decayS: 0.4 }] };
    case 'pulse':
      return { durationS: 0.2, voices: [{ wave: tone, startHz: j(900), endHz: j(180), gain: 0.3, attackS: 0.002, decayS: 0.19 }] };
    case 'death':
      return { durationS: 0.5, voices: [{ wave: tone, startHz: j(440), endHz: j(110), gain: 0.32, attackS: 0.005, decayS: 0.48 }] };
    case 'win':
      return {
        durationS: 0.6,
        voices: [523, 659, 784].map((hz, i) => ({ wave: 'triangle' as const, startHz: j(hz), endHz: j(hz), gain: 0.25, attackS: 0.01, decayS: 0.25, delayS: i * 0.12 })),
      };
    case 'ui':
    default:
      return { durationS: 0.06, voices: [{ wave: 'sine', startHz: j(660), endHz: j(660), gain: 0.3, attackS: 0.002, decayS: 0.055 }] };
  }
}

/** Synthesize a 16-bit mono PCM WAV deterministically from kind, seed and style. */
export function synthesizeSfx(kind: SfxKind, seed: number, style: string): Uint8Array {
  const rng = createRng(deriveSeed(seed, `sfx:${kind}:${style}`));
  const { durationS, voices } = recipe(kind, style, () => rng.next() * 2 - 1);
  const n = Math.ceil(durationS * SFX_SAMPLE_RATE);
  const samples = new Float64Array(n);
  for (const v of voices) {
    let phase = 0;
    const delay = Math.floor((v.delayS ?? 0) * SFX_SAMPLE_RATE);
    let lowpass = 0;
    for (let i = delay; i < n; i++) {
      const t = (i - delay) / SFX_SAMPLE_RATE;
      const env = t < v.attackS ? t / v.attackS : Math.max(0, 1 - (t - v.attackS) / v.decayS);
      if (env <= 0) continue;
      const progress = Math.min(1, t / Math.max(0.001, v.attackS + v.decayS));
      const hz = v.startHz + (v.endHz - v.startHz) * progress;
      phase += hz / SFX_SAMPLE_RATE;
      phase -= Math.floor(phase);
      let s: number;
      switch (v.wave) {
        case 'sine':
          s = Math.sin(phase * Math.PI * 2);
          break;
        case 'square':
          s = phase < 0.5 ? 1 : -1;
          break;
        case 'saw':
          s = phase * 2 - 1;
          break;
        case 'triangle':
          s = 1 - 4 * Math.abs(phase - 0.5);
          break;
        case 'noise':
          lowpass += (rng.next() * 2 - 1 - lowpass) * 0.35;
          s = lowpass;
          break;
      }
      samples[i] = (samples[i] ?? 0) + s * env * v.gain;
    }
  }
  const dataBytes = n * 2;
  const out = new Uint8Array(44 + dataBytes);
  const dv = new DataView(out.buffer);
  const ascii = (o: number, str: string) => {
    for (let i = 0; i < str.length; i++) out[o + i] = str.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, SFX_SAMPLE_RATE, true);
  dv.setUint32(28, SFX_SAMPLE_RATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    dv.setInt16(44 + i * 2, Math.round(v * 32_000), true);
  }
  return out;
}
