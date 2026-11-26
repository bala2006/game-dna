import * as THREE from 'three';
import { VIEW_PRESETS, createCameraRig, type MountView } from '@gamedna/kit/camera';
import { animateHumanoid, buildHumanoid, humanoidLayout, setFirstPersonView } from '@gamedna/kit/character';
import { BINDINGS, TOUCH_LAYOUTS, createInput, measureTouchLayout, type Bindings } from '@gamedna/kit/input';
import { exposeDevHook, onPageHidden, runFixedStep } from '@gamedna/kit/loop';
import { createStage, hsv } from '@gamedna/kit/stage';
import { MARKERS, buildLayout } from './layout.js';
import { buildScenery } from './scenery.js';
import { DT, TUNE, WalkSim } from './sim.js';
import { CONTRACTS } from './contracts.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 11) >>> 0;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

const stage = createStage({
  sunDirection: new THREE.Vector3(0.45, 0.62, -0.64).normalize(),
  zenith: new THREE.Color(0.16, 0.32, 0.66),
  horizon: new THREE.Color(0.66, 0.73, 0.82),
  sunColor: new THREE.Color(1.0, 0.93, 0.82),
  cloudCover: 0.7,
  fog: 0.0045,
  sunIntensity: 3.2,
  shadowExtent: 30,
  exposure: 1.0,
  environmentIntensity: 0.7,
  fov: 62,
  far: 1500,
  vignette: 0.28,
  quality: params.get('quality') === 'low' ? 'low' : 'high',
});
const layout = buildLayout(SEED);
const scenery = buildScenery(stage, layout);
const sim = new WalkSim(layout);
const hero = buildHumanoid(humanoidLayout({ height: 1.75, style: 'realistic' }), { top: hsv(18, 0.62, 0.62), bottom: 0x2d3440, hair: 0x3a2a1c });
stage.scene.add(hero.root);
let heroPhase = 0;

const ON_FOOT = { ...BINDINGS.onFoot, buttons: { ...BINDINGS.onFoot.buttons, reset: { keys: ['KeyR'], pad: [8] } } } satisfies Bindings;
const input = createInput({ element: stage.canvas, bindings: ON_FOOT, touchLayout: TOUCH_LAYOUTS.onFoot, onDevice: () => updateHint() });
function updateHint(): void {
  const p = (a: string) => input.prompt(a);
  $('hint').textContent = input.device === 'touch' ? '' : input.device === 'gamepad'
    ? `Left stick move, right stick look, ${p('jump')} jump, ${p('sprint')} run, ${p('interact')} collect, ${p('camera')} view`
    : `WASD move, click to look with the mouse, ${p('jump')} jump, ${p('sprint')} run, ${p('interact')} collect, ${p('camera')} view, ${p('pause')} pause`;
  $('again').textContent = input.device === 'touch' ? 'Tap pause, then reload to walk again' : `Press ${p('reset')} to walk again`;
}
updateHint();

const ray = new THREE.Raycaster();
const rig = createCameraRig(stage.camera, {
  views: [VIEW_PRESETS.shoulder, VIEW_PRESETS.firstPerson],
  ground: layout.height,
  occlude: (from, dir, far) => { ray.set(from, dir); ray.far = far; return ray.intersectObjects(scenery.occluders, true)[0]?.distance ?? null; },
  onChange: (view) => {
    const fp = view.kind === 'mount' && (view as MountView).interior === true;
    setFirstPersonView(hero, fp);
    $('view').textContent = view.name.toUpperCase();
    $('dot').style.display = fp ? 'block' : 'none';
  },
});
$('view').textContent = rig.view.name.toUpperCase();

const showPaused = () => { $('paused').style.display = sim.state.paused ? 'flex' : 'none'; };
onPageHidden(() => { sim.pause(); showPaused(); });
let noticeTimer = 0;
function notice(text: string): void {
  const n = $('notice');
  n.textContent = text;
  n.style.opacity = '1';
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (n.style.opacity = '0'), 1100);
}
const clockText = (ticks: number) => { const t = ticks * DT, m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
function reset(): void {
  sim.reset();
  layout.markers.forEach((_, i) => scenery.setCollected(i, false));
  $('card').style.display = 'none';
  showPaused();
}

let cameraYaw = layout.start.facing;
function tick(): void {
  const f = input.sample();
  if (f.pressed.has('pause')) { sim.togglePause(); showPaused(); }
  if (f.pressed.has('camera')) rig.next();
  if (f.pressed.has('reset')) reset();
  sim.step({
    moveX: f.axes.moveX ?? 0,
    moveY: f.axes.moveY ?? 0,
    sprint: f.held.has('sprint'),
    jump: f.pressed.has('jump'),
    interact: f.pressed.has('interact'),
    cameraYaw,
    faceCamera: rig.view.kind === 'mount',
  });
}

const velocity = { x: 0, z: 0 };
let clock = 0;
function render(alpha: number, dt: number): void {
  clock += dt;
  for (const e of sim.drainEvents()) {
    if (e.type === 'collect') { scenery.setCollected(e.index, true); notice(`${e.count}/${MARKERS}`); }
    if (e.type === 'finish') { notice('ALL FOUND'); $('total').textContent = clockText(e.ticks); $('card').style.display = 'block'; }
  }
  const p = sim.player, q = p.prev, paused = sim.state.paused;
  const x = q.x + (p.x - q.x) * alpha, y = q.y + (p.y - q.y) * alpha, z = q.z + (p.z - q.z) * alpha;
  hero.root.position.set(x, y, z);
  hero.root.rotation.y = q.facing + Math.atan2(Math.sin(p.facing - q.facing), Math.cos(p.facing - q.facing)) * alpha;
  const speed = paused ? 0 : Math.hypot(p.vx, p.vz);
  heroPhase = animateHumanoid(hero, heroPhase, p.grounded ? speed : 0, dt, clock);
  for (const w of scenery.walkers) {
    const walk = paused ? 0 : w.speed;
    w.s = (w.s + walk * dt) % layout.trail.total;
    const at = layout.trail.at(w.s, 0.55);
    w.rig.root.position.set(at.x, layout.height(at.x, at.z), at.z);
    w.rig.root.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
    w.phase = animateHumanoid(w.rig, w.phase, walk, dt, clock + w.s);
  }
  velocity.x = p.vx;
  velocity.z = p.vz;
  cameraYaw = rig.update(dt, { object: hero.root, mounts: hero.mounts, velocity, speed, topSpeed: TUNE.sprint }, input.takeLook(dt)).heading;

  const near = sim.markerInReach(), prompt = $('prompt');
  prompt.style.display = near >= 0 && sim.state.finishTicks === null ? 'block' : 'none';
  if (near >= 0) prompt.textContent = `${input.prompt('interact')} collect`;
  $('count').textContent = `${sim.state.count}/${MARKERS}`;
  $('time').textContent = clockText(sim.state.finishTicks ?? sim.state.tick);
  stage.render(dt, { x, y, z });
}

exposeDevHook({
  get state() {
    const p = sim.player;
    return {
      x: p.x, y: p.y, z: p.z, facing: p.facing, speed: Math.hypot(p.vx, p.vz), grounded: p.grounded, view: rig.view.name, cameraYaw,
      camera: stage.camera.position.toArray(), headVisible: hero.joints.head.visible, device: input.device, paused: sim.state.paused,
      eye: hero.layout.y.eye, count: sim.state.count, finished: sim.state.finishTicks !== null, markers: layout.markers.length,
    };
  },
  input,
  touchLayout: () => measureTouchLayout(),
  setView: (i: number) => rig.setView(i),
  standAtMarker(i: number) { const m = layout.markers[i]; if (m) sim.teleport(m.x + 0.6, m.z); },
});

runFixedStep({ hz: CONTRACTS.simulation.hz, maxStepsPerFrame: CONTRACTS.simulation.maxStepsPerFrame, tick, render });
