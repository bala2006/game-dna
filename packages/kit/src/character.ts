import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './random.js';
import type { Point3 } from './camera.js';

/** Landmark heights and widths as a share of standing height: Drillis and Contini (1966), as tabulated in Winter (2009). */
export const BODY_RATIOS = {
  eye: 0.936, chin: 0.87, shoulder: 0.818, elbow: 0.63, wrist: 0.485, fingertip: 0.377,
  hip: 0.53, knee: 0.285, ankle: 0.039, shoulderWidth: 0.259, hipWidth: 0.191, footLength: 0.152,
} as const;

export type ProportionStyle = 'realistic' | 'heroic' | 'stylized' | 'compact' | 'chibi';

/** Stature in head heights, and a width multiplier. */
export const PROPORTION_STYLES: Readonly<Record<ProportionStyle, { heads: number; build: number }>> = {
  realistic: { heads: 7.5, build: 1 },
  heroic: { heads: 8, build: 1.12 },
  stylized: { heads: 6, build: 1.05 },
  compact: { heads: 4, build: 1.15 },
  chibi: { heads: 2.5, build: 1.25 },
};

export interface HumanoidLayout {
  height: number;
  heads: number;
  head: number;
  /** Landmark heights above the ground in meters. */
  y: { top: number; eye: number; chin: number; neck: number; shoulder: number; elbow: number; wrist: number; fingertip: number; hip: number; knee: number; ankle: number };
  shoulderWidth: number;
  hipWidth: number;
  headSize: { w: number; h: number; d: number };
  radius: { upperArm: number; forearm: number; thigh: number; shin: number; neck: number };
  chest: { w: number; d: number };
  shoulderX: number;
  hipX: number;
  footLength: number;
  /** Collision capsule. */
  capsule: { radius: number; height: number };
}

/** Pure: landmarks for a stature and style. Below the chin, the measured shares are kept and scaled under the head. */
export function humanoidLayout({ height = 1.75, style = 'realistic', heads, build }: { height?: number; style?: ProportionStyle; heads?: number; build?: number } = {}): HumanoidLayout {
  const st = PROPORTION_STYLES[style];
  const H = height, nHeads = heads ?? st.heads, b = build ?? st.build;
  const head = H / nHeads, chin = H - head;
  const below = (f: number) => (f / BODY_RATIOS.chin) * chin;
  const y = {
    top: H, eye: H - head * 0.48, chin, neck: chin + head * 0.08, shoulder: below(BODY_RATIOS.shoulder), elbow: below(BODY_RATIOS.elbow),
    wrist: below(BODY_RATIOS.wrist), fingertip: below(BODY_RATIOS.fingertip), hip: below(BODY_RATIOS.hip), knee: below(BODY_RATIOS.knee), ankle: below(BODY_RATIOS.ankle),
  };
  const shoulderWidth = BODY_RATIOS.shoulderWidth * H * b, hipWidth = BODY_RATIOS.hipWidth * H * b;
  const limb = (k: number) => Math.max(k * H * b, head * 0.14);
  return {
    height: H, heads: nHeads, head, y, shoulderWidth, hipWidth,
    headSize: { w: head * 0.7, h: head, d: head * 0.85 },
    radius: { upperArm: limb(0.026), forearm: limb(0.021), thigh: limb(0.044), shin: limb(0.031), neck: limb(0.03) },
    chest: { w: shoulderWidth * 0.82, d: 0.13 * H * b },
    shoulderX: shoulderWidth / 2 - limb(0.026), hipX: hipWidth * 0.27,
    footLength: Math.max(BODY_RATIOS.footLength * H, head * 0.8),
    capsule: { radius: Math.max(0.25, shoulderWidth * 0.66), height: H },
  };
}

const runBlend = (speed: number) => smoothstep(2.0, 3.5, speed);
const legSwing = (speed: number) => smoothstep(0.05, 0.5, speed) * lerp(0.42, 0.85, runBlend(speed));

/** Stride length in meters at a speed, from leg length and swing. */
export function gaitStride(layout: HumanoidLayout, speed: number): number {
  return Math.max(0.3, 4 * layout.y.hip * Math.sin(legSwing(speed)) * (1 + 0.35 * runBlend(speed)));
}

/** Advances gait phase by distance travelled over stride, so feet do not slide. Phase is in [0, 1). */
export function advanceGait(phase: number, layout: HumanoidLayout, speed: number, dt: number): number {
  return (phase + (speed * dt) / gaitStride(layout, speed)) % 1;
}

export interface Pose {
  pelvisY: number;
  torsoPitch: number;
  torsoYaw: number;
  hipL: number; hipR: number; kneeL: number; kneeR: number; ankleL: number; ankleR: number;
  shoulderL: number; shoulderR: number; elbowL: number; elbowR: number;
  armSpread: number;
}

/** Pure: joint angles for idle, walk and run, blended by speed. Idle breathes at about 0.25 Hz. */
export function gaitPose(layout: HumanoidLayout, phase: number, speed: number, time = 0): Pose {
  const run = runBlend(speed), move = smoothstep(0.05, 0.5, speed);
  const hip0 = layout.y.hip - layout.radius.thigh * 0.5, l1 = hip0 - layout.y.knee, l2 = layout.y.knee - layout.y.ankle;
  const reach = (l1 + l2) * 0.999;
  const left = footTarget(layout, phase, speed), right = footTarget(layout, phase + 0.5, speed);
  const needed = (t: FootTarget) => t.y + Math.sqrt(Math.max(0, reach * reach - t.z * t.z)) - hip0;
  const pelvisY = Math.min(0, needed(left), needed(right)) - 0.04 * run;
  const hipY = hip0 + pelvisY;
  const leg = (t: FootTarget) => {
    const d = clamp(Math.hypot(t.z, hipY - t.y), 1e-4, l1 + l2 - 1e-4), forward = Math.atan2(t.z, hipY - t.y);
    const thighLead = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const knee = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    const hip = -(forward + thighLead);
    return { hip, knee, ankle: -t.pitch - hip - knee };
  };
  const L = leg(left), R = leg(right);
  const a = phase * Math.PI * 2, arm = move * lerp(0.3, 0.85, run), elbow = -(0.15 + lerp(0.15, 1.3, run) * move);
  return {
    pelvisY,
    torsoPitch: move * lerp(0.04, 0.2, run) + 0.012 * Math.sin(time * 1.7) * (1 - move),
    torsoYaw: -Math.cos(a) * 0.1 * move,
    hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, ankleL: L.ankle, ankleR: R.ankle,
    shoulderL: Math.cos(a) * arm, shoulderR: -Math.cos(a) * arm,
    elbowL: elbow, elbowR: elbow,
    armSpread: 0.07,
  };
}

/** Where one ankle should be relative to the hip, in the sagittal plane (z forward, y up from the ground). */
interface FootTarget { z: number; y: number; pitch: number }

/**
 * Stance plants the foot: heel strike, flat foot, then heel-off around the toe. The planted point
 * moves back relative to the hip at exactly body speed, because phase advances by distance.
 * Swing carries the foot forward on an arc. Each foot's phase starts at heel strike.
 */
function footTarget(layout: HumanoidLayout, phase: number, speed: number): FootTarget {
  const run = runBlend(speed), move = smoothstep(0.05, 0.5, speed);
  const stride = gaitStride(layout, speed), duty = lerp(0.6, 0.26, run);
  const span = (duty * stride) / 2, shift = lerp(0.1, 0.14, run);
  const ah = layout.y.ankle, heel = layout.footLength * 0.2, toe = layout.footLength * 0.8;
  const heelPitch = 0.25 * move, toePitch = lerp(0.6, 0.9, run) * move;
  const rotate = (z: number, y: number, p: number) => [z * Math.cos(p) - y * Math.sin(p), z * Math.sin(p) + y * Math.cos(p)] as const;
  const stance = (s: number): FootTarget => {
    const planted = (span * (1 - 2 * s) - shift) * move;
    if (s < 0.15) {
      const p = heelPitch * (1 - smoothstep(0, 0.15, s)), [z, y] = rotate(-heel, -ah, p);
      return { z: planted - heel - z, y: -y, pitch: p };
    }
    if (s > 0.55) {
      const p = -toePitch * smoothstep(0.55, 1, s), [z, y] = rotate(toe, -ah, p);
      return { z: planted + toe - z, y: -y, pitch: p };
    }
    return { z: planted, y: ah, pitch: 0 };
  };
  const u = ((phase % 1) + 1) % 1;
  if (u < duty) return stance(u / duty);
  const s = (u - duty) / (1 - duty), from = stance(1), to = stance(0), k = 0.5 - 0.5 * Math.cos(Math.PI * s);
  return {
    z: lerp(from.z, to.z, k),
    y: lerp(from.y, to.y, k) + lerp(0.07, 0.18, run) * move * Math.sin(Math.PI * s),
    pitch: lerp(from.pitch, to.pitch, k),
  };
}

export interface HumanoidColors {
  skin?: THREE.ColorRepresentation;
  top?: THREE.ColorRepresentation;
  bottom?: THREE.ColorRepresentation;
  shoe?: THREE.ColorRepresentation;
  hair?: THREE.ColorRepresentation;
}

export function humanoidMaterials({ skin = 0xc68e6a, top = 0x35506b, bottom = 0x2b2b30, shoe = 0x18181a, hair = 0x2a1d14 }: HumanoidColors = {}) {
  const m = (color: THREE.ColorRepresentation, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  return { skin: m(skin, 0.6), top: m(top), bottom: m(bottom), shoe: m(shoe, 0.5), hair: m(hair, 0.9) };
}

type Side = 'L' | 'R';
export type JointName = 'pelvis' | 'torso' | 'neck' | 'head' | `${'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle'}${Side}`;

/**
 * root (ground, yaw) > pelvis > torso > neck > head, torso > shoulder > elbow > wrist,
 * pelvis > hip > knee > ankle. Each joint is a group at the joint; meshes hang from it.
 * L is the character's own left (+x when facing +z).
 */
export interface HumanoidRig {
  root: THREE.Group;
  joints: Record<JointName, THREE.Group>;
  layout: HumanoidLayout;
  materials: ReturnType<typeof humanoidMaterials>;
  /** `eye` is the first-person camera mount, in root space. */
  mounts: { eye: Point3 };
}

export function buildHumanoid(layout: HumanoidLayout = humanoidLayout(), colors: HumanoidColors = {}): HumanoidRig {
  const L = layout, M = humanoidMaterials(colors), y = L.y, joints = {} as Record<JointName, THREE.Group>;
  const group = (name: JointName, parent: THREE.Object3D, x: number, yy: number, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, yy, z);
    parent.add(g);
    joints[name] = g;
    return g;
  };
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, yy = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, yy, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const limb = (parent: THREE.Object3D, radius: number, length: number, mat: THREE.Material) =>
    mesh(parent, new THREE.CapsuleGeometry(radius, Math.max(0.001, length - 2 * radius), 4, 10), mat, 0, -length / 2);

  const root = new THREE.Group();
  const pelvis = group('pelvis', root, 0, y.hip);
  mesh(pelvis, new THREE.SphereGeometry(1, 16, 10), M.bottom, 0, -0.01).scale.set(L.hipWidth / 2, (y.hip - y.knee) * 0.22, L.chest.d * 0.48);
  const torso = group('torso', pelvis, 0, 0);
  const chestLen = y.shoulder - y.hip;
  mesh(torso, new THREE.CapsuleGeometry(0.5, 1, 4, 14), M.top, 0, chestLen * 0.55).scale.set(L.chest.w, chestLen * 0.5, L.chest.d);
  const neck = group('neck', torso, 0, y.neck - y.hip - L.radius.neck);
  mesh(neck, new THREE.CylinderGeometry(L.radius.neck, L.radius.neck * 1.1, L.radius.neck * 2.4, 10), M.skin, 0, L.radius.neck * 0.6);
  const head = group('head', neck, 0, y.chin - (y.neck - L.radius.neck));
  mesh(head, new THREE.SphereGeometry(0.5, 20, 14), M.skin, 0, L.head / 2).scale.set(L.headSize.w, L.headSize.h, L.headSize.d);
  mesh(head, new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, L.head * 0.53, -L.head * 0.03)
    .scale.set(L.headSize.w * 1.06, L.headSize.h * 1.02, L.headSize.d * 1.06);
  mesh(head, new THREE.BoxGeometry(L.headSize.w * 0.12, L.head * 0.16, L.head * 0.12), M.skin, 0, L.head * 0.4, L.headSize.d * 0.47);

  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const shoulder = group(`shoulder${s}`, torso, side * L.shoulderX, y.shoulder - y.hip - L.radius.upperArm * 0.4);
    limb(shoulder, L.radius.upperArm, y.shoulder - y.elbow, M.top);
    const elbow = group(`elbow${s}`, shoulder, 0, -(y.shoulder - y.elbow));
    limb(elbow, L.radius.forearm, y.elbow - y.wrist, M.skin);
    const wrist = group(`wrist${s}`, elbow, 0, -(y.elbow - y.wrist));
    mesh(wrist, new THREE.BoxGeometry(L.radius.forearm * 1.6, (y.wrist - y.fingertip) * 0.9, L.radius.forearm * 2.4), M.skin, 0, -(y.wrist - y.fingertip) * 0.45);
    const hip = group(`hip${s}`, pelvis, side * L.hipX, -L.radius.thigh * 0.5);
    limb(hip, L.radius.thigh, y.hip - L.radius.thigh * 0.5 - y.knee, M.bottom);
    const knee = group(`knee${s}`, hip, 0, -(y.hip - L.radius.thigh * 0.5 - y.knee));
    limb(knee, L.radius.shin, y.knee - y.ankle, M.bottom);
    const ankle = group(`ankle${s}`, knee, 0, -(y.knee - y.ankle));
    mesh(ankle, new THREE.BoxGeometry(L.radius.shin * 2.1, y.ankle * 1.6, L.footLength), M.shoe, 0, -y.ankle * 0.2, L.footLength * 0.3);
  }
  return { root, joints, layout: L, materials: M, mounts: { eye: { x: 0, y: y.eye, z: L.headSize.d * 0.3 } } };
}

export function applyPose(rig: HumanoidRig, pose: Pose): void {
  const j = rig.joints;
  j.pelvis.position.y = rig.layout.y.hip + pose.pelvisY;
  j.torso.rotation.set(pose.torsoPitch, pose.torsoYaw, 0);
  j.head.rotation.set(-pose.torsoPitch * 0.6, -pose.torsoYaw * 0.8, 0);
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    j[`hip${s}`].rotation.x = pose[`hip${s}`];
    j[`knee${s}`].rotation.x = pose[`knee${s}`];
    j[`ankle${s}`].rotation.x = pose[`ankle${s}`];
    j[`shoulder${s}`].rotation.set(pose[`shoulder${s}`], 0, side * pose.armSpread);
    j[`elbow${s}`].rotation.x = pose[`elbow${s}`];
  }
}

/** Advances the gait and poses the rig for this frame. Returns the new phase. */
export function animateHumanoid(rig: HumanoidRig, phase: number, speed: number, dt: number, time = 0): number {
  const next = advanceGait(phase, rig.layout, speed, dt);
  applyPose(rig, gaitPose(rig.layout, next, speed, time));
  return next;
}

/** Hides the head for a first-person view, so it never fills the near plane. */
export function setFirstPersonView(rig: HumanoidRig, on: boolean): void {
  rig.joints.head.visible = !on;
}
