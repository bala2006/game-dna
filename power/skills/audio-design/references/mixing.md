# Bus graph, limiter, voices and ducking

## A mixer for any engine

```ts
// check: compile
import { onFirstGesture, onPageHidden } from '@gamedna/kit/loop';

export function createMixer() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);
  const bus = (gain: number) => { const g = ctx.createGain(); g.gain.value = gain; g.connect(master); return g; };
  const buses = { sfx: bus(0.8), ui: bus(0.6), music: bus(0.45), ambience: bus(0.5) };

  // Touch activation arrives on pointerup, which onFirstGesture does not listen to.
  const resume = () => { if (ctx.state !== 'running') void ctx.resume(); };
  onFirstGesture(resume);
  addEventListener('pointerup', resume);
  onPageHidden(() => void ctx.suspend());

  /** Lowers music by `db` (negative) with about 60 ms attack, holds `holdS`, then releases over about 500 ms. */
  function duck(db: number, holdS: number): void {
    const t = ctx.currentTime, g = buses.music.gain, base = 0.45;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(base * 10 ** (db / 20), t, 0.02);
    g.setTargetAtTime(base, t + holdS, 0.17);
  }
  return { ctx, buses, duck };
}
```

`setTargetAtTime` reaches 95 percent after three time constants, so 0.02 gives a 60 ms attack and 0.17 a 500 ms release.

## Voice limits

Keep a small list of live sources per sound key. Before starting one, drop it if the newest copy started under 40 ms ago, and stop the oldest with a 5 ms gain ramp if the list is full (3 or 4). When several copies of one sound would start in the same tick, play one and raise its gain by about 3 dB instead.

## Pause and menus

On pause, ramp the world buses (sfx, ambience) down by 10 to 15 dB over 150 ms, or pause their loops; keep the UI bus untouched so menu clicks still sound. Restore over the same time on resume.

## Adaptive layers

Load all layers of a piece as buffers, start them with one `start(when)` time so they stay aligned, and give each its own gain on the music bus. Cross-fade on the next bar line: `nextBar = start + Math.ceil((ctx.currentTime - start) / barS) * barS`. A 120 bpm piece in 4/4 has `barS = 2`.

## Measuring

Record a capture of play and run `ffmpeg -i capture.wav -af ebur128 -f null -`. Read the momentary `M:` values at each event and compare the peaks with the ambient bed.
