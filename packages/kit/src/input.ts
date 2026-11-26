import { clamp } from './random.js';

/** A physical key, as `KeyboardEvent.code` names it ("KeyW", "Space", "ArrowLeft"). */
export type KeyCode = string;
export type Device = 'keyboard' | 'gamepad' | 'touch';

/** An analog action from -1 to 1 (or 0 to 1 when only the positive side is bound). */
export interface AxisBinding {
  /** `[negative keys, positive keys]`. */
  keys?: readonly [readonly KeyCode[], readonly KeyCode[]];
  /** `[negative mouse button, positive mouse button]`. */
  mouse?: readonly [number, number];
  /** A stick axis (standard mapping: 0 LS X, 1 LS Y, 2 RS X, 3 RS Y) or an analog button such as a trigger. */
  pad?: { axis: number; invert?: boolean } | { button: number };
  /** `stickX`, `stickY` or the id of a touch button. */
  touch?: string;
  touchInvert?: boolean;
}

export interface ButtonBinding {
  keys?: readonly KeyCode[];
  mouse?: readonly number[];
  /** Standard-mapping button indices: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, View 8, Menu 9, LS 10, RS 11. */
  pad?: readonly number[];
  touch?: string;
}

export interface LookBinding {
  /** Radians per pixel of mouse movement. */
  mouse?: number;
  /** Radians per pixel of touch drag. */
  touch?: number;
  /** Right-stick axes and turn speed in radians per second. */
  pad?: { x: number; y: number; speed: number };
  invertY?: boolean;
}

export interface Bindings {
  axes?: Readonly<Record<string, AxisBinding>>;
  buttons?: Readonly<Record<string, ButtonBinding>>;
  look?: LookBinding;
}

export interface RawState {
  keys: Set<KeyCode>;
  taps: Set<KeyCode>;
  mouse: Set<number>;
  mouseTaps: Set<number>;
  look: { x: number; y: number };
  wheel: number;
  pad: { axes: number[]; buttons: number[] } | null;
  touch: { stick: { x: number; y: number }; held: Set<string>; taps: Set<string>; look: { x: number; y: number } };
}

/** Actions for one fixed tick. `pressed` and `released` are edges since the previous sample. */
export interface ActionFrame {
  axes: Record<string, number>;
  held: Set<string>;
  pressed: Set<string>;
  released: Set<string>;
  device: Device;
}

/** Look input for one rendered frame, in radians. */
export interface LookDelta {
  x: number;
  y: number;
  wheel: number;
}

export interface TouchButton {
  id: string;
  label: string;
  shape?: 'round' | 'pedal';
  size?: number;
  width?: number;
  height?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface TouchLayout {
  /** A floating stick under the left thumb. `'x'` keeps only its horizontal axis. */
  stick?: boolean | 'x';
  /** Dragging the free screen area looks around. */
  look?: boolean;
  stickRadius?: number;
  buttons?: readonly TouchButton[];
}

export interface Input {
  readonly device: Device;
  readonly raw: RawState;
  /** Call once per fixed tick. Every press since the last sample counts, however short. */
  sample(): ActionFrame;
  /** Call once per rendered frame. Returns and clears the look input gathered since the last call. */
  takeLook(dt: number): LookDelta;
  /** The label for an action on the current device: "Space", "A", or the touch button label. */
  prompt(action: string): string;
  dispose(): void;
}

export const BINDINGS = {
  driving: {
    axes: {
      steer: { keys: [['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']], pad: { axis: 0 }, touch: 'stickX' },
      throttle: { keys: [[], ['KeyW', 'ArrowUp']], pad: { button: 7 }, touch: 'gas' },
      brake: { keys: [[], ['KeyS', 'ArrowDown']], pad: { button: 6 }, touch: 'brake' },
    },
    buttons: {
      drift: { keys: ['Space'], pad: [0, 5], touch: 'drift' },
      camera: { keys: ['KeyC'], pad: [3], touch: 'cam' },
      reset: { keys: ['KeyR'], pad: [8], touch: 'reset' },
      pause: { keys: ['KeyP'], pad: [9], touch: 'pause' },
    },
    look: { mouse: 0.0024, touch: 0.006, pad: { x: 2, y: 3, speed: 2.6 }, invertY: false },
  },
  onFoot: {
    axes: {
      moveX: { keys: [['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']], pad: { axis: 0 }, touch: 'stickX' },
      moveY: { keys: [['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']], pad: { axis: 1, invert: true }, touch: 'stickY' },
    },
    buttons: {
      jump: { keys: ['Space'], pad: [0], touch: 'jump' },
      sprint: { keys: ['ShiftLeft', 'ShiftRight'], pad: [10], touch: 'sprint' },
      interact: { keys: ['KeyE'], pad: [2], touch: 'use' },
      camera: { keys: ['KeyV'], pad: [3], touch: 'cam' },
      pause: { keys: ['KeyP'], pad: [9], touch: 'pause' },
    },
    look: { mouse: 0.0022, touch: 0.006, pad: { x: 2, y: 3, speed: 2.6 }, invertY: false },
  },
} as const satisfies Record<string, Bindings>;

export const TOUCH_LAYOUTS = {
  driving: {
    stick: 'x', look: true, stickRadius: 60,
    buttons: [
      { id: 'gas', label: 'GAS', shape: 'pedal', width: 86, height: 116, right: 22, bottom: 34 },
      { id: 'brake', label: 'BRAKE', shape: 'pedal', width: 78, height: 92, right: 122, bottom: 34 },
      { id: 'drift', label: 'DRIFT', size: 62, right: 34, bottom: 162 },
      { id: 'cam', label: 'CAM', size: 54, right: 22, top: 76 },
      { id: 'reset', label: 'RESET', size: 54, right: 88, top: 76 },
      { id: 'pause', label: 'II', size: 48, left: 22, top: 124 },
    ],
  },
  onFoot: {
    stick: true, look: true, stickRadius: 60,
    buttons: [
      { id: 'jump', label: 'JUMP', size: 80, right: 30, bottom: 36 },
      { id: 'sprint', label: 'RUN', size: 60, right: 128, bottom: 30 },
      { id: 'use', label: 'USE', size: 60, right: 40, bottom: 136 },
      { id: 'cam', label: 'VIEW', size: 52, right: 24, top: 64 },
      { id: 'pause', label: 'II', size: 48, left: 22, top: 64 },
    ],
  },
} as const satisfies Record<string, TouchLayout>;

export function radialDeadzone(x: number, y: number, deadzone = 0.15): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= deadzone) return [0, 0];
  const k = Math.min(1, (m - deadzone) / (1 - deadzone)) / m;
  return [x * k, y * k];
}

export function createRawState(): RawState {
  return {
    keys: new Set(), taps: new Set(), mouse: new Set(), mouseTaps: new Set(), look: { x: 0, y: 0 }, wheel: 0, pad: null,
    touch: { stick: { x: 0, y: 0 }, held: new Set(), taps: new Set(), look: { x: 0, y: 0 } },
  };
}

function touchValue(src: string | undefined, raw: RawState): number {
  if (src === undefined) return 0;
  if (src === 'stickX') return raw.touch.stick.x;
  if (src === 'stickY') return raw.touch.stick.y;
  return raw.touch.held.has(src) || raw.touch.taps.has(src) ? 1 : 0;
}

function padValue(b: AxisBinding['pad'], pad: RawState['pad']): number {
  if (!b || !pad) return 0;
  if ('axis' in b) return (pad.axes[b.axis] ?? 0) * (b.invert ? -1 : 1);
  return pad.buttons[b.button] ?? 0;
}

/** Pure: raw device state to held actions and axis values. Taps since the last sample count as held. */
export function resolveFrame(bindings: Bindings, raw: RawState): { axes: Record<string, number>; held: Set<string> } {
  const anyKey = (codes: readonly KeyCode[] = []) => codes.some((c) => raw.keys.has(c) || raw.taps.has(c));
  const anyMouse = (buttons: readonly number[] = []) => buttons.some((b) => raw.mouse.has(b) || raw.mouseTaps.has(b));
  const axes: Record<string, number> = {};
  for (const [name, b] of Object.entries(bindings.axes ?? {})) {
    let v = 0;
    if (b.keys) v += (anyKey(b.keys[1]) ? 1 : 0) - (anyKey(b.keys[0]) ? 1 : 0);
    if (b.mouse) v += (anyMouse([b.mouse[1]]) ? 1 : 0) - (anyMouse([b.mouse[0]]) ? 1 : 0);
    v += padValue(b.pad, raw.pad) + touchValue(b.touch, raw) * (b.touchInvert ? -1 : 1);
    axes[name] = clamp(v, -1, 1);
  }
  const held = new Set<string>();
  for (const [name, b] of Object.entries(bindings.buttons ?? {})) {
    const pad = raw.pad !== null && (b.pad ?? []).some((i) => (raw.pad?.buttons[i] ?? 0) > 0.5);
    const touch = b.touch !== undefined && (raw.touch.held.has(b.touch) || raw.touch.taps.has(b.touch));
    if (anyKey(b.keys) || anyMouse(b.mouse) || pad || touch) held.add(name);
  }
  return { axes, held };
}

/** Pure: raw look deltas to radians for one frame. */
export function resolveLook(bindings: Bindings, raw: RawState, dt: number): LookDelta {
  const L = bindings.look ?? {}, inv = L.invertY ? -1 : 1;
  const pad = raw.pad && L.pad ? [raw.pad.axes[L.pad.x] ?? 0, raw.pad.axes[L.pad.y] ?? 0] : [0, 0];
  const speed = (L.pad?.speed ?? 0) * dt;
  return {
    x: raw.look.x * (L.mouse ?? 0) + raw.touch.look.x * (L.touch ?? 0) + (pad[0] ?? 0) * speed,
    y: (raw.look.y * (L.mouse ?? 0) + raw.touch.look.y * (L.touch ?? 0) + (pad[1] ?? 0) * speed) * inv,
    wheel: raw.wheel,
  };
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right'];
const STICK_NAMES = ['LS X', 'LS Y', 'RS X', 'RS Y'];
const KEY_NAMES: Record<string, string> = {
  ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192', Space: 'Space', Escape: 'Esc',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', Enter: 'Enter', Tab: 'Tab',
};

export function keyLabel(code: KeyCode): string {
  return KEY_NAMES[code] ?? code.replace(/^Key|^Digit/, '');
}

export function promptLabel(bindings: Bindings, action: string, device: Device, touchLabels: Readonly<Record<string, string>> = {}): string {
  const axis = bindings.axes?.[action], button = bindings.buttons?.[action], b = axis ?? button;
  if (!b) return action;
  if (device === 'gamepad') {
    if (axis?.pad) return 'axis' in axis.pad ? STICK_NAMES[axis.pad.axis] ?? `Axis ${axis.pad.axis}` : PAD_NAMES[axis.pad.button] ?? `B${axis.pad.button}`;
    const i = button?.pad?.[0];
    return i === undefined ? action : PAD_NAMES[i] ?? `B${i}`;
  }
  if (device === 'touch') return (b.touch && touchLabels[b.touch]) || action;
  if (axis?.keys) return [axis.keys[0][0], axis.keys[1][0]].filter((k): k is string => !!k).map(keyLabel).join('/') || action;
  const first = button?.keys?.[0];
  return first ? keyLabel(first) : action;
}

export interface Rect { id: string; x: number; y: number; w: number; h: number }

/** Pure: where each touch button lands on a screen of `viewport` size, ignoring safe-area insets. */
export function touchLayoutRects(layout: TouchLayout, viewport: { w: number; h: number }): Rect[] {
  return (layout.buttons ?? []).map((b) => {
    const { w, h, x, y } = placement(b);
    return { id: b.id, w, h, x: x.from === 'left' ? x.px : viewport.w - x.px - w, y: y.from === 'top' ? y.px : viewport.h - y.px - h };
  });
}

function placement(b: TouchButton) {
  return {
    w: b.width ?? b.size ?? 72,
    h: b.height ?? b.size ?? 72,
    x: b.left !== undefined ? { from: 'left' as const, px: b.left } : { from: 'right' as const, px: b.right ?? 24 },
    y: b.top !== undefined ? { from: 'top' as const, px: b.top } : { from: 'bottom' as const, px: b.bottom ?? 24 },
  };
}

/** Lists touch controls under `minSize`, closer than `minGap`, off screen, or covering an `avoid` rect. */
export function auditTouchLayout({ controls, avoid = [], viewport, minSize = 48, minGap = 10 }: {
  controls: readonly Rect[];
  avoid?: readonly Rect[];
  viewport: { w: number; h: number };
  minSize?: number;
  minGap?: number;
}): string[] {
  const problems: string[] = [];
  const gap = (a: Rect, b: Rect) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
  controls.forEach((c, i) => {
    if (Math.min(c.w, c.h) < minSize) problems.push(`${c.id} is ${Math.round(c.w)}x${Math.round(c.h)} px, under ${minSize}`);
    if (c.x < 0 || c.y < 0 || c.x + c.w > viewport.w || c.y + c.h > viewport.h) problems.push(`${c.id} leaves the screen`);
    for (const d of controls.slice(i + 1)) if (gap(c, d) < minGap) problems.push(`${c.id} and ${d.id} are ${Math.round(gap(c, d))} px apart, under ${minGap}`);
    for (const h of avoid) if (gap(c, h) < 0) problems.push(`${c.id} covers ${h.id}`);
  });
  return problems;
}

/** Measures the live touch buttons and the visible `.hud` elements, for `auditTouchLayout`. */
export function measureTouchLayout(hudSelector = '.hud'): { controls: Rect[]; avoid: Rect[]; viewport: { w: number; h: number } } {
  const rect = (el: Element, id: string): Rect => { const b = el.getBoundingClientRect(); return { id, x: b.x, y: b.y, w: b.width, h: b.height }; };
  return {
    controls: [...document.querySelectorAll<HTMLElement>('.gdi-btn')].map((el) => rect(el, el.dataset.id ?? '?')),
    avoid: [...document.querySelectorAll<HTMLElement>(hudSelector)]
      .filter((el) => getComputedStyle(el).display !== 'none' && (el.textContent ?? '').trim() !== '')
      .map((el) => rect(el, `#${el.id}`)),
    viewport: { w: innerWidth, h: innerHeight },
  };
}

const TOUCH_CSS = `
.gdi-root{position:fixed;inset:0;z-index:20;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;display:none}
.gdi-root.on{display:block}
.gdi-btn{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.45);color:#fff;font:700 14px system-ui,sans-serif;letter-spacing:.06em;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-sizing:border-box;transition:transform .06s,background .06s}
.gdi-btn.pedal{border-radius:18px}
.gdi-btn.down{background:rgba(255,255,255,.4);transform:scale(.94)}
.gdi-base{position:absolute;width:128px;height:128px;margin:-64px 0 0 -64px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);display:none;pointer-events:none}
.gdi-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(255,255,255,.45)}`;

type Pointer = { kind: 'button'; el: HTMLElement } | { kind: 'stick'; x0: number; y0: number } | { kind: 'look'; x: number; y: number };

function createTouchUI(raw: RawState, layout: TouchLayout, onTouch: () => void) {
  const style = document.createElement('style');
  style.textContent = TOUCH_CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.className = 'gdi-root';
  const base = document.createElement('div'), knob = document.createElement('div');
  base.className = 'gdi-base';
  knob.className = 'gdi-knob';
  base.append(knob);
  root.append(base);
  const safe = (side: string) => `env(safe-area-inset-${side}, 0px)`;
  for (const b of layout.buttons ?? []) {
    const el = document.createElement('div');
    el.className = `gdi-btn${b.shape === 'pedal' ? ' pedal' : ''}`;
    el.dataset.id = b.id;
    el.textContent = b.label;
    const { w, h, x, y } = placement(b);
    Object.assign(el.style, { width: `${w}px`, height: `${h}px` });
    el.style[x.from] = `calc(${x.px}px + ${safe(x.from)})`;
    el.style[y.from] = `calc(${y.px}px + ${safe(y.from)})`;
    root.append(el);
  }
  document.body.append(root);

  const R = layout.stickRadius ?? 56, pointers = new Map<number, Pointer>();
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    onTouch();
    root.setPointerCapture(e.pointerId);
    const btn = (e.target as Element | null)?.closest?.<HTMLElement>('.gdi-btn');
    if (btn) {
      const id = btn.dataset.id ?? '';
      raw.touch.held.add(id);
      raw.touch.taps.add(id);
      btn.classList.add('down');
      navigator.vibrate?.(8);
      pointers.set(e.pointerId, { kind: 'button', el: btn });
    } else if (layout.stick && e.clientX < innerWidth * 0.45 && ![...pointers.values()].some((p) => p.kind === 'stick')) {
      pointers.set(e.pointerId, { kind: 'stick', x0: e.clientX, y0: e.clientY });
      Object.assign(base.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
      knob.style.transform = 'translate(0px,0px)';
    } else if (layout.look) {
      pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  });
  root.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'stick') {
      let dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      const m = Math.hypot(dx, dy);
      if (m > R) { dx *= R / m; dy *= R / m; }
      const [sx, sy] = radialDeadzone(dx / R, dy / R, 0.12);
      raw.touch.stick.x = sx;
      raw.touch.stick.y = layout.stick === 'x' ? 0 : -sy;
      knob.style.transform = `translate(${dx}px,${layout.stick === 'x' ? 0 : dy}px)`;
    } else if (p.kind === 'look') {
      raw.touch.look.x += e.clientX - p.x;
      raw.touch.look.y += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    }
  });
  const end = (pointerId: number) => {
    const p = pointers.get(pointerId);
    if (!p) return;
    pointers.delete(pointerId);
    if (p.kind === 'button') {
      const stillHeld = [...pointers.values()].some((q) => q.kind === 'button' && q.el === p.el);
      if (!stillHeld) { raw.touch.held.delete(p.el.dataset.id ?? ''); p.el.classList.remove('down'); }
    } else if (p.kind === 'stick') {
      raw.touch.stick.x = raw.touch.stick.y = 0;
      base.style.display = 'none';
    }
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) root.addEventListener(t, (e) => end(e.pointerId));
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    show(on: boolean) { root.classList.toggle('on', on); },
    release() { for (const id of [...pointers.keys()]) end(id); },
    remove() { root.remove(); style.remove(); },
  };
}

/**
 * Binds keyboard, mouse, gamepad and touch to the actions in `bindings`. The last device used
 * sets `device`, the prompt labels and whether the touch overlay shows.
 */
export function createInput({ element = document.body, bindings, touchLayout = null, mouseLook = 'lock', onDevice = null }: {
  element?: HTMLElement;
  bindings: Bindings;
  touchLayout?: TouchLayout | null;
  /** `lock` uses pointer lock (action games); `drag` looks while a button is held (menus, strategy). */
  mouseLook?: 'lock' | 'drag';
  onDevice?: ((device: Device) => void) | null;
}): Input {
  const raw = createRawState();
  let device: Device = touchLayout && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  let prevHeld = new Set<string>(), lastTouch = -1e9;
  const gameCodes = new Set<string>();
  for (const b of Object.values(bindings.axes ?? {})) for (const c of b.keys?.flat() ?? []) gameCodes.add(c);
  for (const b of Object.values(bindings.buttons ?? {})) for (const c of b.keys ?? []) gameCodes.add(c);
  const touchLabels = Object.fromEntries((touchLayout?.buttons ?? []).map((b) => [b.id, b.label]));
  const setDevice = (d: Device) => {
    if (d === device) return;
    device = d;
    touchUI?.show(d === 'touch');
    onDevice?.(d);
  };
  const touchUI = touchLayout ? createTouchUI(raw, touchLayout, () => { lastTouch = performance.now(); setDevice('touch'); }) : null;
  touchUI?.show(device === 'touch');

  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (!gameCodes.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (down) { raw.keys.add(e.code); raw.taps.add(e.code); } else raw.keys.delete(e.code);
    setDevice('keyboard');
  };
  const releaseAll = () => {
    raw.keys.clear();
    raw.mouse.clear();
    raw.touch.held.clear();
    raw.touch.stick.x = raw.touch.stick.y = 0;
    touchUI?.release();
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || performance.now() - lastTouch < 800) return;
    raw.mouse.add(e.button);
    raw.mouseTaps.add(e.button);
    setDevice('keyboard');
    if (mouseLook === 'lock' && bindings.look?.mouse && document.pointerLockElement !== element) void element.requestPointerLock?.();
  };
  const onPointerUp = (e: PointerEvent) => { if (e.pointerType === 'mouse') raw.mouse.delete(e.button); };
  const onMouseMove = (e: MouseEvent) => {
    const locked = document.pointerLockElement === element;
    if ((mouseLook === 'lock' && locked) || (mouseLook === 'drag' && raw.mouse.size > 0)) {
      raw.look.x += e.movementX;
      raw.look.y += e.movementY;
    }
  };
  const onWheel = (e: WheelEvent) => { raw.wheel += Math.sign(e.deltaY); e.preventDefault(); };
  const onVisibility = () => { if (document.hidden) releaseAll(); };
  const noMenu = (e: Event) => e.preventDefault();
  const keyDown = onKey(true), keyUp = onKey(false);
  addEventListener('keydown', keyDown);
  addEventListener('keyup', keyUp);
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);
  element.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointerup', onPointerUp);
  document.addEventListener('mousemove', onMouseMove);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', noMenu);

  const pollPad = () => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);
    if (!pad) { raw.pad = null; return; }
    const [lx, ly] = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const [rx, ry] = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    raw.pad = { axes: [lx, ly, rx, ry], buttons: pad.buttons.map((b) => b.value) };
    if (Math.hypot(lx, ly) + Math.hypot(rx, ry) > 0.3 || raw.pad.buttons.some((v) => v > 0.5)) setDevice('gamepad');
  };

  return {
    get device() { return device; },
    raw,
    sample() {
      pollPad();
      const { axes, held } = resolveFrame(bindings, raw);
      const pressed = new Set([...held].filter((a) => !prevHeld.has(a)));
      const released = new Set([...prevHeld].filter((a) => !held.has(a)));
      prevHeld = held;
      raw.taps.clear();
      raw.mouseTaps.clear();
      raw.touch.taps.clear();
      return { axes, held, pressed, released, device };
    },
    takeLook(dt) {
      const look = resolveLook(bindings, raw, dt);
      raw.look.x = raw.look.y = raw.touch.look.x = raw.touch.look.y = 0;
      raw.wheel = 0;
      return look;
    },
    prompt: (action) => promptLabel(bindings, action, device, touchLabels),
    dispose() {
      removeEventListener('keydown', keyDown);
      removeEventListener('keyup', keyUp);
      removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      element.removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('contextmenu', noMenu);
      touchUI?.remove();
    },
  };
}
