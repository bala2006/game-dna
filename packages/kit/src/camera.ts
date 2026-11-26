import * as THREE from 'three';
import { clamp, ease, smoothstep, wrapAngle } from './random.js';

interface ViewBase {
  name: string;
  /** Vertical field of view in degrees at rest and at top speed. */
  fov: readonly [number, number];
  /** Pitch limits in radians, down then up. */
  pitch?: readonly [number, number];
  /** Seconds without look input before the view swings back. */
  recenter?: number;
}
/** Behind the target, lagging its heading: chase cameras. */
export interface FollowView extends ViewBase { kind: 'follow'; distance: number; height: number; lookAhead: number; lookHeight: number; lag: number }
/** Fixed to a mount point on the target: hood, cockpit, first person. `free` makes yaw absolute. */
export interface MountView extends ViewBase { kind: 'mount'; mount: string; lookAhead: number; yaw?: number; free?: boolean; interior?: boolean }
/** Orbits a pivot above the target, offset over one shoulder: third person. */
export interface OrbitView extends ViewBase { kind: 'orbit'; distance: number; height: number; shoulder: number; lag: number }
/** Fixed angle from above: top-down. */
export interface FixedView extends ViewBase { kind: 'fixed'; distance: number; angle: number }
export type ViewPreset = FollowView | MountView | OrbitView | FixedView;

export const VIEW_PRESETS = {
  chase: { name: 'Chase', kind: 'follow', distance: 6.2, height: 1.9, lookAhead: 4, lookHeight: 1.0, lag: 0.14, fov: [60, 74], recenter: 1.0, pitch: [-0.35, 0.5] },
  chaseFar: { name: 'Chase far', kind: 'follow', distance: 9.5, height: 3.1, lookAhead: 5, lookHeight: 0.9, lag: 0.2, fov: [56, 68], recenter: 1.0, pitch: [-0.35, 0.5] },
  hood: { name: 'Hood', kind: 'mount', mount: 'hood', fov: [64, 76], lookAhead: 30, recenter: 0.8, yaw: 1.2, pitch: [-0.4, 0.4] },
  cockpit: { name: 'Cockpit', kind: 'mount', mount: 'eye', interior: true, fov: [62, 70], lookAhead: 30, recenter: 0.8, yaw: 1.9, pitch: [-0.6, 0.5] },
  shoulder: { name: 'Third person', kind: 'orbit', distance: 3.4, height: 1.55, shoulder: 0.45, lag: 0.07, fov: [60, 66], pitch: [-1.0, 0.75], recenter: 2.0 },
  firstPerson: { name: 'First person', kind: 'mount', mount: 'eye', interior: true, fov: [72, 72], lookAhead: 10, free: true, pitch: [-1.45, 1.45] },
  topDown: { name: 'Top down', kind: 'fixed', distance: 22, angle: 1.05, fov: [45, 45] },
} as const satisfies Record<string, ViewPreset>;

export interface Point3 { x: number; y: number; z: number }

export interface CameraTarget {
  object: THREE.Object3D;
  /** The object mount points are relative to. Defaults to `object`. Use a body that rolls, so the view rolls with it. */
  mountObject?: THREE.Object3D;
  mounts?: Readonly<Record<string, Point3>>;
  velocity?: { x: number; z: number };
  speed?: number;
  topSpeed?: number;
}

export interface CameraRig {
  readonly view: ViewPreset;
  readonly index: number;
  readonly views: readonly ViewPreset[];
  setView(next: number | string): void;
  next(): void;
  /**
   * Call once per rendered frame. Returns the yaw the player looks along, for camera-relative
   * movement: pass it into the next tick as input.
   */
  update(dt: number, target: CameraTarget, look?: { x: number; y: number }): { view: ViewPreset; heading: number; pitch: number };
}

const isMount = (v: ViewPreset): v is MountView => v.kind === 'mount';

/**
 * Drives a perspective camera through a list of views. Cuts into and out of mount views, blends
 * between outside views over 0.35 s, and sets the near plane for each view.
 */
export function createCameraRig(camera: THREE.PerspectiveCamera, {
  views = [VIEW_PRESETS.chase],
  start = 0,
  ground = null,
  occlude = null,
  near = { outside: 0.25, inside: 0.05 },
  onChange = null,
}: {
  views?: readonly ViewPreset[];
  start?: number;
  /** Terrain height at a point; outside views stay 0.35 m above it. */
  ground?: ((x: number, z: number) => number) | null;
  /** Distance to the first blocker along a ray, or null. Orbit and follow views pull in in front of it. */
  occlude?: ((from: THREE.Vector3, dir: THREE.Vector3, far: number) => number | null) | null;
  near?: { outside: number; inside: number };
  onChange?: ((view: ViewPreset, index: number) => void) | null;
} = {}): CameraRig {
  if (views.length === 0) throw new Error('createCameraRig needs at least one view');
  let index = clamp(start, 0, views.length - 1), yawOff = 0, pitch = 0, idle = 0, pullIn = 1, fov = camera.fov;
  let smoothYaw: number | null = null, orbitYaw: number | null = null, blendT = 1, fresh = true;
  const blendFrom = new THREE.Vector3(), blendLook = new THREE.Vector3();
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), center = new THREE.Vector3(), pivot = new THREE.Vector3();
  const right = new THREE.Vector3(), back = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3();
  const viewAt = (i: number) => views[i] as ViewPreset;
  const applyNear = (v: ViewPreset) => { camera.near = isMount(v) ? near.inside : near.outside; camera.updateProjectionMatrix(); };
  applyNear(viewAt(index));

  function setView(next: number | string): void {
    const i = typeof next === 'number' ? ((next % views.length) + views.length) % views.length : views.findIndex((v) => v.name === next);
    if (i < 0 || i === index) return;
    const from = viewAt(index), to = viewAt(i);
    if (!isMount(from) && !isMount(to)) {
      blendT = 0;
      blendFrom.copy(pos).sub(center);
      blendLook.copy(look).sub(center);
    } else blendT = 1;
    index = i;
    yawOff = 0;
    pitch = 0;
    orbitYaw = null;
    fresh = true;
    applyNear(to);
    onChange?.(to, i);
  }

  function update(dt: number, target: CameraTarget, lookInput = { x: 0, y: 0 }) {
    const v = viewAt(index), obj = target.object;
    obj.updateWorldMatrix(true, false);
    center.setFromMatrixPosition(obj.matrixWorld);
    fwd.set(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(q));
    const heading = Math.atan2(fwd.x, fwd.z), speed = target.speed ?? 0, topSpeed = target.topSpeed ?? 1;
    const free = isMount(v) && v.free === true;
    idle = Math.abs(lookInput.x) + Math.abs(lookInput.y) > 1e-5 ? 0 : idle + dt;
    smoothYaw ??= heading;
    if (fresh) { if (free) yawOff = heading; fresh = false; }
    smoothYaw += wrapAngle(heading - smoothYaw) * ease(dt, v.kind === 'follow' || v.kind === 'orbit' ? v.lag : 0.12);

    let yawOut = heading;
    if (v.kind === 'orbit') {
      orbitYaw ??= heading;
      orbitYaw -= lookInput.x;
      if (idle > (v.recenter ?? Infinity) && speed > 0.5) orbitYaw += wrapAngle(heading - orbitYaw) * ease(dt, 0.6);
      yawOut = orbitYaw;
    } else if (free) yawOff -= lookInput.x;
    else yawOff = clamp(yawOff - lookInput.x, -((isMount(v) ? v.yaw : undefined) ?? 1.5), (isMount(v) ? v.yaw : undefined) ?? 1.5);
    pitch = clamp(pitch - lookInput.y, v.pitch?.[0] ?? -1.2, v.pitch?.[1] ?? 1.2);
    if (!free && v.kind !== 'orbit' && idle > (v.recenter ?? Infinity)) { const k = ease(dt, 0.35); yawOff -= yawOff * k; pitch -= pitch * k; }

    if (v.kind === 'mount') {
      const local = target.mounts?.[v.mount] ?? { x: 0, y: 1.6, z: 0 };
      pos.set(local.x, local.y, local.z);
      (target.mountObject ?? obj).localToWorld(pos);
      const yaw = free ? yawOff : heading + yawOff;
      yawOut = yaw;
      look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(v.lookAhead).add(pos);
    } else if (v.kind === 'orbit') {
      const yaw = orbitYaw ?? heading;
      pivot.copy(center).y += v.height;
      right.set(-Math.cos(yaw), 0, Math.sin(yaw));
      back.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      pos.copy(pivot).addScaledVector(right, v.shoulder);
      let dist = v.distance;
      const hit = occlude?.(pos, back, v.distance);
      if (hit !== null && hit !== undefined) dist = Math.max(0.4, hit - 0.2);
      pullIn = dist < pullIn * v.distance ? dist / v.distance : pullIn + (1 - pullIn) * ease(dt, 0.3);
      look.copy(pos).addScaledVector(back, -4);
      pos.addScaledVector(back, v.distance * Math.min(pullIn, dist / v.distance));
    } else if (v.kind === 'fixed') {
      pos.set(center.x, center.y + Math.sin(v.angle) * v.distance, center.z - Math.cos(v.angle) * v.distance);
      look.copy(center);
      yawOut = 0;
    } else {
      const yaw = smoothYaw + yawOff, dist = v.distance + speed * 0.02;
      yawOut = heading + yawOff;
      pos.set(center.x - Math.sin(yaw) * dist, center.y + v.height + Math.sin(-pitch) * dist * 0.6, center.z - Math.cos(yaw) * dist);
      look.set(center.x + Math.sin(smoothYaw) * v.lookAhead + (target.velocity?.x ?? 0) * 0.06, center.y + v.lookHeight, center.z + Math.cos(smoothYaw) * v.lookAhead + (target.velocity?.z ?? 0) * 0.06);
      if (occlude) {
        dir.copy(pos).sub(look).normalize();
        const full = pos.distanceTo(look), hit = occlude(look, dir, full);
        if (hit !== null && hit < full) pos.copy(look).addScaledVector(dir, Math.max(0.6, hit - 0.25));
      }
    }

    if (ground && v.kind !== 'mount') pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 0.35);
    if (blendT < 1) {
      blendT = Math.min(1, blendT + dt / 0.35);
      const s = smoothstep(0, 1, blendT);
      pos.sub(center).lerp(blendFrom, 1 - s).add(center);
      look.sub(center).lerp(blendLook, 1 - s).add(center);
    }
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    fov += (v.fov[0] + (v.fov[1] - v.fov[0]) * clamp(speed / topSpeed, 0, 1) - fov) * ease(dt, 0.3);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return { view: v, heading: yawOut, pitch };
  }

  return {
    get view() { return viewAt(index); },
    get index() { return index; },
    views,
    setView,
    next: () => setView(index + 1),
    update,
  };
}
