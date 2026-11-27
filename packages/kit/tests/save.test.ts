import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from '../src/random.js';
import { createSaveSystem, fnv1a, memoryStorage, type StorageLike } from '../src/save.js';

interface V3 { name: string; gold: number; level: number; rng: number }
const isV3 = (d: unknown): d is V3 => typeof d === 'object' && d !== null && typeof (d as V3).name === 'string' && typeof (d as V3).level === 'number';
const migrations = {
  1: (d: unknown) => ({ ...(d as { name: string; coins: number }), gold: (d as { coins: number }).coins }),
  2: (d: unknown) => ({ ...(d as object), level: 1, rng: 0 }),
};

describe('save', () => {
  it('round-trips data at the current version', () => {
    const s = createSaveSystem<V3>({ key: 'slot1', version: 3, migrations, validate: isV3 });
    expect(s.load()).toBeNull();
    expect(s.read()).toMatchObject({ ok: false, problem: 'missing' });
    const data = { name: 'Ada', gold: 12, level: 4, rng: 99 };
    expect(s.save(data)).toBe(true);
    expect(s.load()).toEqual({ data, migratedFrom: null });
  });

  it('migrates a v1 save through v2 to v3', () => {
    const storage = memoryStorage();
    const v1 = createSaveSystem<{ name: string; coins: number }>({ key: 'k', version: 1, storage });
    v1.save({ name: 'Bo', coins: 30 });
    const v3 = createSaveSystem<V3>({ key: 'k', version: 3, migrations, storage, validate: isV3 });
    const loaded = v3.load();
    expect(loaded?.migratedFrom).toBe(1);
    expect(loaded?.data).toMatchObject({ name: 'Bo', gold: 30, level: 1, rng: 0 });
    const gap = createSaveSystem<V3>({ key: 'k', version: 3, migrations: { 2: migrations[2] }, storage });
    expect(gap.read()).toMatchObject({ ok: false, problem: 'missing-migration', version: 1 });
    const broken = createSaveSystem<V3>({ key: 'k', version: 2, migrations: { 1: () => { throw new Error('bad'); } }, storage });
    expect(broken.read()).toMatchObject({ ok: false, problem: 'migration-failed' });
  });

  it('fails a migration that mutates in place and forgets to return', () => {
    const storage = memoryStorage();
    createSaveSystem<{ hp: number }>({ key: 'k', version: 1, storage }).save({ hp: 3 });
    const forgot = createSaveSystem<{ hp: number; mp: number }>({ key: 'k', version: 2, storage, migrations: { 1: (d) => { (d as { mp?: number }).mp = 0; } } });
    expect(forgot.read()).toEqual({ ok: false, problem: 'migration-failed', version: 1, detail: 'version 1: migration returned undefined' });
    expect(forgot.load()).toBeNull();
    const nullOk = createSaveSystem<null>({ key: 'k', version: 2, storage, migrations: { 1: () => null } });
    expect(nullOk.read()).toEqual({ ok: true, data: null, version: 2, migratedFrom: 1 });
  });

  it('detects corruption with the checksum', () => {
    const storage = memoryStorage(), s = createSaveSystem<V3>({ key: 'k', version: 3, storage });
    s.save({ name: 'Cy', gold: 5, level: 2, rng: 1 });
    const text = storage.getItem('k')!;
    storage.setItem('k', text.replace('"gold":5', '"gold":9'));
    expect(s.read()).toMatchObject({ ok: false, problem: 'checksum' });
    storage.setItem('k', text.slice(0, -3));
    expect(s.load()).toBeNull();
    storage.setItem('k', text.replace('gds:3:', 'gds:2:'));
    expect(s.read()).toMatchObject({ ok: false, problem: 'checksum' });
    storage.setItem('k', 'not a save');
    expect(s.read()).toMatchObject({ ok: false, problem: 'malformed' });
  });

  it('refuses saves from a newer version', () => {
    const storage = memoryStorage();
    createSaveSystem<V3>({ key: 'k', version: 4, storage }).save({ name: 'Di', gold: 1, level: 1, rng: 1 });
    expect(createSaveSystem<V3>({ key: 'k', version: 3, migrations, storage }).read()).toMatchObject({ ok: false, problem: 'future-version', version: 4 });
  });

  it('rejects data that fails validation', () => {
    const s = createSaveSystem<V3>({ key: 'k', version: 3, validate: isV3 });
    expect(s.decode(createSaveSystem<unknown>({ key: 'x', version: 3 }).encode({ name: 5 }))).toMatchObject({ ok: false, problem: 'invalid' });
  });

  it('restores the Rng so the run continues with the same numbers', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 17; i++) rng.next();
    const s = createSaveSystem<V3>({ key: 'k', version: 3 });
    s.save({ name: 'Eve', gold: 0, level: 1, rng: rng.state() });
    const resumed = restoreRng(s.load()!.data.rng);
    for (let i = 0; i < 10; i++) expect(resumed.next()).toBe(rng.next());
  });

  it('reports storage failures instead of throwing', () => {
    const failing: StorageLike = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
    const s = createSaveSystem<V3>({ key: 'k', version: 1, storage: failing });
    expect(s.save({ name: 'F', gold: 0, level: 0, rng: 0 })).toBe(false);
    expect(s.read()).toMatchObject({ ok: false, problem: 'storage' });
    expect(() => s.clear()).not.toThrow();
  });

  it('uses standard 32-bit FNV-1a', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});
