/**
 * Finite state machine for game flow (menu, playing, game over) and simple AI modes.
 * Transitions come from one fixed table: `transitions[from][event] = to`. An event the current
 * state does not list is ignored: `send` returns false and `rejected` counts it. Nothing throws,
 * so a stray input cannot crash a tick. Time in state is counted in simulation ticks and advances
 * only through `tick()`, so the machine is deterministic and has no clock.
 * Hooks run synchronously inside `send`: `onExit` on the old state, then `onEnter` on the new one.
 * A hook may call `send` again: the event is queued and applied once the current transition has
 * finished (after `onEnter`), in the order sent, so every exit is paired with its enter. Such a nested
 * `send` returns false because nothing has happened yet. More than 1024 chained sends from hooks in
 * one outer `send` throw a RangeError, since that means the hooks never stop sending.
 */

/** Allowed transitions: for each state, the events it accepts and the state each leads to. */
export type TransitionTable<S extends string, E extends string> = { readonly [F in S]?: { readonly [V in E]?: S } };

/** Initial state, transition table and optional hooks. */
export interface StateMachineOptions<S extends string, E extends string> {
  initial: S;
  transitions: TransitionTable<S, E>;
  /** Called after entering `state` through `event`. Not called for the initial state or `reset`. */
  onEnter?: (state: S, from: S, event: E) => void;
  /** Called before leaving `state` for `to`. */
  onExit?: (state: S, to: S, event: E) => void;
}

/** A running state machine. */
export interface StateMachine<S extends string, E extends string> {
  /** Current state. */
  readonly state: S;
  /** State before the last transition, or null after creation and `reset`. */
  readonly previous: S | null;
  /** Ticks since the last transition or reset. */
  readonly timeInState: number;
  /** Events ignored because the current state does not accept them. */
  readonly rejected: number;
  /** True when `event` would cause a transition from the current state. */
  can(event: E): boolean;
  /**
   * Applies `event`; returns whether a transition happened. A self-transition counts and re-enters.
   * Called from a hook, it queues `event` until the current transition finishes and returns false.
   */
  send(event: E): boolean;
  /** Advances `timeInState` by one tick. */
  tick(): void;
  /** Jumps to `state` (default: initial) without hooks or table checks, for restarts and loading saves. */
  reset(state?: S, timeInState?: number): void;
}

/** Creates a state machine from a transition table. */
export function createStateMachine<S extends string, E extends string>(options: StateMachineOptions<S, E>): StateMachine<S, E> {
  const { initial, transitions, onEnter, onExit } = options;
  let state = initial, previous: S | null = null, time = 0, rejected = 0, busy = false;
  const queued: E[] = [];
  const target = (event: E): S | undefined => {
    const row = transitions[state];
    return row && Object.prototype.hasOwnProperty.call(row, event) ? row[event] : undefined;
  };
  const apply = (event: E): boolean => {
    const to = target(event);
    if (to === undefined) { rejected++; return false; }
    const from = state;
    onExit?.(from, to, event);
    previous = from;
    state = to;
    time = 0;
    onEnter?.(to, from, event);
    return true;
  };
  return {
    get state() { return state; },
    get previous() { return previous; },
    get timeInState() { return time; },
    get rejected() { return rejected; },
    can: (event) => target(event) !== undefined,
    send(event) {
      if (busy) { queued.push(event); return false; }
      busy = true;
      try {
        const moved = apply(event);
        for (let i = 0; i < queued.length; i++) {
          if (i >= 1024) throw new RangeError('state machine hooks sent more than 1024 chained events');
          apply(queued[i] as E);
        }
        return moved;
      } finally {
        busy = false;
        queued.length = 0;
      }
    },
    tick() { time++; },
    reset(to = initial, timeInState = 0) {
      state = to;
      previous = null;
      time = Math.max(0, Math.trunc(timeInState) || 0);
    },
  };
}
