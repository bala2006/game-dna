import fc from 'fast-check';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as core from '@gamedna/core/prng';
import { FixedStepClock as StarterClock } from '@gamedna/starter';
import { VIEW_PRESETS, createCameraRig } from '../src/camera.js';
import { BODY_RATIOS, PROPORTION_STYLES, animateHumanoid, buildHumanoid, gaitStride, humanoidLayout, type ProportionStyle } from '../src/character.js';
import { BINDINGS, TOUCH_LAYOUTS, auditTouchLayout, createRawState, promptLabel, radialDeadzone, resolveFrame, resolveLook, touchLayoutRects } from '../src/input.js';
import { FixedStepClock } from '../src/loop.js';
import { createNoise, createRng, deriveSeed } from '../src/random.js';
import { CAR_PRESETS, buildCar, carLayout, measureCar, type CarPreset } from '../src/vehicle.js';
import { createHeightField, createPathIndex, pathFrames, ribbonGeometry, scatter, type GroundPoint } from '../src/world.js';

describe('random', () => {
  it('imports only its own modules and three, so power/kit can ship it verbatim', () => {
    const dir = path.join(import.meta.dirname, '../src');
    for (const file of readdirSync(dir)) {
      for (const [, spec] of readFileSync(path.join(dir, file), 'utf8').matchAll(/(?:from|import)\s*'([^']+)'/g)) {
        expect(/^\.\/[a-z]+\.js$|^three$|^three\/addons\//.test(spec ?? ''), `${file} imports ${spec}`).toBe(true);
      }
    }
  });

  it('is the one PRNG GameDNA uses: core and starter re-export it', () => {
    expect(core.createRng).toBe(createRng);
    expect(core.deriveSeed).toBe(deriveSeed);
    expect(StarterClock).toBe(FixedStepClock);
  });

  it('repeats a stream for a seed and stays in range', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const a = createRng(seed), b = createRng(seed);
      for (let i = 0; i < 20; i++) {
        const v = a.next();
        expect(v).toBe(b.next());
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }));
  });

  it('gives tileable noise in [0, 1)', () => {
    const n = createNoise(5);
    fc.assert(fc.property(fc.double({ min: -500, max: 500, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true }), (x, y) => {
      const v = n.fbm(x, y, 3, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(n.value(x, y, 1, 16)).toBeCloseTo(n.value(x + 16, y + 16, 1, 16), 9);
    }));
  });
});

describe('loop', () => {
  it('reports how far into the next tick it is', () => {
    const c = new FixedStepClock(60, 5);
    expect(c.advance(25)).toBe(1);
    expect(c.alpha).toBeCloseTo((25 - 1000 / 60) / (1000 / 60), 6);
    fc.assert(fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), (ms) => {
      const k = new FixedStepClock(60, 5);
      k.advance(ms);
      expect(k.alpha).toBeGreaterThanOrEqual(0);
      expect(k.alpha).toBeLessThan(1);
    }));
  });
});

describe('input', () => {
  it('counts a key tapped and released between two samples', () => {
    const raw = createRawState();
    raw.taps.add('KeyC');
    expect(resolveFrame(BINDINGS.driving, raw).held.has('camera')).toBe(true);
  });

  it('combines keys, pad and touch into one axis, clamped', () => {
    const raw = createRawState();
    raw.keys.add('KeyD');
    raw.pad = { axes: [0.8, 0, 0, 0], buttons: Array.from({ length: 17 }, () => 0) };
    expect(resolveFrame(BINDINGS.driving, raw).axes.steer).toBe(1);
    raw.keys.clear();
    raw.pad = null;
    raw.touch.stick.y = 0.5;
    expect(resolveFrame(BINDINGS.onFoot, raw).axes.moveY).toBeCloseTo(0.5, 9);
  });

  it('applies a radial deadzone and rescales to the full range', () => {
    expect(radialDeadzone(0.1, 0.05)).toEqual([0, 0]);
    const [x] = radialDeadzone(1, 0);
    expect(x).toBeCloseTo(1, 9);
  });

  it('turns look input into radians, with invert-Y', () => {
    const raw = createRawState();
    raw.look.x = 100;
    raw.look.y = 50;
    const look = resolveLook({ look: { mouse: 0.002, invertY: true } }, raw, 1 / 60);
    expect(look.x).toBeCloseTo(0.2, 9);
    expect(look.y).toBeCloseTo(-0.1, 9);
  });

  it('labels prompts per device', () => {
    expect(promptLabel(BINDINGS.driving, 'throttle', 'keyboard')).toBe('W');
    expect(promptLabel(BINDINGS.driving, 'throttle', 'gamepad')).toBe('RT');
    expect(promptLabel(BINDINGS.onFoot, 'jump', 'touch', { jump: 'JUMP' })).toBe('JUMP');
  });

  it.each(Object.keys(BINDINGS) as (keyof typeof BINDINGS)[])('%s bindings reach every touch control they name', (name) => {
    const ids = new Set<string>([...TOUCH_LAYOUTS[name].buttons.map((b) => b.id), 'stickX', 'stickY']);
    const named = [...Object.values(BINDINGS[name].axes), ...Object.values(BINDINGS[name].buttons)].map((b) => b.touch).filter((t): t is string => !!t);
    for (const t of named) expect(ids, `${name} binds missing touch control ${t}`).toContain(t);
  });

  it.each(Object.keys(TOUCH_LAYOUTS) as (keyof typeof TOUCH_LAYOUTS)[])('%s touch layout fits phones in landscape', (name) => {
    for (const [w, h] of [[667, 375], [844, 390], [932, 430]] as const) {
      expect(auditTouchLayout({ controls: touchLayoutRects(TOUCH_LAYOUTS[name], { w, h }), viewport: { w, h } }), `${w}x${h}`).toEqual([]);
    }
  });

  it('reports small, crowded, off-screen and HUD-covering controls', () => {
    const issues = auditTouchLayout({
      viewport: { w: 844, h: 390 },
      controls: [{ id: 'a', x: 10, y: 10, w: 40, h: 60 }, { id: 'b', x: 55, y: 10, w: 60, h: 60 }, { id: 'c', x: 820, y: 300, w: 60, h: 60 }],
      avoid: [{ id: '#hud', x: 0, y: 0, w: 120, h: 30 }],
    }).join('\n');
    expect(issues).toMatch(/a is 40x60/);
    expect(issues).toMatch(/a and b are 5 px apart/);
    expect(issues).toMatch(/c leaves the screen/);
    expect(issues).toMatch(/b covers #hud/);
  });
});

describe('vehicle', () => {
  it.each(Object.keys(CAR_PRESETS) as CarPreset[])('%s layout places axles, wheels and track from the spec', (preset) => {
    const spec = CAR_PRESETS[preset], lay = carLayout(spec);
    expect(lay.frontAxle - lay.rearAxle).toBeCloseTo(spec.wheelbase, 6);
    expect(lay.half - lay.frontAxle).toBeCloseTo(spec.frontOverhang, 6);
    expect(spec.wheelbase / spec.length).toBeGreaterThan(0.55);
    for (const w of lay.wheels) expect(w.y).toBeCloseTo(spec.wheelDiameter / 2, 6);
    expect(lay.track).toBeCloseTo(spec.width - spec.tireWidth - 0.04, 6);
  });

  it.each(Object.keys(CAR_PRESETS) as CarPreset[])('%s body measures within 2%% of its spec, wherever the car stands', (preset) => {
    const view = buildCar({ preset });
    view.root.position.set(40, 0, -12);
    view.root.rotation.y = 0.7;
    const size = measureCar(view), spec = CAR_PRESETS[preset];
    for (const k of ['length', 'width', 'height'] as const) expect(Math.abs(size[k] / spec[k] - 1), k).toBeLessThan(0.02);
  });

  it('puts the cockpit eye inside the cabin, under the roof', () => {
    const lay = carLayout(CAR_PRESETS.sedan);
    expect(lay.eye.y).toBeGreaterThan(lay.belt);
    expect(lay.eye.y).toBeLessThan((lay.roof(lay.eye.z) ?? 0) - 0.05);
    expect(lay.eye.z).toBeGreaterThan(lay.cabinRearZ);
  });
});

describe('character', () => {
  it('puts realistic landmarks within 1% of the measured shares', () => {
    const lay = humanoidLayout({ height: 1.8, style: 'realistic' });
    for (const k of ['eye', 'shoulder', 'elbow', 'hip', 'knee'] as const) expect(Math.abs(lay.y[k] / 1.8 / BODY_RATIOS[k] - 1), k).toBeLessThan(0.01);
  });

  it.each(Object.keys(PROPORTION_STYLES) as ProportionStyle[])('%s style keeps the head count and joint order', (style) => {
    const lay = humanoidLayout({ height: 1.75, style });
    expect(1.75 / lay.head).toBeCloseTo(PROPORTION_STYLES[style].heads, 6);
    const order = [lay.y.top, lay.y.eye, lay.y.chin, lay.y.shoulder, lay.y.elbow, lay.y.hip, lay.y.knee, lay.y.ankle, 0];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1] ?? 0);
  });

  it('strides about 1.5 m walking and 3-3.8 m running at 1.75 m tall', () => {
    const lay = humanoidLayout({ height: 1.75 });
    expect(gaitStride(lay, 1.4)).toBeGreaterThan(1.35);
    expect(gaitStride(lay, 1.4)).toBeLessThan(1.65);
    expect(gaitStride(lay, 5)).toBeGreaterThan(3);
    expect(gaitStride(lay, 5)).toBeLessThan(3.8);
  });

  it('exposes the eye mount at the layout eye height', () => {
    const rig = buildHumanoid(humanoidLayout({ height: 1.7 }));
    expect(rig.mounts.eye.y).toBeCloseTo(rig.layout.y.eye, 9);
  });

  it.each([[1.0, 0.15], [1.4, 0.15], [2.0, 0.15], [5.0, 0.04]])('plants each foot at %s m/s: heel, then toe, slide under 2 cm', (speed, minContact) => {
    const rig = buildHumanoid(humanoidLayout({ height: 1.75 })), dt = 1 / 240, lay = rig.layout;
    const heelAt = new THREE.Vector3(), toeAt = new THREE.Vector3();
    let phase = 0, z = 0, worst = 0, lowest = Infinity;
    const contact: Record<string, number> = { heelL: 0, toeL: 0, heelR: 0, toeR: 0 };
    const start: Record<string, number | null> = { heelL: null, toeL: null, heelR: null, toeR: null };
    for (let i = 0; i < 2400; i++) {
      z += speed * dt;
      rig.root.position.set(0, 0, z);
      phase = animateHumanoid(rig, phase, speed, dt);
      rig.root.updateMatrixWorld(true);
      for (const s of ['L', 'R'] as const) {
        const ankle = rig.joints[`ankle${s}`];
        ankle.localToWorld(heelAt.set(0, -lay.y.ankle, -lay.footLength * 0.2));
        ankle.localToWorld(toeAt.set(0, -lay.y.ankle, lay.footLength * 0.8));
        for (const [name, p] of [[`heel${s}`, heelAt], [`toe${s}`, toeAt]] as const) {
          if (i < 480) continue;
          lowest = Math.min(lowest, p.y);
          if (p.y < 0.004) { contact[name] = (contact[name] ?? 0) + 1; start[name] ??= p.z; worst = Math.max(worst, Math.abs(p.z - (start[name] ?? p.z))); } else start[name] = null;
        }
      }
    }
    expect(lowest).toBeGreaterThan(-0.005);
    for (const [name, frames] of Object.entries(contact)) expect(frames / 1920, ` touches the ground`).toBeGreaterThan(minContact);
    expect(worst).toBeLessThan(0.02);
  });
});
describe('camera', () => {
  const target = () => {
    const object = new THREE.Object3D();
    object.position.set(10, 0, 5);
    return { object, mounts: { eye: { x: 0.3, y: 1.1, z: 0.2 } }, speed: 0, topSpeed: 50 };
  };

  it('puts the chase view behind and above the target, and recenters after look input', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000), rig = createCameraRig(camera, { views: [VIEW_PRESETS.chase] }), t = target();
    for (let i = 0; i < 120; i++) rig.update(1 / 60, t);
    expect(camera.position.z).toBeLessThan(5 - 5);
    expect(camera.position.y).toBeGreaterThan(1.5);
    rig.update(1 / 60, t, { x: 0.8, y: 0 });
    expect(Math.abs(camera.position.x - 10)).toBeGreaterThan(2);
    for (let i = 0; i < 300; i++) rig.update(1 / 60, t);
    expect(Math.abs(camera.position.x - 10)).toBeLessThan(0.1);
  });

  it('cuts to a mount view at the mount and sets the near plane per view', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000), t = target();
    const rig = createCameraRig(camera, { views: [VIEW_PRESETS.chase, VIEW_PRESETS.cockpit] });
    expect(camera.near).toBe(0.25);
    rig.next();
    rig.update(1 / 60, t);
    expect(rig.view.name).toBe('Cockpit');
    expect(camera.near).toBe(0.05);
    expect(camera.position.distanceTo(new THREE.Vector3(10.3, 1.1, 5.2))).toBeLessThan(1e-6);
    rig.next();
    expect(camera.near).toBe(0.25);
  });

  it('returns an absolute yaw in first person that follows look input', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 1000), rig = createCameraRig(camera, { views: [VIEW_PRESETS.firstPerson] });
    const t = target(), a = rig.update(1 / 60, t).heading, b = rig.update(1 / 60, t, { x: 0.5, y: 0 }).heading;
    expect(b - a).toBeCloseTo(-0.5, 9);
  });
});

describe('world', () => {
  const square: GroundPoint[] = [];
  for (let i = 0; i < 400; i++) {
    const t = (i % 100) / 100, side = Math.floor(i / 100);
    square.push([{ x: -50 + 100 * t, z: -50 }, { x: 50, z: -50 + 100 * t }, { x: 50 - 100 * t, z: 50 }, { x: -50, z: 50 - 100 * t }][side] as GroundPoint);
  }

  it('measures distance to a path and places points along and beside it', () => {
    expect(createPathIndex(square).nearest(0, -40).distance).toBeCloseTo(10, 6);
    const frames = pathFrames(square);
    expect(frames.total).toBeCloseTo(400, 6);
    const left = frames.offset(50, 5);
    expect(left.x).toBeCloseTo(0, 6);
    expect(Math.abs(left.z + 50)).toBeCloseTo(5, 6);
    const mid = frames.at(150);
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.z).toBeCloseTo(0, 6);
    expect(frames.at(550).x).toBeCloseTo(frames.at(150).x, 6);
  });

  it('keeps the ground flat along the path and hilly away from it', () => {
    const height = createHeightField({ noise: createNoise(3), path: createPathIndex(square), flatWidth: 8, blend: 40, hills: { amplitude: 30, scale: 120 }, floor: -100 });
    for (const [x, z] of [[0, -50], [50, 10], [-20, 54], [-55, 0]] as const) expect(height(x, z)).toBeCloseTo(0, 9);
    const far = [0, 1, 2, 3, 4].map((i) => Math.abs(height(200 + i * 37, 260 - i * 41)));
    expect(Math.max(...far)).toBeGreaterThan(1);
  });

  it('scatters points no closer than the spacing and only where accepted', () => {
    const pts = scatter({ rng: createRng(7), count: 300, bounds: [0, 0, 100, 100], spacing: 4, accept: (x) => x > 20 });
    expect(pts.length).toBeGreaterThan(150);
    for (const [i, a] of pts.entries()) {
      expect(a.x).toBeGreaterThan(20);
      for (const b of pts.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(4);
    }
  });

  it('builds a ribbon with one quad per kept segment', () => {
    const frames = pathFrames(square), g = ribbonGeometry(frames, { from: -2, to: 2, skip: (i) => i % 2 === 1 });
    expect(g.getAttribute('position').count).toBe(200 * 4);
    expect(g.getIndex()?.count).toBe(200 * 6);
  });
});
