import type { Rng } from '@gamedna/kit/random';
import { TUNE } from './sim.js';

/** Two detuned oscillators through a low-pass filter for the engine, and a noise burst for barrier hits. Starts on the first gesture. */
export function createEngineSound(rng: Rng) {
  let audio: { ctx: AudioContext; gain: GainNode; a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode } | null = null, muted = false;
  return {
    start() {
      if (audio) return;
      const ctx = new AudioContext(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      gain.gain.value = 0;
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const a = ctx.createOscillator(), b = ctx.createOscillator();
      a.type = 'sawtooth';
      b.type = 'square';
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      a.start();
      b.start();
      audio = { ctx, gain, a, b, filter };
    },
    toggleMute() { muted = !muted; },
    update(rpm: number, speed: number, paused: boolean) {
      if (!audio) return;
      const t = audio.ctx.currentTime, f = 30 + rpm * 210;
      audio.a.frequency.setTargetAtTime(f, t, 0.05);
      audio.b.frequency.setTargetAtTime(f / 2, t, 0.05);
      audio.filter.frequency.setTargetAtTime(400 + rpm * 1600, t, 0.08);
      audio.gain.gain.setTargetAtTime(muted || paused ? 0 : 0.03 + rpm * 0.035 + Math.min(1, speed / TUNE.top) * 0.01, t, 0.08);
    },
    thud(power: number) {
      if (!audio || muted) return;
      const { ctx } = audio, len = Math.floor(ctx.sampleRate * 0.25), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * (1 - i / len) ** 3;
      const src = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.value = 0.25 + 0.5 * power;
      src.buffer = buf;
      src.connect(lp);
      lp.connect(g);
      g.connect(ctx.destination);
      src.start();
    },
  };
}
