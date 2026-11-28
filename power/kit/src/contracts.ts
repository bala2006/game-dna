/**
 * Game Contracts: the facts that more than one subsystem depends on, declared once in typed source.
 * A contract holds only what crosses a boundary (units, axes, timestep, update order, event names,
 * input actions, budgets). Creative constraints such as palette or tone live in `.gamedna/contract.md`.
 * `defineContracts` validates the values and freezes them, so a wrong unit or timestep fails at
 * startup and in tests instead of surfacing as a subtle integration bug.
 */

export type WorldUnit = 'meter' | 'pixel' | 'tile';
export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export interface SpatialContract {
  /** What one world unit means. three.js games built on the Kit use meters. */
  unit: WorldUnit;
  /** Pixels per meter, for 2D games that still want physically credible motion. */
  pixelsPerMeter?: number;
  /** Pixel size of one tile when `unit` is `tile`. */
  tileSizePx?: number;
  /** Up axis. Phaser screen space is `-y` (y grows downward); the Kit's 3D space is `+y`. */
  up: Axis;
  /** Forward axis of vehicles and characters at zero heading. The Kit uses `+z`. */
  forward?: Axis;
  /** Plane the ground lies in: `xz` for 3D, `xy` for 2D side or top-down views. */
  ground: 'xz' | 'xy';
  /** Optional playable bounds, in world units. */
  bounds?: { min: readonly number[]; max: readonly number[] };
  /** Reference sizes in world units, such as `{ playerHeight: 1.75, carLength: 4.3 }`. */
  scales?: Readonly<Record<string, number>>;
  /** Which system writes each transform. Presentation code must not write simulation-owned ones. */
  transformOwners?: Readonly<Record<string, string>>;
}

export interface SimulationContract {
  /** Fixed simulation rate in Hz. Rules step at exactly this rate. */
  hz: number;
  /** Maximum ticks per rendered frame before the clock drops time instead of spiralling. */
  maxStepsPerFrame?: number;
  /** True when identical seeds and inputs must give identical state. Rules then use seeded RNG only. */
  deterministic: boolean;
  /** Systems in update order within one tick, such as `['input', 'movement', 'collision', 'rules']`. */
  order: readonly string[];
  /** State field or entity group, then the one system allowed to write it. */
  owners?: Readonly<Record<string, string>>;
}

export type ActionKind = 'button' | 'axis' | 'look';
export type InputDeviceKind = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

export interface InteractionContract {
  /** Semantic actions the game reads. Device bindings map onto these names. */
  actions: Readonly<Record<string, { kind: ActionKind; devices: readonly InputDeviceKind[] }>>;
  /** Smallest touch target in CSS pixels. 44 to 48 is the common accessibility floor. */
  minTouchTargetPx?: number;
  /** Whether players can rebind actions. */
  remappable?: boolean;
  /** Whether the game honors a reduced-motion setting for shake, flashes and camera sway. */
  reducedMotion?: boolean;
}

export interface PerformanceContract {
  /** Frame rate the game must hold on the target hardware. */
  targetFps: number;
  /** Short description of the slowest supported device, such as `mid-range phone, 2022`. */
  targetHardware: string;
  /** Milliseconds per frame available to all simulation ticks combined. */
  simulationBudgetMs: number;
  maxDrawCalls?: number;
  maxTriangles?: number;
  textureMemoryMB?: number;
  /** Quality levels the renderer supports, highest first. */
  quality?: readonly string[];
}

export interface GameContracts {
  name: string;
  spatial: SpatialContract;
  simulation: SimulationContract;
  interaction?: InteractionContract;
  performance?: PerformanceContract;
  /** Gameplay event names every subsystem may emit or consume. Payload types live with the event bus. */
  events?: readonly string[];
}

export class ContractError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid game contracts:\n- ${problems.join('\n- ')}`);
    this.name = 'ContractError';
  }
}

const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const AXES = new Set<Axis>(['+x', '-x', '+y', '-y', '+z', '-z']);

/** Every problem with the contracts, or an empty list. Never throws. */
export function validateContracts(c: GameContracts): string[] {
  const p: string[] = [];
  if (!c.name || typeof c.name !== 'string') p.push('name must be a non-empty string');
  const s = c.spatial;
  if (!['meter', 'pixel', 'tile'].includes(s.unit)) p.push(`spatial.unit "${s.unit}" must be meter, pixel or tile`);
  if (!AXES.has(s.up)) p.push(`spatial.up "${s.up}" is not an axis`);
  if (s.forward !== undefined && !AXES.has(s.forward)) p.push(`spatial.forward "${s.forward}" is not an axis`);
  if (s.forward !== undefined && s.forward.slice(1) === s.up.slice(1)) p.push('spatial.forward must not lie on the up axis');
  if (s.ground === 'xz' && s.up.slice(1) !== 'y') p.push('spatial.ground "xz" needs up on the y axis');
  if (s.unit === 'tile' && !isPositive(s.tileSizePx)) p.push('spatial.tileSizePx is required and positive when unit is tile');
  if (s.pixelsPerMeter !== undefined && !isPositive(s.pixelsPerMeter)) p.push('spatial.pixelsPerMeter must be positive');
  for (const [k, v] of Object.entries(s.scales ?? {})) if (!isPositive(v)) p.push(`spatial.scales.${k} must be a positive size`);
  if (s.bounds) {
    const { min, max } = s.bounds;
    if (min.length !== max.length) p.push('spatial.bounds min and max must have the same length');
    min.forEach((m, i) => { if (!(m < (max[i] ?? -Infinity))) p.push(`spatial.bounds min[${i}] must be below max[${i}]`); });
  }
  const sim = c.simulation;
  if (!Number.isInteger(sim.hz) || sim.hz < 10 || sim.hz > 1000) p.push(`simulation.hz ${sim.hz} must be an integer from 10 to 1000`);
  if (sim.maxStepsPerFrame !== undefined && (!Number.isInteger(sim.maxStepsPerFrame) || sim.maxStepsPerFrame < 1)) p.push('simulation.maxStepsPerFrame must be a positive integer');
  if (sim.order.length === 0) p.push('simulation.order must name at least one system');
  if (new Set(sim.order).size !== sim.order.length) p.push('simulation.order has duplicate systems');
  for (const [field, owner] of Object.entries(sim.owners ?? {})) if (!sim.order.includes(owner)) p.push(`simulation.owners.${field} names "${owner}", which is not in simulation.order`);
  for (const [entity, owner] of Object.entries(s.transformOwners ?? {})) if (!sim.order.includes(owner) && owner !== 'presentation') p.push(`spatial.transformOwners.${entity} names "${owner}", which is neither a simulation system nor "presentation"`);
  const i = c.interaction;
  if (i) {
    for (const [name, a] of Object.entries(i.actions)) {
      if (!/^[a-z][A-Za-z0-9]*$/.test(name)) p.push(`interaction action "${name}" must be lowerCamelCase`);
      if (a.devices.length === 0) p.push(`interaction action "${name}" has no device`);
    }
    if (i.minTouchTargetPx !== undefined && i.minTouchTargetPx < 24) p.push('interaction.minTouchTargetPx below 24 px is not reliably tappable');
  }
  const perf = c.performance;
  if (perf) {
    if (!isPositive(perf.targetFps) || perf.targetFps > 240) p.push('performance.targetFps must be in (0, 240]');
    if (!isPositive(perf.simulationBudgetMs)) p.push('performance.simulationBudgetMs must be positive');
    else if (isPositive(perf.targetFps) && perf.simulationBudgetMs >= 1000 / perf.targetFps) p.push('performance.simulationBudgetMs must leave frame time for rendering');
    if (!perf.targetHardware) p.push('performance.targetHardware must describe the slowest supported device');
    for (const k of ['maxDrawCalls', 'maxTriangles', 'textureMemoryMB'] as const) if (perf[k] !== undefined && !isPositive(perf[k])) p.push(`performance.${k} must be positive`);
  }
  if (c.events) {
    if (new Set(c.events).size !== c.events.length) p.push('events has duplicate names');
    for (const e of c.events) if (!/^[a-z][A-Za-z0-9.:-]*$/.test(e)) p.push(`event "${e}" must start with a lowercase letter`);
  }
  return p;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** Validates and deep-freezes the contracts. Throws `ContractError` listing every problem. */
export function defineContracts<const C extends GameContracts>(contracts: C): C {
  const problems = validateContracts(contracts);
  if (problems.length > 0) throw new ContractError(problems);
  return deepFreeze(contracts);
}

/** Fixed timestep in seconds. */
export const stepSeconds = (c: Pick<GameContracts, 'simulation'>): number => 1 / c.simulation.hz;

/** Converts milliseconds to whole ticks at the contract rate (at least one tick for positive input). */
export const ticksFor = (c: Pick<GameContracts, 'simulation'>, ms: number): number =>
  ms <= 0 ? 0 : Math.max(1, Math.round((ms / 1000) * c.simulation.hz));

export interface BudgetSample {
  frameMs?: number;
  simulationMs?: number;
  drawCalls?: number;
  triangles?: number;
  textureMemoryMB?: number;
}

/** Compares measured costs against the performance contract. Unmeasured values are skipped. */
export function checkBudget(perf: PerformanceContract, sample: BudgetSample): { ok: boolean; overruns: string[] } {
  const overruns: string[] = [];
  const frameBudget = 1000 / perf.targetFps;
  if (sample.frameMs !== undefined && sample.frameMs > frameBudget) overruns.push(`frame ${sample.frameMs.toFixed(2)} ms > ${frameBudget.toFixed(2)} ms`);
  if (sample.simulationMs !== undefined && sample.simulationMs > perf.simulationBudgetMs) overruns.push(`simulation ${sample.simulationMs.toFixed(2)} ms > ${perf.simulationBudgetMs} ms`);
  if (sample.drawCalls !== undefined && perf.maxDrawCalls !== undefined && sample.drawCalls > perf.maxDrawCalls) overruns.push(`draw calls ${sample.drawCalls} > ${perf.maxDrawCalls}`);
  if (sample.triangles !== undefined && perf.maxTriangles !== undefined && sample.triangles > perf.maxTriangles) overruns.push(`triangles ${sample.triangles} > ${perf.maxTriangles}`);
  if (sample.textureMemoryMB !== undefined && perf.textureMemoryMB !== undefined && sample.textureMemoryMB > perf.textureMemoryMB) overruns.push(`texture memory ${sample.textureMemoryMB} MB > ${perf.textureMemoryMB} MB`);
  return { ok: overruns.length === 0, overruns };
}

/** Throws when `name` is not a declared event, so a typo fails in tests rather than silently never firing. */
export function assertEvent(c: Pick<GameContracts, 'events'>, name: string): void {
  if (c.events && !c.events.includes(name)) throw new ContractError([`event "${name}" is not declared in the contracts`]);
}
