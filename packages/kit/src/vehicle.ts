import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './random.js';
import type { Point3 } from './camera.js';

/** Real dimensions in meters. Profile heights are absolute; cabin and roof spans are shares of length from the tail. */
export interface CarSpec {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontOverhang: number;
  wheelDiameter: number;
  tireWidth: number;
  clearance: number;
  noseHeight: number;
  cowlHeight: number;
  deckHeight: number;
  tailHeight: number;
  cabinRear: number;
  roofRear: number;
  roofFront: number;
  cabinFront: number;
  /** Roof width as a share of body width. */
  tumblehome: number;
  spoiler: boolean;
  driverSide: 'left' | 'right';
}

export type CarPreset = 'hatch' | 'sedan' | 'coupe' | 'suv';

export const CAR_PRESETS: Readonly<Record<CarPreset, Omit<CarSpec, 'driverSide'>>> = {
  hatch: {
    length: 4.06, width: 1.78, height: 1.47, wheelbase: 2.56, frontOverhang: 0.82, wheelDiameter: 0.63, tireWidth: 0.21, clearance: 0.14,
    noseHeight: 0.68, cowlHeight: 0.98, deckHeight: 1.0, tailHeight: 0.96,
    cabinRear: 0.03, roofRear: 0.1, roofFront: 0.52, cabinFront: 0.66, tumblehome: 0.82, spoiler: false,
  },
  sedan: {
    length: 4.78, width: 1.84, height: 1.45, wheelbase: 2.85, frontOverhang: 0.92, wheelDiameter: 0.67, tireWidth: 0.23, clearance: 0.14,
    noseHeight: 0.66, cowlHeight: 0.97, deckHeight: 1.0, tailHeight: 0.98,
    cabinRear: 0.2, roofRear: 0.34, roofFront: 0.6, cabinFront: 0.72, tumblehome: 0.8, spoiler: false,
  },
  coupe: {
    length: 4.5, width: 1.9, height: 1.28, wheelbase: 2.6, frontOverhang: 0.98, wheelDiameter: 0.68, tireWidth: 0.26, clearance: 0.11,
    noseHeight: 0.6, cowlHeight: 0.9, deckHeight: 0.93, tailHeight: 0.9,
    cabinRear: 0.14, roofRear: 0.38, roofFront: 0.6, cabinFront: 0.72, tumblehome: 0.78, spoiler: true,
  },
  suv: {
    length: 4.72, width: 1.93, height: 1.72, wheelbase: 2.84, frontOverhang: 0.9, wheelDiameter: 0.76, tireWidth: 0.25, clearance: 0.2,
    noseHeight: 0.92, cowlHeight: 1.16, deckHeight: 1.2, tailHeight: 1.18,
    cabinRear: 0.03, roofRear: 0.09, roofFront: 0.6, cabinFront: 0.69, tumblehome: 0.86, spoiler: false,
  },
};

export interface CarWheelSpot { x: number; y: number; z: number; front: boolean; side: 1 | -1 }

/** Pure geometry of a car in its own frame: +z forward, +y up, ground at y = 0, origin mid-length. */
export interface CarLayout {
  spec: CarSpec;
  length: number;
  half: number;
  wheelRadius: number;
  archR: number;
  frontAxle: number;
  rearAxle: number;
  track: number;
  wheels: CarWheelSpot[];
  zOf(t: number): number;
  tOf(z: number): number;
  top(z: number): number;
  underside(z: number): number;
  bottom(z: number, inArch: boolean): number;
  halfWidth(z: number): number;
  roof(z: number): number | null;
  cabinRearZ: number;
  cabinFrontZ: number;
  belt: number;
  driverX: number;
  eye: Point3;
  dash: { y: number; z: number };
  steeringWheel: Point3;
}

export function carLayout(spec: Partial<CarSpec> = {}): CarLayout {
  const s: CarSpec = { driverSide: 'left', ...CAR_PRESETS.coupe, ...spec };
  const L = s.length, half = L / 2, r = s.wheelDiameter / 2, archR = r * 1.12 + 0.03;
  const frontAxle = half - s.frontOverhang, rearAxle = frontAxle - s.wheelbase;
  const zOf = (t: number) => t * L - half, tOf = (z: number) => (z + half) / L;
  const endTaper = (z: number) => smoothstep(0.9, 1, Math.abs(z) / half) ** 2;
  const nearestAxle = (z: number) => (Math.abs(z - frontAxle) < Math.abs(z - rearAxle) ? frontAxle : rearAxle);

  function top(z: number): number {
    const t = tOf(z);
    let y: number;
    if (t <= s.cabinRear) y = lerp(s.tailHeight, s.deckHeight, smoothstep(0, Math.max(s.cabinRear, 1e-3), t));
    else if (t <= s.cabinFront) y = lerp(s.deckHeight, s.cowlHeight, (t - s.cabinRear) / (s.cabinFront - s.cabinRear));
    else y = lerp(s.cowlHeight, s.noseHeight, ((t - s.cabinFront) / (1 - s.cabinFront)) ** 1.6);
    const a = nearestAxle(z);
    y = Math.max(y, r + archR + 0.06 - 0.5 * Math.max(0, Math.abs(z - a) - archR));
    return y - 0.07 * endTaper(z);
  }
  const frontLift = Math.max(0.04, r * 0.8 - s.clearance), rearLift = Math.max(0.06, r * 0.95 - s.clearance);
  const underside = (z: number) => s.clearance + frontLift * smoothstep(frontAxle + archR, frontAxle + archR + 0.3, z)
    + rearLift * smoothstep(rearAxle - archR, rearAxle - archR - 0.3, z) + 0.05 * endTaper(z);
  function bottom(z: number, inArch: boolean): number {
    const base = underside(z);
    if (!inArch) return base;
    const d = Math.min(archR, Math.abs(z - nearestAxle(z)));
    return Math.max(base, r + Math.sqrt(archR * archR - d * d));
  }
  const halfWidth = (z: number) => { const e = smoothstep(0.62, 1, Math.abs(z) / half); return (s.width / 2) * (1 - (z > 0 ? 0.14 : 0.08) * e * e); };
  function roof(z: number): number | null {
    const t = tOf(z);
    if (t < s.cabinRear || t > s.cabinFront) return null;
    const crest = s.height - 0.02, base = top(z);
    if (t < s.roofRear) return lerp(base, crest, 1 - (1 - (t - s.cabinRear) / (s.roofRear - s.cabinRear)) ** 2);
    if (t <= s.roofFront) return crest + 0.02 * Math.sin((Math.PI * (t - s.roofRear)) / (s.roofFront - s.roofRear));
    return lerp(crest, base, ((t - s.roofFront) / (s.cabinFront - s.roofFront)) ** 1.15);
  }

  const cabinRearZ = zOf(s.cabinRear), cabinFrontZ = zOf(s.cabinFront);
  let belt = 0;
  for (let i = 0; i <= 40; i++) belt = Math.max(belt, top(lerp(cabinRearZ, cabinFrontZ, i / 40)));
  const dashZ = cabinFrontZ - 0.22, wheelZ = dashZ - 0.28, eyeZ = wheelZ - 0.5;
  const driverX = (s.driverSide === 'left' ? 1 : -1) * s.width * 0.2;
  const eyeY = Math.min(belt + 0.24, (roof(eyeZ) ?? s.height) - 0.1);
  const wheelX = s.width / 2 - s.tireWidth / 2 - 0.02;
  const wheels: CarWheelSpot[] = [];
  for (const [z, front] of [[frontAxle, true], [rearAxle, false]] as const) for (const side of [1, -1] as const) wheels.push({ x: side * wheelX, y: r, z, front, side });

  return {
    spec: s, length: L, half, wheelRadius: r, archR, frontAxle, rearAxle, track: wheelX * 2, wheels,
    zOf, tOf, top, underside, bottom, halfWidth, roof, cabinRearZ, cabinFrontZ, belt,
    driverX, eye: { x: driverX, y: eyeY, z: eyeZ }, dash: { y: belt + 0.03, z: dashZ }, steeringWheel: { x: driverX, y: eyeY - 0.3, z: wheelZ },
  };
}

type V3 = [number, number, number];

const SIDE_BULGE = 0.07, SIDE_TUCK = 0.04, V_WIDEST = SIDE_TUCK / (SIDE_BULGE + SIDE_TUCK);
const WIDEST = 1 - SIDE_BULGE * V_WIDEST ** 2 - SIDE_TUCK * (1 - V_WIDEST) ** 2;

function bodyRing(lay: CarLayout, z: number, inArch: boolean): V3[] {
  const w = lay.halfWidth(z), b = lay.bottom(z, inArch), s = lay.top(z), h = s - b, ring: V3[] = [];
  for (let k = 0; k < 32; k++) {
    const a = -Math.PI / 2 + (k / 32) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    let x = w * Math.sign(c) * Math.abs(c) ** 0.4;
    let y = (b + s) / 2 + (h / 2) * Math.sign(sn) * Math.abs(sn) ** 0.4;
    const v = (y - b) / h;
    x *= (1 - SIDE_BULGE * v * v - SIDE_TUCK * (1 - v) ** 2) / WIDEST;
    y += 0.025 * (1 - (x / w) ** 2) * smoothstep(0.8, 1, v);
    ring.push([x, y, z]);
  }
  return ring;
}

function cabinRing(lay: CarLayout, z: number): V3[] {
  const belt = lay.top(z), y0 = belt - 0.12, y1 = Math.max(belt + 0.01, lay.roof(z) ?? belt);
  const w = lay.halfWidth(z), wb = w * 0.93, wt = w * lay.spec.tumblehome, rr = clamp((y1 - belt) * 0.3, 0.01, 0.045);
  const side: [number, number][] = [[wb, y0], [wb, belt], [lerp(wb, wt, 0.5), lerp(belt, y1 - rr, 0.5)], [wt, y1 - rr], [wt - rr * 0.3, y1 - rr * 0.3], [wt - rr, y1], [wt * 0.5, y1 + 0.012], [0, y1 + 0.016]];
  const ring: V3[] = side.map(([x, y]) => [x, y, z]);
  for (let j = side.length - 2; j >= 0; j--) { const [x, y] = side[j] as [number, number]; ring.push([-x, y, z]); }
  return ring;
}

/** Skins lists of rings into one geometry with two material groups. `groupOf` picks group 1 per quad. */
function loft(sections: V3[][][], { closed = true, cap = false, groupOf = null }: {
  closed?: boolean; cap?: boolean; groupOf?: ((section: number, ring: number, segment: number) => 0 | 1) | null;
} = {}): THREE.BufferGeometry {
  const pos: number[] = [], groups: [number[], number[]] = [[], []];
  sections.forEach((rings, si) => {
    const m = rings[0]?.length ?? 0, base = pos.length / 3, segs = closed ? m : m - 1;
    for (const ring of rings) for (const p of ring) pos.push(...p);
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = base + i * m + j, b = base + i * m + ((j + 1) % m), c = a + m, d = b + m;
      groups[groupOf ? groupOf(si, i, j) : 0].push(a, b, c, b, d, c);
    }
  });
  if (cap) {
    const first = sections[0]?.[0], last = sections.at(-1)?.at(-1);
    for (const [ring, front] of [[first, false], [last, true]] as const) {
      if (!ring) continue;
      const m = ring.length, base = pos.length / 3;
      pos.push(ring.reduce((t, p) => t + p[0], 0) / m, ring.reduce((t, p) => t + p[1], 0) / m, ring[0]?.[2] ?? 0);
      for (const p of ring) pos.push(...p);
      for (let j = 0; j < m; j++) {
        const a = base + 1 + j, b = base + 1 + ((j + 1) % m);
        groups[0].push(...(front ? [base, a, b] : [base, b, a]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([...groups[0], ...groups[1]]);
  g.addGroup(0, groups[0].length, 0);
  g.addGroup(groups[0].length, groups[1].length, 1);
  g.computeVertexNormals();
  return g;
}

export function carMaterials({ paint = 0x8a1f1f, caliper = 0xc23b22 }: { paint?: THREE.ColorRepresentation; caliper?: THREE.ColorRepresentation } = {}) {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const paintParams = { color: paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 };
  return {
    paint: new THREE.MeshPhysicalMaterial({ ...paintParams, side: THREE.DoubleSide }),
    paintOut: new THREE.MeshPhysicalMaterial(paintParams),
    headliner: std({ color: 0x2b2c30, roughness: 0.95, side: THREE.BackSide }),
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1218, roughness: 0.04, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    trim: std({ color: 0x0d0e10, roughness: 0.6, metalness: 0.2 }),
    interior: std({ color: 0x1b1c1f, roughness: 0.85, side: THREE.DoubleSide }),
    chrome: std({ color: 0xd9dce1, metalness: 1, roughness: 0.16 }),
    mirror: std({ color: 0x7c858e, metalness: 1, roughness: 0.06 }),
    rim: std({ color: 0x2a2d33, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }),
    rubber: std({ color: 0x121213, roughness: 0.9, side: THREE.DoubleSide }),
    disc: std({ color: 0x6b6e72, metalness: 0.8, roughness: 0.45 }),
    caliper: std({ color: caliper, roughness: 0.4 }),
    liner: std({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }),
    head: std({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.6, roughness: 0.1 }),
    tail: std({ color: 0x3a0000, emissive: 0xff1a10, emissiveIntensity: 1.2, roughness: 0.2 }),
    plate: std({ color: 0xe6e6e0, roughness: 0.5 }),
  };
}
export type CarMaterials = ReturnType<typeof carMaterials>;

export interface CarWheel { pivot: THREE.Group; steer: THREE.Group; spin: THREE.Group; front: boolean; side: 1 | -1 }

/**
 * root (ground, yaw) > body (pivot for roll and pitch) > shell (paint, glass, lights) > interior.
 * Wheels hang from root, so body roll does not tilt them. Mounts are in shell space.
 */
export interface CarView {
  root: THREE.Group;
  body: THREE.Group;
  shell: THREE.Group;
  interior: THREE.Group;
  hull: THREE.Mesh;
  cabin: THREE.Mesh;
  steeringWheel: THREE.Mesh;
  wheels: CarWheel[];
  materials: CarMaterials;
  layout: CarLayout;
  mounts: { eye: Point3; hood: Point3 };
}

type Parent = THREE.Object3D;
const place = (parent: Parent, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

function buildWheel(lay: CarLayout, M: CarMaterials, side: 1 | -1) {
  const r = lay.wheelRadius, tw = lay.spec.tireWidth, rimR = r * 0.7;
  const pivot = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
  const profile: [number, number][] = [[rimR, -tw / 2], [r - 0.035, -tw / 2], [r - 0.01, -tw / 2 + 0.02], [r, -tw / 2 + 0.045], [r, tw / 2 - 0.045], [r - 0.01, tw / 2 - 0.02], [r - 0.035, tw / 2], [rimR, tw / 2]];
  place(spin, new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 36).rotateZ(Math.PI / 2), M.rubber);
  place(spin, new THREE.CylinderGeometry(rimR, rimR, tw * 0.86, 28, 1, true).rotateZ(Math.PI / 2), M.rim);
  place(spin, new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.2, 0.05, 16).rotateZ(Math.PI / 2), M.chrome, side * (tw / 2 - 0.03));
  for (let k = 0; k < 5; k++) {
    const spoke = place(spin, new THREE.BoxGeometry(0.035, rimR * 0.92, 0.045).translate(0, rimR * 0.46, 0), M.chrome, side * (tw / 2 - 0.04));
    spoke.rotation.x = (k / 5) * Math.PI * 2;
  }
  place(steer, new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.025, 28).rotateZ(Math.PI / 2), M.disc, side * (tw / 2 - 0.1));
  place(steer, new THREE.BoxGeometry(0.05, rimR * 0.5, rimR * 0.3), M.caliper, side * (tw / 2 - 0.085), rimR * 0.45, -rimR * 0.4).rotation.x = 0.5;
  steer.add(spin);
  pivot.add(steer);
  return { pivot, steer, spin };
}

export function buildCar({ preset = 'coupe', paint, caliper, ...spec }: { preset?: CarPreset; paint?: THREE.ColorRepresentation; caliper?: THREE.ColorRepresentation } & Partial<CarSpec> = {}): CarView {
  const lay = carLayout({ ...CAR_PRESETS[preset], ...spec }), s = lay.spec;
  const M = carMaterials({ ...(paint !== undefined && { paint }), ...(caliper !== undefined && { caliper }) });
  const root = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group(), interior = new THREE.Group();
  const pivotY = s.height * 0.42;
  body.position.y = pivotY;
  shell.position.y = -pivotY;
  body.add(shell);
  shell.add(interior);
  root.add(body);

  const span = (z0: number, z1: number, inArch: boolean) => {
    const n = Math.max(2, Math.ceil((z1 - z0) / 0.05));
    return Array.from({ length: n + 1 }, (_, i) => bodyRing(lay, lerp(z0, z1, i / n), inArch));
  };
  const step = (z: number, fromArch: boolean) => [bodyRing(lay, z, fromArch), bodyRing(lay, z, !fromArch)];
  const ar = lay.rearAxle, af = lay.frontAxle, R = lay.archR;
  const hull = place(shell, loft([
    span(-lay.half, ar - R, false), step(ar - R, false), span(ar - R, ar + R, true), step(ar + R, true),
    span(ar + R, af - R, false), step(af - R, false), span(af - R, af + R, true), step(af + R, true), span(af + R, lay.half, false),
  ], { cap: true }), M.paint);

  const tAt = (i: number) => lerp(s.cabinRear, s.cabinFront, (i + 0.5) / 48), bPillar = (s.roofRear + s.roofFront) / 2 - 0.02;
  const glassAt = (_: number, i: number, j: number): 0 | 1 => {
    const t = tAt(i);
    if ([1, 2, 11, 12].includes(j)) return t > s.roofRear + 0.02 && t < s.cabinFront - 0.03 && Math.abs(t - bPillar) > 0.018 ? 1 : 0;
    if (t > s.roofFront && j >= 4 && j <= 9) return 1;
    if ([5, 6, 7, 8].includes(j)) return t < s.roofRear ? 1 : 0;
    return 0;
  };
  const cabinRings = Array.from({ length: 49 }, (_, i) => cabinRing(lay, lay.zOf(lerp(s.cabinRear, s.cabinFront, i / 48))));
  const cabinGeo = loft([cabinRings], { closed: false, groupOf: glassAt });
  const cabin = place(shell, cabinGeo, [M.paintOut, M.glass]);
  place(interior, cabinGeo, [M.headliner, M.hidden]).castShadow = false;

  for (const a of [ar, af]) place(shell, new THREE.CylinderGeometry(R - 0.01, R - 0.01, s.width * 0.9, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), M.liner, 0, lay.wheelRadius, a);

  const nose = lay.half, tail = -lay.half;
  const faceMid = (z: number) => (lay.top(z) + lay.underside(z)) / 2;
  for (const side of [1, -1]) {
    place(shell, new THREE.BoxGeometry(0.36, 0.07, 0.06), M.head, side * lay.halfWidth(nose) * 0.66, faceMid(nose) + 0.03, nose - 0.015);
    place(shell, new THREE.BoxGeometry(0.28, 0.08, 0.06), M.tail, side * lay.halfWidth(tail) * 0.7, lay.top(tail) - 0.12, tail + 0.01);
    const mz = lay.cabinFrontZ - 0.1, mx = side * (lay.halfWidth(mz) * 0.93 + 0.08), my = lay.top(mz) + 0.09;
    place(shell, new THREE.SphereGeometry(1, 16, 10), M.paint, mx, my, mz).scale.set(0.075, 0.05, 0.06);
    place(shell, new THREE.CircleGeometry(1, 24).rotateY(Math.PI), M.mirror, mx, my, mz - 0.061).scale.set(0.066, 0.042, 1);
    place(shell, new THREE.BoxGeometry(0.06, 0.02, 0.04), M.trim, mx - side * 0.07, my - 0.03, mz);
  }
  place(shell, new THREE.BoxGeometry(lay.halfWidth(tail) * 1.0, 0.04, 0.05), M.tail, 0, lay.top(tail) - 0.12, tail + 0.01);
  place(shell, new THREE.BoxGeometry(lay.halfWidth(nose) * 0.84, 0.12, 0.05), M.trim, 0, faceMid(nose) - 0.05, nose - 0.01);
  place(shell, new THREE.BoxGeometry(lay.halfWidth(tail) * 1.4, 0.08, 0.2), M.trim, 0, lay.underside(tail) + 0.02, tail + 0.08);
  place(shell, new THREE.BoxGeometry(0.52, 0.11, 0.02), M.plate, 0, faceMid(tail) - 0.05, tail - 0.012);
  for (const x of [-0.42, 0.42]) place(shell, new THREE.CylinderGeometry(0.045, 0.045, 0.14, 14).rotateX(Math.PI / 2), M.chrome, x, lay.underside(tail) + 0.04, tail - 0.01);
  if (s.spoiler) {
    const sz = tail + 0.22;
    place(shell, new THREE.BoxGeometry(s.width * 0.8, 0.03, 0.26), M.trim, 0, lay.top(sz) + 0.12, sz).rotation.x = -0.1;
    for (const x of [-0.5, 0.5]) place(shell, new THREE.BoxGeometry(0.04, 0.12, 0.08), M.trim, x, lay.top(sz) + 0.06, sz);
  }

  const shelf: V3[][] = [];
  for (let i = 0; i <= 24; i++) {
    const z = lerp(lay.cabinRearZ + 0.05, lay.cabinFrontZ - 0.05, i / 24), w = lay.halfWidth(z) * 0.9, y = lay.top(z) + 0.035;
    shelf.push([[w, y, z], [-w, y, z]]);
  }
  place(interior, loft([shelf], { closed: false }), M.interior);
  const { eye, dash, steeringWheel: sw } = lay;
  place(interior, new THREE.BoxGeometry(lay.halfWidth(dash.z) * 1.7, 0.1, 0.3), M.interior, 0, dash.y, dash.z);
  for (const x of [lay.driverX, -lay.driverX]) {
    const backH = eye.y + 0.02 - (lay.belt - 0.25);
    place(interior, new THREE.BoxGeometry(0.46, backH, 0.09), M.interior, x, lay.belt - 0.25 + backH / 2, eye.z - 0.22).rotation.x = -0.15;
  }
  const steeringWheel = place(interior, new THREE.TorusGeometry(0.18, 0.02, 10, 28), M.trim, sw.x, sw.y, sw.z);
  steeringWheel.rotation.x = 0.4;

  const wheels = lay.wheels.map((w): CarWheel => {
    const parts = buildWheel(lay, M, w.side);
    parts.pivot.position.set(w.x, w.y, w.z);
    root.add(parts.pivot);
    return { ...parts, front: w.front, side: w.side };
  });

  const hoodZ = lay.cabinFrontZ + 0.35;
  const mounts = { eye: { ...lay.eye }, hood: { x: 0, y: lay.top(hoodZ) + 0.14, z: hoodZ } };
  return { root, body, shell, interior, hull, cabin, steeringWheel, wheels, materials: M, layout: lay, mounts };
}

export interface CarMotion {
  /** Front wheel angle in radians, positive to the left. */
  steerAngle?: number;
  /** Forward speed in m/s; negative when reversing. */
  speed?: number;
  lateralAccel?: number;
  longitudinalAccel?: number;
  braking?: boolean;
}

/** Wheel spin from distance, steering, body roll and pitch from acceleration, brake lights. Call once per frame. */
export function animateCar(view: CarView, { steerAngle = 0, speed = 0, lateralAccel = 0, longitudinalAccel = 0, braking = false }: CarMotion, dt: number): void {
  const k = 1 - Math.exp(-dt / 0.12);
  for (const w of view.wheels) {
    if (w.front) w.steer.rotation.y = steerAngle;
    w.spin.rotation.x += (speed * dt) / view.layout.wheelRadius;
  }
  view.steeringWheel.rotation.z = -steerAngle * 6;
  view.body.rotation.z += (clamp(lateralAccel * 0.006, -0.06, 0.06) - view.body.rotation.z) * k;
  view.body.rotation.x += (clamp(-longitudinalAccel * 0.004, -0.035, 0.035) - view.body.rotation.x) * k;
  view.materials.tail.emissiveIntensity = braking ? 6 : 1.2;
}

/** Fades the glass for a view from inside the car. */
export function setCockpitView(view: CarView, inside: boolean): void {
  view.materials.glass.opacity = inside ? 0.1 : 0.62;
}

/** Length, width and height of the hull and cabin in the car's own frame, without mirrors. */
export function measureCar(view: CarView): { length: number; width: number; height: number } {
  view.root.updateMatrixWorld(true);
  const toRoot = view.root.matrixWorld.clone().invert(), box = new THREE.Box3(), m = new THREE.Matrix4();
  for (const mesh of [view.hull, view.cabin]) {
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    if (b) box.union(b.clone().applyMatrix4(m.multiplyMatrices(toRoot, mesh.matrixWorld)));
  }
  const size = box.getSize(new THREE.Vector3());
  return { length: size.z, width: size.x, height: box.max.y };
}
