import * as THREE from 'three';
import { VIEW_PRESETS, createCameraRig, type MountView } from '@gamedna/kit/camera';
import { animateHumanoid, applyPose, buildHumanoid, gaitPose, humanoidLayout } from '@gamedna/kit/character';
import { BINDINGS, TOUCH_LAYOUTS, createInput, measureTouchLayout, type Bindings } from '@gamedna/kit/input';
import { exposeDevHook, onFirstGesture, onPageHidden, runFixedStep } from '@gamedna/kit/loop';
import { createRng, deriveSeed } from '@gamedna/kit/random';
import { createStage, hsv } from '@gamedna/kit/stage';
import { animateCar, buildCar, measureCar, setCockpitView } from '@gamedna/kit/vehicle';
import { createEngineSound } from './audio.js';
import { createEffects } from './effects.js';
import { buildScenery } from './scenery.js';
import { LAPS, RaceSim, TUNE, autoControls, drivetrain, formatTicks, type Controls } from './sim.js';
import { buildTrack } from './track.js';
import { CONTRACTS } from './contracts.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 4) >>> 0;
const AUTO = params.has('auto');
const $ = (id: string) => document.getElementById(id) as HTMLElement;

const stage = createStage({
  sunDirection: new THREE.Vector3(-0.55, 0.34, -0.76).normalize(),
  quality: params.get('quality') === 'low' ? 'low' : 'high',
});
const track = buildTrack(SEED);
const scenery = buildScenery(stage, track);
const sim = new RaceSim(track);
const fxRng = createRng(deriveSeed(SEED, 'fx'));

const paintRng = createRng(deriveSeed(SEED, 'paint'));
const carView = buildCar({ preset: 'coupe', paint: hsv(paintRng.range(-12, 10), 0.85, 0.55) });
stage.scene.add(carView.root);
const driver = buildHumanoid(humanoidLayout({ height: 1.75 }), { top: 0x2d3a4a, bottom: 0x22252b });
{
  const lay = carView.layout, dl = driver.layout;
  driver.root.position.set(lay.driverX, lay.eye.y - dl.y.eye, lay.eye.z + 0.02);
  applyPose(driver, { ...gaitPose(dl, 0, 0), hipL: -1.45, hipR: -1.45, kneeL: 1.25, kneeR: 1.25, ankleL: 0.1, ankleR: 0.1, shoulderL: -0.95, shoulderR: -0.95, elbowL: -0.45, elbowR: -0.45, torsoPitch: -0.12 });
  carView.interior.add(driver.root);
}

const DRIVING = {
  ...BINDINGS.driving,
  buttons: { ...BINDINGS.driving.buttons, newTrack: { keys: ['KeyN'] }, mute: { keys: ['KeyM'] } },
} satisfies Bindings;
const input = createInput({ element: stage.canvas, bindings: DRIVING, touchLayout: TOUCH_LAYOUTS.driving, onDevice: () => updateHint() });
function updateHint(): void {
  const p = (a: string) => input.prompt(a);
  $('hint').textContent = input.device === 'touch' ? '' : input.device === 'gamepad'
    ? `${p('throttle')} throttle, ${p('brake')} brake, stick to steer, ${p('drift')} drift, ${p('camera')} camera, right stick to look`
    : `${p('throttle')}/${p('brake')} throttle and brake, ${p('steer')} steer, ${p('drift')} drift, ${p('camera')} camera, click to look with the mouse, ${p('pause')} pause`;
  $('again').textContent = input.device === 'touch' ? 'Tap RESET to race again' : `Press ${p('reset')} to race again, ${p('newTrack')} for a new track`;
}
updateHint();

let viewTimer = 0;
const rig = createCameraRig(stage.camera, {
  views: [VIEW_PRESETS.chase, VIEW_PRESETS.chaseFar, VIEW_PRESETS.hood, VIEW_PRESETS.cockpit],
  ground: scenery.cameraGround,
  onChange: (view) => {
    const inside = view.kind === 'mount' && (view as MountView).interior === true;
    setCockpitView(carView, inside);
    driver.joints.head.visible = !inside;
    const v = $('view');
    v.textContent = view.name.toUpperCase();
    v.style.opacity = '1';
    clearTimeout(viewTimer);
    viewTimer = window.setTimeout(() => (v.style.opacity = '0'), 1400);
  },
});

const sound = createEngineSound(fxRng);
const effects = createEffects(stage.scene, scenery, carView, fxRng);
onFirstGesture(() => sound.start());
onPageHidden(() => { sim.pause(); showPaused(); });

const showPaused = () => { $('paused').style.display = sim.race.paused ? 'flex' : 'none'; };
let noticeTimer = 0;
function notice(text: string): void {
  const n = $('notice');
  n.textContent = text;
  n.style.opacity = '1';
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (n.style.opacity = '0'), 1100);
}
function reset(): void {
  sim.reset();
  effects.clear();
  $('card').style.display = 'none';
  showPaused();
}

function tick(): void {
  const frame = input.sample();
  if (frame.pressed.has('reset')) reset();
  if (frame.pressed.has('camera')) rig.next();
  if (frame.pressed.has('mute')) sound.toggleMute();
  if (frame.pressed.has('newTrack')) { params.set('seed', String(SEED + 1)); location.search = params.toString(); }
  if (frame.pressed.has('pause')) { sim.togglePause(); showPaused(); }
  if (frame.pressed.size) sound.start();
  const controls: Controls = AUTO ? autoControls(sim) : {
    steer: -(frame.axes.steer ?? 0),
    throttle: Math.max(0, frame.axes.throttle ?? 0),
    brake: Math.max(0, frame.axes.brake ?? 0),
    drift: frame.held.has('drift'),
  };
  sim.step(controls);
}

const carVel = { x: 0, z: 0 };
let clock = 0, shake = 0;
function render(alpha: number, dt: number): void {
  clock += dt;
  const { car, race } = sim;
  for (const e of sim.drainEvents()) {
    if (e.type === 'notice') notice(e.text);
    if (e.type === 'hit') { shake = Math.max(shake, 0.25 * e.power); sound.thud(e.power); }
    if (e.type === 'finish') {
      notice('FINISH');
      $('total').textContent = formatTicks(race.laps.reduce((a, b) => a + b, 0));
      $('cardBest').textContent = formatTicks(race.best);
      window.setTimeout(() => { if (sim.race.phase === 'finished') $('card').style.display = 'block'; }, 900);
    }
  }

  const x = car.prev.x + (car.x - car.prev.x) * alpha, z = car.prev.z + (car.z - car.prev.z) * alpha;
  const h = car.prev.h + Math.atan2(Math.sin(car.h - car.prev.h), Math.cos(car.h - car.prev.h)) * alpha, speed = Math.abs(car.vf);
  carView.root.position.set(x, 0, z);
  carView.root.rotation.y = h;
  animateCar(carView, { steerAngle: car.steer * TUNE.maxWheel, speed: race.paused ? 0 : car.vf, lateralAccel: car.latAccel, longitudinalAccel: car.accel, braking: car.braking }, dt);
  carView.body.position.y = carView.layout.spec.height * 0.42 + (car.offroad ? (fxRng.next() - 0.5) * 0.02 * Math.min(1, speed / 10) : 0);

  shake *= Math.exp(-dt * 6);
  carVel.x = car.vx;
  carVel.z = car.vz;
  rig.update(dt, { object: carView.root, mountObject: carView.shell, mounts: carView.mounts, velocity: carVel, speed, topSpeed: TUNE.top }, input.takeLook(dt));
  const rumble = (car.offroad ? 0.03 * Math.min(1, speed / 15) : 0) + shake, cam = stage.camera.position;
  if (rumble > 0.001) { cam.x += (fxRng.next() - 0.5) * rumble; cam.y += (fxRng.next() - 0.5) * rumble; }

  effects.update(dt, sim);
  for (const c of scenery.crew) {
    let walk = 0;
    if (c.walk && !race.paused) {
      c.along += c.dir * c.walk * dt;
      if (Math.abs(c.along) > 9) { c.along = Math.sign(c.along) * 9; c.dir = c.dir > 0 ? -1 : 1; }
      walk = c.walk;
      const o = track.frames.offset(c.k, c.offset), t = track.frames.tangents[c.k] ?? { x: 0, z: 1 };
      c.rig.root.position.set(o.x + t.x * c.along, 0, o.z + t.z * c.along);
      c.rig.root.rotation.y = Math.atan2(t.x, t.z) + (c.dir > 0 ? 0 : Math.PI);
    }
    c.phase = animateHumanoid(c.rig, c.phase, walk, dt, clock + c.k);
  }
  const gear = drivetrain(car.vf);
  sound.update(gear.rpm, speed, race.paused);

  $('lap').textContent = `${Math.min(race.lap, LAPS)}/${LAPS}`;
  $('time').textContent = formatTicks(race.phase === 'racing' ? race.tick - race.lapStart : race.phase === 'finished' ? race.laps.at(-1) : 0);
  $('best').textContent = formatTicks(race.best);
  $('speed').textContent = String(Math.round(speed * 3.6));
  $('gear').textContent = gear.gear;
  $('rpmFill').style.width = `${Math.round(gear.rpm * 100)}%`;
  stage.render(dt, { x, y: 0, z }, { x: x + Math.sin(h) * 20, y: 0, z: z + Math.cos(h) * 20 });
}

exposeDevHook({
  get state() {
    const { car, race } = sim;
    return {
      phase: race.phase, lap: race.lap, laps: [...race.laps], idx: race.idx, speed: Math.abs(car.vf), steer: car.steer, offroad: car.offroad, slip: car.slip,
      paused: race.paused, car: [car.x, car.z], heading: car.h, view: rig.view.name, device: input.device, camera: stage.camera.position.toArray(), fov: stage.camera.fov,
    };
  },
  input,
  carSize: () => ({ ...measureCar(carView), spec: carView.layout.spec }),
  touchLayout: () => measureTouchLayout(),
  setView: (i: number) => rig.setView(i),
});

runFixedStep({ hz: CONTRACTS.simulation.hz, maxStepsPerFrame: CONTRACTS.simulation.maxStepsPerFrame, tick, render });
