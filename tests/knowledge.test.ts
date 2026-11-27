import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { discoveryStats, parseFrontmatter, validate } from '../scripts/validate-knowledge.mjs';

type Problem = { file: string; line?: number; rule: string; message: string };
const repo = path.resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gamedna-knowledge-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const write = (root: string, rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

const BODY = ['Scope', 'Decisions', 'Mistakes', 'Reuse', 'Engines', 'Verify'].map((h) => `## ${h}\n\nText for ${h.toLowerCase()} in this skill.\n`).join('\n');
const skill = (name: string, { description, topics = name, owner = 'simulation', engines = 'portable', kit = 'kit/alpha', body = BODY, extra = '' }: Partial<Record<'description' | 'topics' | 'owner' | 'engines' | 'kit' | 'body' | 'extra', string>> = {}) =>
  `---\nname: ${name}\ndescription: ${description ?? `Decides ${name} behavior for fixture games and covers what happens when it goes wrong in play. Not for anything else (other-skill).`}\nlicense: MIT\n${extra}metadata:\n  owner: ${owner}\n  topics: ${topics}\n  engines: ${engines}\n  kit: ${kit}\n---\n\n# ${name}\n\n${body}`;

/** A minimal repository with one Kit-like package and two skills that pass every rule. */
function fixture(name: string, edit: (root: string) => void = () => {}): string {
  const root = path.join(tmp, name);
  write(root, 'packages/kit/package.json', JSON.stringify({ name: '@gamedna/kit', exports: { './alpha': './src/alpha.ts' } }));
  write(root, 'packages/kit/src/alpha.ts', 'export function stepAlpha(): number { return 1; }\nexport const ALPHA = 2;\n');
  write(root, 'node_modules/three/package.json', JSON.stringify({ version: '0.170.0' }));
  write(root, 'power/skills/other-skill/SKILL.md', skill('other-skill'));
  write(root, 'power/skills/good-skill/SKILL.md', skill('good-skill'));
  edit(root);
  return root;
}
const problems = (root: string): Problem[] => validate(root, { compile: false }).problems;
const rules = (root: string) => problems(root).map((p) => `${p.rule}: ${p.message}`);

describe('validate-knowledge on this repository', () => {
  it('reports no problems, compiling every checked sample', () => {
    const r = validate(repo, { compile: true });
    expect(r.problems, JSON.stringify(r.problems, null, 2)).toEqual([]);
    expect(r.skills.length).toBe(25);
    expect(r.compiled).toBeGreaterThan(0);
  }, 120_000);

  it('keeps every description within the discovery budget', () => {
    const stats = discoveryStats(repo);
    expect(stats.skills).toBe(25);
    expect(stats.catalogTokens).toBeLessThan(2500);
    for (const b of stats.bodies) expect(b.bodyTokens, b.skill).toBeLessThanOrEqual(1600);
  });
});

describe('validate-knowledge rules', () => {
  it('accepts the clean fixture', () => {
    expect(rules(fixture('clean'))).toEqual([]);
  });

  it('parses nested metadata, inline lists and block lists', () => {
    const fm = parseFrontmatter('---\nname: a\ntools: ["read", "write"]\nresources:\n  - skill://x\n  - file://y\nmetadata:\n  owner: quality\n---\nbody');
    expect(fm.data).toEqual({ name: 'a', tools: ['read', 'write'], resources: ['skill://x', 'file://y'], metadata: { owner: 'quality' } });
  });

  it('rejects names, fields and descriptions that break discovery', () => {
    const r = rules(fixture('names', (root) => {
      write(root, 'power/skills/Bad_Name/SKILL.md', skill('Bad_Name'));
      write(root, 'power/skills/short/SKILL.md', skill('short', { description: 'Too short. Not for x (other-skill).' }));
      write(root, 'power/skills/no-neighbors/SKILL.md', skill('no-neighbors', { description: 'Decides things for games and covers what happens when it goes wrong in play, at some length so it passes size.' }));
      write(root, 'power/skills/unsafe/SKILL.md', skill('unsafe', { description: 'Decides things: in a way that breaks YAML for fixture games when it goes wrong. Not for anything else (other-skill).' }));
      write(root, 'power/skills/extra-field/SKILL.md', skill('extra-field', { extra: 'allowed-tools: Read\n' }));
      write(root, 'power/skills/ghost-neighbor/SKILL.md', skill('ghost-neighbor', { description: 'Decides ghost behavior for fixture games and covers what happens when it goes wrong. Not for spirits (missing-skill).' }));
    }));
    expect(r.some((m) => m.startsWith('name:') && m.includes('Bad_Name'))).toBe(true);
    expect(r.some((m) => m.includes('characters; keep it'))).toBe(true);
    expect(r.some((m) => m.includes('"Not for" clause'))).toBe(true);
    expect(r.some((m) => m.includes('YAML-safe'))).toBe(true);
    expect(r.some((m) => m.includes('"allowed-tools" is not a documented'))).toBe(true);
    expect(r.some((m) => m.includes('"missing-skill", which is not a skill'))).toBe(true);
  });

  it('rejects bad metadata, shared topics, unknown modules and wrong engine versions', () => {
    const r = rules(fixture('metadata', (root) => {
      write(root, 'power/skills/greedy/SKILL.md', skill('greedy', { topics: 'good-skill, physics', owner: 'wizard', engines: 'three@0.150, unity', kit: 'kit/alpha, kit/missing' }));
    }));
    expect(r).toContain('ownership: topic "good-skill" is also claimed by good-skill');
    expect(r.some((m) => m.includes('owner "wizard"'))).toBe(true);
    expect(r.some((m) => m.includes('"three@0.150" disagrees with the pinned three 0.170'))).toBe(true);
    expect(r.some((m) => m.includes('engine "unity"'))).toBe(true);
    expect(r).toContain('kit: metadata.kit "kit/missing" is not a package export (@gamedna/kit/missing)');
  });

  it('checks body sections, order and size', () => {
    const r = rules(fixture('body', (root) => {
      write(root, 'power/skills/missing-section/SKILL.md', skill('missing-section', { body: BODY.replace('## Mistakes', '## Pitfalls') }));
      write(root, 'power/skills/out-of-order/SKILL.md', skill('out-of-order', { body: `## Verify\n\nx\n\n${BODY.replace(/## Verify[\s\S]*$/, '')}` }));
      write(root, 'power/skills/too-long/SKILL.md', skill('too-long', { body: `${BODY}\n${'Words that go on and on. '.repeat(300)}` }));
    }));
    expect(r).toContain('body: missing "## Mistakes" section');
    expect(r.some((m) => m.includes('"## Verify" is out of order') || m.includes('missing "## Verify"'))).toBe(true);
    expect(r.some((m) => m.startsWith('body: body is about'))).toBe(true);
  });

  it('checks references: existence, linkage, no chains, contents lists', () => {
    const r = rules(fixture('refs', (root) => {
      write(root, 'power/skills/linked/SKILL.md', skill('linked', { body: `${BODY}\nRead \`references/three.md\` when using three.js, and \`references/missing.md\` if lost.\n` }));
      write(root, 'power/skills/linked/references/three.md', `# Three\n\nSee \`references/orphan.md\` too.\n${'line\n'.repeat(120)}`);
      write(root, 'power/skills/linked/references/orphan.md', '# Orphan\n');
    }));
    expect(r).toContain('references: `references/missing.md` does not exist');
    expect(r).toContain('references: references link only from SKILL.md; `references/orphan.md` is linked from a reference');
    expect(r).toContain('references: references/orphan.md is not linked from SKILL.md');
    expect(r).toContain('references: a reference over 100 lines needs a "Contents" list');
  });

  it('flags duplicated guidance and unconditional skill loads', () => {
    const shared = '- Resolve each axis separately so bodies never catch on the seam between two tiles.';
    const r = rules(fixture('dupes', (root) => {
      write(root, 'power/skills/copy-a/SKILL.md', skill('copy-a', { body: `${BODY}\n${shared}\n` }));
      write(root, 'power/skills/copy-b/SKILL.md', skill('copy-b', { body: `${BODY}\n${shared}\n\nAlways load \`other-skill\` first. Read \`good-skill\` before coding.\nWhen jumping feels floaty, read \`good-skill\`.\n` }));
    }));
    expect(r.some((m) => m.startsWith('duplicate: duplicates guidance in power/skills/copy-a/SKILL.md'))).toBe(true);
    expect(r.filter((m) => m.startsWith('dependency:'))).toHaveLength(3);
  });

  it('checks code samples: imports, obsolete APIs and engine versions in prose', () => {
    const r = rules(fixture('code', (root) => {
      const body = `${BODY}\nThis targets three.js 0.150 exactly.\n\n\`\`\`ts\nimport { stepAlpha, stepBeta } from '@gamedna/kit/alpha';\nimport { x } from '@gamedna/kit/gone';\nrenderer.outputEncoding = THREE.sRGBEncoding;\nconst r = Math.random();\ngd_observe();\n\`\`\`\n`;
      write(root, 'power/skills/coder/SKILL.md', skill('coder', { body }));
    }));
    expect(r).toContain('code: @gamedna/kit/alpha has no export "stepBeta"');
    expect(r).toContain('code: imports @gamedna/kit/gone, which is not a package export');
    expect(r.some((m) => m.includes('encoding API removed'))).toBe(true);
    expect(r.some((m) => m.includes('Math.random()'))).toBe(true);
    expect(r.some((m) => m.includes('removed GameDNA MCP tool'))).toBe(true);
    expect(r.some((m) => m.startsWith('version: "three.js 0.150"'))).toBe(true);
  });

  it('type-checks samples marked for compilation', () => {
    const root = fixture('compile', (r) => {
      write(r, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', noEmit: true, skipLibCheck: true, types: [] } }));
      const body = `${BODY}\n\`\`\`ts\n// check: compile\nconst n: number = 'not a number';\n\`\`\`\n`;
      write(r, 'power/skills/typed/SKILL.md', skill('typed', { body }));
    });
    const p = validate(root, { compile: true, tsc: path.join(repo, 'node_modules/typescript/bin/tsc') }).problems as Problem[];
    expect(p.some((x) => x.rule === 'compile' && x.message.includes('TS2322'))).toBe(true);
  }, 60_000);
});
