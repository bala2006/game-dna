import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { buildBatches, catalog } from '../evaluations/skill-selection/build-prompts.mjs';
// @ts-expect-error plain ESM script without type declarations
import { CATEGORIES, checkDataset, loadDataset, score } from '../evaluations/skill-selection/score.mjs';

type Case = { id: string; split: string; category: string; role: string; context: { loaded?: string[] }; expected: { skills: string[]; specialist: string | null; modules: string[]; forbidden: string[] } };
const all = loadDataset() as Case[];

describe('skill-selection dataset', () => {
  it('has 400 to 600 valid scenarios covering every category in both splits', () => {
    expect(checkDataset(all)).toEqual([]);
    expect(all.length).toBeGreaterThanOrEqual(400);
    expect(all.length).toBeLessThanOrEqual(600);
    for (const split of ['dev', 'heldout']) for (const c of CATEGORIES) expect(all.filter((x) => x.split === split && x.category === c).length, `${split}/${c}`).toBeGreaterThanOrEqual(15);
  });
  it('keeps the held-out requests distinct from the development requests', () => {
    const norm = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim();
    const dev = new Set(all.filter((c) => c.split === 'dev').map((c) => norm((c as unknown as { request: string }).request)));
    for (const c of all.filter((x) => x.split === 'heldout')) expect(dev.has(norm((c as unknown as { request: string }).request))).toBe(false);
  });
});

describe('scorer', () => {
  const cases = loadDataset('heldout') as Case[];
  it('gives perfect scores to the expected answers', () => {
    const r = score(cases, cases.map((c) => ({ id: c.id, skills: c.expected.skills, specialist: c.expected.specialist, modules: c.expected.modules })));
    expect(r.exactSetAccuracy).toBe(1);
    expect(r.specialistAccuracy).toBe(1);
    expect(r.nearMissRejection).toBe(1);
    expect(r.unnecessaryLoads).toBe(0);
    expect(r.repeatedReads).toBe(0);
    expect(r.moduleRecall).toBe(1);
  });
  it('counts missing, forbidden, repeated and wrong-engine selections', () => {
    const r = score(cases, []);
    expect(r.missingPredictions).toBe(cases.length);
    expect(r.recall).toBe(0);
    const nm = cases.find((c) => c.category === 'near-miss')!;
    const mid = cases.find((c) => (c.context.loaded ?? []).length > 0)!;
    const three = cases.find((c) => (c as unknown as { context: { profile: { engine: string } | null } }).context.profile?.engine === 'three')!;
    const bad = score([nm, mid, three], [
      { id: nm.id, skills: [nm.expected.forbidden[0]], specialist: nm.expected.specialist, modules: [] },
      { id: mid.id, skills: [...(mid.context.loaded ?? [])], specialist: mid.expected.specialist, modules: [] },
      { id: three.id, skills: ['phaser-starter'], specialist: three.expected.specialist, modules: [] },
    ]);
    expect(bad.nearMissRejection).toBe(0);
    expect(bad.repeatedReads).toBeGreaterThan(0);
    expect(bad.engineMismatchRate).toBeGreaterThan(0);
  });
});

describe('judge prompt builder', () => {
  const cat = catalog();
  it('shows a specialist full descriptions only for its own skills in scoped mode', () => {
    const sim = all.filter((c) => c.role === 'gamedna-simulation').slice(0, 2);
    const [batch] = buildBatches(sim, 'scoped', 10, cat) as { header: string; cases: object[] }[];
    const gameFeel = cat.skills.find((s: { name: string }) => s.name === 'game-feel').description;
    const collision = cat.skills.find((s: { name: string }) => s.name === 'collision-and-response').description;
    expect(batch!.header).toContain(collision);
    expect(batch!.header).not.toContain(gameFeel);
    expect(batch!.header).toContain('- game-feel (experience)');
    expect(JSON.stringify(batch!.cases)).not.toContain('"expected"');
  });
  it('shows every description in global mode', () => {
    const [batch] = buildBatches(all.slice(0, 3), 'global', 10, cat) as { header: string }[];
    for (const s of cat.skills) expect(batch!.header).toContain(s.description);
  });
});
