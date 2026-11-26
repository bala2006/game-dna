import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const skillsDir = path.join(root, 'power/skills');
const skills = readdirSync(skillsDir).filter((d) => existsSync(path.join(skillsDir, d, 'SKILL.md')));
const read = (rel: string) => readFileSync(path.join(skillsDir, rel), 'utf8').replace(/\r\n/g, '\n');
const kitExports = Object.keys((JSON.parse(readFileSync(path.join(root, 'packages/kit/package.json'), 'utf8')) as { exports: Record<string, string> }).exports).map((k) => `@gamedna/kit/${k.slice(2)}`);

function frontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m?.[1]) return {};
  return Object.fromEntries(m[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
}

describe('skill library', () => {
  it.each(skills)('%s has a short, YAML-safe trigger description and a matching name', (name) => {
    const fm = frontmatter(read(`${name}/SKILL.md`));
    expect(fm.name).toBe(name);
    expect(fm.description?.length ?? 0).toBeGreaterThan(80);
    expect(fm.description?.length ?? 0).toBeLessThanOrEqual(260);
    expect(fm.description).toMatch(/Use (for|when|before)/);
    expect(fm.description).not.toMatch(/: | #|\u2014/);
  });

  it('routes to every skill from gamedna-mode', () => {
    const router = read('gamedna-mode/SKILL.md') + readdirSync(path.join(skillsDir, 'gamedna-mode/recipes')).map((f) => read(`gamedna-mode/recipes/${f}`)).join('\n');
    for (const name of skills.filter((s) => s !== 'gamedna-mode')) expect(router, `router never names ${name}`).toContain(name);
  });

  it('names only skills that exist', () => {
    const files = skills.map((s) => `${s}/SKILL.md`).concat(readdirSync(path.join(skillsDir, 'gamedna-mode/recipes')).map((f) => `gamedna-mode/recipes/${f}`));
    for (const file of files) {
      const text = read(file);
      const cells = text.split('\n').filter((l) => l.startsWith('|')).flatMap((l) => l.split('|').map((c) => c.trim()));
      const named = [...text.matchAll(/\b([a-z]+(?:-[a-z]+)+) skill\b/g)].map((m) => m[1] ?? '').concat(cells.filter((c) => /^[a-z]+(-[a-z]+)+$/.test(c)));
      for (const name of named) expect(skills, `${file} names missing skill ${name}`).toContain(name);
    }
  });

  it.each(skills)('%s cites only reference and recipe files that exist', (name) => {
    const text = read(`${name}/SKILL.md`);
    for (const [, rel] of text.matchAll(/`((?:references|recipes)\/[\w.-]+)`/g)) {
      const owner = text.includes(`${rel}\` (this skill)`) ? name : undefined;
      const candidates = owner ? [owner] : skills;
      expect(candidates.some((s) => existsSync(path.join(skillsDir, s, rel ?? ''))), `${name} cites missing ${rel}`).toBe(true);
    }
  });

  it.each(skills)('%s names only Kit modules that exist', (name) => {
    for (const [mod] of read(`${name}/SKILL.md`).matchAll(/@gamedna\/kit\/[a-z]+/g)) expect(kitExports, `${name} cites ${mod}`).toContain(mod);
  });
});