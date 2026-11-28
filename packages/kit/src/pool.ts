/**
 * Object reuse for hot paths: a capped pool for bullets, enemies and pickups, and a fixed ring of
 * slots for effect sprites. Both create every object at most once and never grow past their size,
 * so a busy frame allocates nothing. Pure: no three.js, DOM, clock or randomness. Sizes are counts.
 */

export interface PoolOptions<T> {
  create: () => T;
  /** Returns an item to a clean state. Runs on release and before a recycled item is handed out. */
  reset?: (item: T) => void;
  /** Items created up front. Default 0. */
  initial?: number;
  /** Most items the pool ever creates. */
  max: number;
  /** When all `max` items are in use, `acquire` returns null, or resets and returns the oldest active item. Default `null`. */
  whenFull?: 'null' | 'recycle-oldest';
}

export interface Pool<T> {
  /** A free item, a new one while under `max`, or per `whenFull` when every item is in use. */
  acquire(): T | null;
  /** Resets `item` and returns it to the pool. False when it was not active (double release, foreign item). */
  release(item: T): boolean;
  /** Releases every active item. */
  releaseAll(): void;
  /** Visits active items oldest first. Releasing the visited item inside `fn` is safe. */
  forEachActive(fn: (item: T, index: number) => void): void;
  /** Items created so far. */
  readonly size: number;
  readonly inUse: number;
  readonly max: number;
}

/** A pool that creates at most `max` items. Acquire and release are O(active) with no allocation. */
export function createPool<T>({ create, reset, initial = 0, max, whenFull = 'null' }: PoolOptions<T>): Pool<T> {
  if (!Number.isInteger(max) || max < 1) throw new Error('createPool needs an integer max of at least 1');
  const free: T[] = [], active: T[] = [];
  let size = 0;
  for (; size < Math.min(initial, max); size++) free.push(create());
  const remove = (i: number) => { active.copyWithin(i, i + 1); active.length--; };
  return {
    acquire() {
      let item = free.pop();
      if (item === undefined && size < max) { item = create(); size++; }
      if (item === undefined) {
        if (whenFull === 'null' || active.length === 0) return null;
        item = active[0] as T;
        remove(0);
        reset?.(item);
      }
      active.push(item);
      return item;
    },
    release(item) {
      const i = active.indexOf(item);
      if (i < 0) return false;
      remove(i);
      reset?.(item);
      free.push(item);
      return true;
    },
    releaseAll() {
      for (const item of active) { reset?.(item); free.push(item); }
      active.length = 0;
    },
    forEachActive(fn) {
      for (let i = 0; i < active.length;) {
        const item = active[i] as T;
        fn(item, i);
        if (active[i] === item) i++;
      }
    },
    get size() { return size; },
    get inUse() { return active.length; },
    max,
  };
}

/**
 * A fixed ring of pre-made slots. `next()` hands out the slot after the last one, wrapping, so the
 * newest effect overwrites the oldest whether or not it has finished: the classic particle ring.
 */
export class RingBuffer<T> {
  /** Every slot, in index order. Iterate it to update live effects. */
  readonly items: readonly T[];
  private head = 0;
  constructor(capacity: number, create: (index: number) => T) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('RingBuffer needs an integer capacity of at least 1');
    this.items = Array.from({ length: capacity }, (_, i) => create(i));
  }

  get capacity(): number { return this.items.length; }
  /** Index of the slot the next `next()` returns. */
  get cursor(): number { return this.head % this.items.length; }
  /** Slots handed out since construction or `rewind`. */
  get written(): number { return this.head; }

  /** The slot at the cursor, which the caller overwrites. Advances the cursor. */
  next(): T {
    return this.items[this.head++ % this.items.length] as T;
  }

  /** Slot `i`, wrapped into range. */
  at(i: number): T {
    const n = this.items.length;
    return this.items[((Math.trunc(i) % n) + n) % n] as T;
  }

  /** Moves the cursor back to slot 0. Slots keep their contents. */
  rewind(): void {
    this.head = 0;
  }
}
