/**
 * Slot inventory: a fixed number of slots, each holding one stack of a defined item.
 *
 * Items are declared up front with a stack limit (default 1) and an optional weight in any unit.
 * Capacity is the slot count plus an optional total weight limit. Filling is deterministic: `add`
 * tops up existing stacks of that item from the first slot on, then fills empty slots from the
 * first; `remove` takes from the last matching slot backwards. Counts are whole numbers.
 * Weight sums are recomputed from slots (no running float total), with a 1e-9 tolerance.
 * `toJSON`/`load` round-trip the contents for save files. No randomness or clocks.
 */

/** Declaration of one item type. */
export interface ItemDef {
  id: string;
  /** Most items one slot holds (default 1). */
  maxStack?: number;
  /** Weight of one item (default 0). */
  weight?: number;
}

/** A stack of one item in one slot. */
export interface Stack { item: string; count: number }

/** Serializable inventory contents. */
export interface InventoryJSON { slots: (Stack | null)[] }

/** A slot inventory. */
export interface Inventory {
  /** Slot contents; null is empty. Read-only view of live state. */
  readonly slots: readonly (Readonly<Stack> | null)[];
  /** Weight limit, or Infinity. */
  readonly maxWeight: number;
  /**
   * Adds up to `count` (a whole number >= 0, default 1) of `item`; returns how many did not fit.
   * Throws a RangeError for undeclared items and for a negative, fractional or non-finite count.
   */
  add(item: string, count?: number): number;
  /** Removes up to `count` of `item` (default 1; Infinity removes all, fractions round down); returns how many were removed. */
  remove(item: string, count?: number): number;
  /** Total of `item` across slots. */
  count(item: string): number;
  /** True when at least `count` of `item` are held. */
  has(item: string, count?: number): boolean;
  /** How many of `item` would fit now, by slots, stacks and weight. */
  room(item: string): number;
  /** Total carried weight. */
  weight(): number;
  /**
   * Moves `count` (default: all) from slot `from` to slot `to`: into an empty slot, onto a stack of the
   * same item up to its limit, or swapping two different stacks when moving all. Returns the number moved.
   */
  move(from: number, to: number, count?: number): number;
  /** Moves `count` from slot `from` into the first empty slot; returns that slot index or -1. */
  split(from: number, count: number): number;
  /** Plain copy of the contents. */
  toJSON(): InventoryJSON;
  /** Replaces the contents from `toJSON` output. Unknown items, bad counts and extra slots are dropped and reported. */
  load(json: InventoryJSON): string[];
}

const EPS = 1e-9;
const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** An empty inventory with `slots` slots over the declared items. */
export function createInventory({ items, slots: slotCount, maxWeight = Infinity }: { items: readonly ItemDef[]; slots: number; maxWeight?: number }): Inventory {
  if (!Number.isInteger(slotCount) || slotCount < 1) throw new RangeError('slots must be a positive integer');
  const defs = new Map<string, { maxStack: number; weight: number }>();
  for (const d of items) {
    if (defs.has(d.id)) throw new RangeError(`item "${d.id}" is declared twice`);
    const maxStack = d.maxStack ?? 1, weight = d.weight ?? 0;
    if (!Number.isInteger(maxStack) || maxStack < 1) throw new RangeError(`item "${d.id}" maxStack must be a positive integer`);
    if (!(weight >= 0) || !Number.isFinite(weight)) throw new RangeError(`item "${d.id}" weight must be finite and >= 0`);
    defs.set(d.id, { maxStack, weight });
  }
  const slots: (Stack | null)[] = Array.from({ length: slotCount }, () => null);
  const def = (item: string) => {
    const d = defs.get(item);
    if (!d) throw new RangeError(`item "${item}" is not declared`);
    return d;
  };
  const weight = (): number => {
    let w = 0;
    for (const s of slots) if (s) w += s.count * (defs.get(s.item)?.weight ?? 0);
    return w;
  };
  const bySpace = (item: string, maxStack: number): number => {
    let n = 0;
    for (const s of slots) n += s === null ? maxStack : s.item === item ? maxStack - s.count : 0;
    return n;
  };
  const room = (item: string): number => {
    const d = def(item), space = bySpace(item, d.maxStack);
    if (d.weight === 0 || maxWeight === Infinity) return space;
    return Math.min(space, Math.max(0, Math.floor((maxWeight - weight()) / d.weight + EPS)));
  };
  const count = (item: string): number => {
    let n = 0;
    for (const s of slots) if (s && s.item === item) n += s.count;
    return n;
  };
  const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < slotCount;
  return {
    slots,
    maxWeight,
    add(item, n = 1) {
      const d = def(item);
      if (!Number.isInteger(n) || n < 0) throw new RangeError(`add count ${n} must be a whole number >= 0`);
      const want = n;
      let left = Math.min(want, room(item));
      const leftover = want - left;
      for (const s of slots) {
        if (left === 0) break;
        if (s && s.item === item && s.count < d.maxStack) { const k = Math.min(left, d.maxStack - s.count); s.count += k; left -= k; }
      }
      for (let i = 0; i < slotCount && left > 0; i++) {
        if (slots[i] !== null) continue;
        const k = Math.min(left, d.maxStack);
        slots[i] = { item, count: k };
        left -= k;
      }
      return leftover + left;
    },
    remove(item, n = 1) {
      let left = n === Infinity ? Infinity : whole(n), removed = 0;
      for (let i = slotCount - 1; i >= 0 && left > 0; i--) {
        const s = slots[i];
        if (!s || s.item !== item) continue;
        const k = Math.min(left, s.count);
        s.count -= k;
        left -= k;
        removed += k;
        if (s.count === 0) slots[i] = null;
      }
      return removed;
    },
    count,
    has: (item, n = 1) => count(item) >= n,
    room,
    weight,
    move(from, to, n) {
      if (!valid(from) || !valid(to) || from === to) return 0;
      const a = slots[from], b = slots[to];
      if (!a) return 0;
      const k = Math.min(a.count, n === undefined ? a.count : whole(n));
      if (k === 0) return 0;
      if (b === null || b === undefined) {
        if (k === a.count) { slots[to] = a; slots[from] = null; } else { slots[to] = { item: a.item, count: k }; a.count -= k; }
        return k;
      }
      if (b.item === a.item) {
        const moved = Math.min(k, def(a.item).maxStack - b.count);
        b.count += moved;
        a.count -= moved;
        if (a.count === 0) slots[from] = null;
        return moved;
      }
      if (k !== a.count) return 0;
      slots[to] = a;
      slots[from] = b;
      return k;
    },
    split(from, n) {
      if (!valid(from)) return -1;
      const a = slots[from], k = whole(n);
      if (!a || k === 0 || k >= a.count) return -1;
      const to = slots.indexOf(null);
      if (to < 0) return -1;
      slots[to] = { item: a.item, count: k };
      a.count -= k;
      return to;
    },
    toJSON: () => ({ slots: slots.map((s) => (s ? { item: s.item, count: s.count } : null)) }),
    load(json) {
      const problems: string[] = [];
      const src = Array.isArray(json?.slots) ? json.slots : [];
      if (src.length > slotCount) problems.push(`${src.length - slotCount} extra slots dropped`);
      for (let i = 0; i < slotCount; i++) {
        const s = src[i];
        slots[i] = null;
        if (s === null || s === undefined) continue;
        const d = typeof s.item === 'string' ? defs.get(s.item) : undefined;
        if (!d) { problems.push(`slot ${i}: unknown item "${String(s.item)}" dropped`); continue; }
        const c = whole(s.count);
        if (c === 0) { problems.push(`slot ${i}: count ${String(s.count)} dropped`); continue; }
        if (c > d.maxStack) problems.push(`slot ${i}: ${c} ${s.item} cut to stack limit ${d.maxStack}`);
        slots[i] = { item: s.item, count: Math.min(c, d.maxStack) };
      }
      if (weight() > maxWeight + EPS) problems.push(`weight ${weight()} is over the limit ${maxWeight}; kept, but nothing more fits`);
      return problems;
    },
  };
}
