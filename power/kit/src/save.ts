/**
 * Versioned save data with migrations and corruption checks.
 *
 * A save is one string: `gds:<version>:<checksum>:<json>`. The checksum is 32-bit FNV-1a over
 * `<version>:<json>` (UTF-16 code units), so a truncated or hand-edited save is detected instead of
 * loading half a world. Older saves run through `migrations[v]` (v to v + 1) until they reach the
 * current version; saves from a newer build are refused rather than guessed at.
 * Storage is injected: any object with getItem/setItem/removeItem, such as `localStorage` in a
 * browser. The default is an in-memory store, so saves work in Node tests. Nothing reads clocks.
 * To resume seeded randomness, store `rng.state()` in the data and rebuild it with `restoreRng`.
 */

/** The subset of the Web Storage API a save system needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory StorageLike. */
export function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
  };
}

/** 32-bit FNV-1a hash over the UTF-16 code units of `text`. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Why a save could not be loaded or written. */
export type SaveProblem = 'missing' | 'malformed' | 'checksum' | 'future-version' | 'missing-migration' | 'migration-failed' | 'invalid' | 'storage';

/** Detailed load result. */
export type SaveRead<T> =
  | { ok: true; data: T; version: number; /** Version the save was written with, or null when it was already current. */ migratedFrom: number | null }
  | { ok: false; problem: SaveProblem; version: number | null; detail?: string };

/** Key, version, migrations, storage and validation for one save slot. */
export interface SaveSystemOptions<T> {
  /** Storage key. */
  key: string;
  /** Current data version, a positive integer. */
  version: number;
  /** `migrations[v]` turns version-v data into version v + 1 data and returns it; returning undefined fails the load with `migration-failed`. */
  migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
  storage?: StorageLike;
  /** Final check on loaded (and migrated) data. */
  validate?: (data: unknown) => data is T;
}

/** Saves and loads one slot. */
export interface SaveSystem<T> {
  readonly key: string;
  readonly version: number;
  /** Writes `data`; false when it cannot be serialized or storage refuses it (quota, private mode). */
  save(data: T): boolean;
  /** Loaded data, or null when there is no usable save. `read()` says why. */
  load(): { data: T; migratedFrom: number | null } | null;
  /** Detailed load result. */
  read(): SaveRead<T>;
  /** Removes the save. */
  clear(): void;
  /** The save string for `data`, for export or tests. */
  encode(data: T): string;
  /** Parses, verifies and migrates a save string. */
  decode(text: string): SaveRead<T>;
}

const PATTERN = /^gds:(\d+):([0-9a-f]{8}):/;

/** Creates a save system for one key. */
export function createSaveSystem<T>(options: SaveSystemOptions<T>): SaveSystem<T> {
  const { key, version, migrations = {}, storage = memoryStorage(), validate } = options;
  if (!Number.isInteger(version) || version < 1) throw new RangeError('save version must be a positive integer');
  const encode = (data: T): string => {
    const json = JSON.stringify(data);
    if (json === undefined) throw new TypeError('save data is not serializable');
    return `gds:${version}:${fnv1a(`${version}:${json}`).toString(16).padStart(8, '0')}:${json}`;
  };
  const decode = (text: string): SaveRead<T> => {
    const m = PATTERN.exec(text);
    if (!m) return { ok: false, problem: 'malformed', version: null };
    const from = Number(m[1]), json = text.slice(m[0].length);
    if (fnv1a(`${from}:${json}`) !== parseInt(m[2] as string, 16)) return { ok: false, problem: 'checksum', version: from };
    if (from > version) return { ok: false, problem: 'future-version', version: from };
    if (from < 1) return { ok: false, problem: 'malformed', version: from };
    let data: unknown;
    try { data = JSON.parse(json); } catch { return { ok: false, problem: 'malformed', version: from }; }
    for (let v = from; v < version; v++) {
      const step = Object.prototype.hasOwnProperty.call(migrations, v) ? migrations[v] : undefined;
      if (!step) return { ok: false, problem: 'missing-migration', version: from, detail: `no migration from version ${v}` };
      try { data = step(data); } catch (e) { return { ok: false, problem: 'migration-failed', version: from, detail: `version ${v}: ${String(e)}` }; }
      if (data === undefined) return { ok: false, problem: 'migration-failed', version: from, detail: `version ${v}: migration returned undefined` };
    }
    if (validate && !validate(data)) return { ok: false, problem: 'invalid', version: from };
    return { ok: true, data: data as T, version, migratedFrom: from === version ? null : from };
  };
  const read = (): SaveRead<T> => {
    let text: string | null;
    try { text = storage.getItem(key); } catch (e) { return { ok: false, problem: 'storage', version: null, detail: String(e) }; }
    return text === null ? { ok: false, problem: 'missing', version: null } : decode(text);
  };
  return {
    key,
    version,
    save(data) {
      try { storage.setItem(key, encode(data)); return true; } catch { return false; }
    },
    load() {
      const r = read();
      return r.ok ? { data: r.data, migratedFrom: r.migratedFrom } : null;
    },
    read,
    clear() { try { storage.removeItem(key); } catch { /* storage unavailable: nothing to clear */ } },
    encode,
    decode,
  };
}
