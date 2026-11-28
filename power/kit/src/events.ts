/**
 * Typed gameplay event queue for fixed-step simulations.
 *
 * Systems `emit` during a tick; nothing runs at that moment. Handlers registered with `on` run
 * only in `flush()`, in emission order, so a system never re-enters itself or another system
 * mid-update. Events emitted by handlers during a flush wait for the next flush. `drain()` hands
 * the pending events to a recorder or test without dispatching them.
 * Each event carries the queue's `tick` (set it once per simulation step) and a sequence number.
 * Past `capacity` pending events, new ones are dropped and counted, never thrown. With `allowed`
 * (for example the `events` list from the game contracts), undeclared names are rejected and
 * counted on emit, and `on` throws so a typo fails at startup. No clocks: order is emission order.
 */

/** An emitted event with its stamps. */
export interface QueuedEvent<Events, K extends keyof Events = keyof Events> {
  type: K;
  payload: Events[K];
  /** Value of `queue.tick` when the event was emitted. */
  tick: number;
  /** Emission counter since the queue was created. */
  seq: number;
}

/** Any event of the map, discriminated by `type`. */
export type AnyEvent<Events> = { [K in keyof Events]: QueuedEvent<Events, K> }[keyof Events];

/** A deferred-dispatch event queue over the event map `Events` (name to payload type). */
export interface EventQueue<Events> {
  /** Stamp for new events. Set it to the simulation tick before each step. */
  tick: number;
  /** Pending events. */
  readonly size: number;
  /** Events dropped because the queue was full. */
  readonly dropped: number;
  /** Events refused because their name is not in `allowed`. */
  readonly rejected: number;
  /** Queues an event; false when it was dropped or rejected. */
  emit<K extends keyof Events & string>(type: K, payload: Events[K]): boolean;
  /** Subscribes to one event type; returns an unsubscribe function. Handlers run in subscription order. */
  on<K extends keyof Events & string>(type: K, handler: (payload: Events[K], event: QueuedEvent<Events, K>) => void): () => void;
  /**
   * Dispatches pending events to handlers in emission order and returns them. If a handler throws,
   * flush rethrows without returning: events up to the one being dispatched count as delivered (its
   * later handlers are skipped), and the rest of the batch goes back to the front of the queue, ahead
   * of events emitted during the flush, for the next `flush` or `drain`.
   */
  flush(): AnyEvent<Events>[];
  /** Removes and returns pending events without dispatching them. */
  drain(): AnyEvent<Events>[];
  /** Clears pending events and counters; keeps subscriptions. */
  clear(): void;
}

/** Creates an event queue holding at most `capacity` pending events (default 1024). */
export function createEventQueue<Events extends object>({ capacity = 1024, allowed }: { capacity?: number; allowed?: readonly string[] } = {}): EventQueue<Events> {
  type Handler = (payload: unknown, event: AnyEvent<Events>) => void;
  const names = allowed ? new Set(allowed) : null;
  const handlers = new Map<string, Handler[]>();
  let pending: AnyEvent<Events>[] = [], seq = 0, dropped = 0, rejected = 0;
  const queue: EventQueue<Events> = {
    tick: 0,
    get size() { return pending.length; },
    get dropped() { return dropped; },
    get rejected() { return rejected; },
    emit(type, payload) {
      if (names && !names.has(type)) { rejected++; return false; }
      if (pending.length >= capacity) { dropped++; return false; }
      pending.push({ type, payload, tick: queue.tick, seq: seq++ } as AnyEvent<Events>);
      return true;
    },
    on(type, handler) {
      if (names && !names.has(type)) throw new RangeError(`event "${type}" is not declared`);
      // Copy on write: a flush in progress keeps iterating the list it started with.
      const h = handler as Handler;
      handlers.set(type, [...(handlers.get(type) ?? []), h]);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const list = handlers.get(type) ?? [], i = list.indexOf(h);
        if (i >= 0) handlers.set(type, [...list.slice(0, i), ...list.slice(i + 1)]);
      };
    },
    flush() {
      const batch = pending;
      pending = [];
      let i = 0;
      try {
        for (; i < batch.length; i++) {
          const e = batch[i] as AnyEvent<Events>, list = handlers.get(e.type as string);
          if (list) for (const h of list) h(e.payload, e);
        }
      } finally {
        // A handler threw at batch[i]: the events after it go back in front of anything emitted since.
        if (i + 1 < batch.length) pending = batch.slice(i + 1).concat(pending);
      }
      return batch;
    },
    drain() {
      const batch = pending;
      pending = [];
      return batch;
    },
    clear() { pending = []; dropped = 0; rejected = 0; },
  };
  return queue;
}
