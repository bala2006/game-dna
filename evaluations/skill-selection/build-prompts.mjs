#!/usr/bin/env node
// Writes judge batches for the skill-selection evaluation. Each batch holds the discovery metadata
// one role would see and up to --size scenarios with their expected answers removed.
//
//   node build-prompts.mjs --split heldout --mode scoped|global --out <dir> [--size 45]
//
// scoped: a specialist sees full descriptions of the skills in its agent resources and only the
//         names and owners of the rest; the Director sees specialist descriptions, the Director
//         skill and skill names by owner. This is what the agent configuration requests.
// global: every role sees every skill description. This is what Kiro Web was observed to show.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDataset } from './score.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');

function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const get = (k) => fm.match(new RegExp(`^\\s*${k}:\\s*(.*)$`, 'm'))?.[1]?.replace(/^"|"$/g, '') ?? '';
  const resources = [...fm.matchAll(/skill:\/\/\.kiro\/skills\/([a-z0-9-]+)\//g)].map((m) => m[1]);
  return { name: get('name'), description: get('description'), owner: get('owner'), resources };
}

export function catalog(root = repo) {
  const skillsDir = path.join(root, 'power', 'skills');
  const skills = readdirSync(skillsDir).filter((d) => existsSync(path.join(skillsDir, d, 'SKILL.md'))).sort().map((d) => frontmatter(path.join(skillsDir, d, 'SKILL.md')));
  const agentsDir = path.join(root, 'integration', 'kiro', 'agents');
  const agents = readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort().map((f) => frontmatter(path.join(agentsDir, f)));
  const readme = readFileSync(path.join(root, 'packages', 'kit', 'README.md'), 'utf8');
  const modules = [...readme.matchAll(/^\| `@gamedna\/(kit\/[a-z]+)` \| (.+) \|$/gm)].map((m) => ({ id: m[1], text: m[2] }));
  modules.push(
    { id: 'starter', text: 'FixedStepSimulation base class for Phaser games, InputLatch, num/flag/msToTicks tuning helpers' },
    { id: 'starter/phaser', text: 'SimScene (Phaser scene that owns a fixed-step sim), bootGame, shake' },
    { id: 'assets', text: 'Seeded 2D asset generators (sprites, tiles, backgrounds, icons, particles, sound effects) and style packs' },
    { id: 'core', text: 'Deterministic scenario runner, assertions, traces and metrics for tests' },
  );
  return { skills, agents, modules };
}

const RULES = `You are judging which GameDNA knowledge an agent should open right now. For each scenario, answer as that agent would act at that moment:
- "skills": the skills to open now, by exact name. Only skills whose guidance this decision needs. [] when ordinary programming knowledge is enough. Never include a skill listed as already loaded. Engine skills (threejs-kit, phaser-starter) only when engine-specific integration is in question, and only for the project's engine.
- "specialist": for the Director, the one specialist agent to delegate this request to, or null if the Director should do it directly (small or single-value changes) or no implementation is needed. For a specialist, the specialist that owns the work if it belongs to another domain and should be handed over, else null.
- "modules": existing GameDNA modules (ids from the module list) the agent should reuse for this step, [] if none.
- The "director" role always has its own gamedna-director skill loaded as its instructions; never list gamedna-director in "skills".
Return only a JSON array, one object per scenario: {"id": "...", "skills": [...], "specialist": null|"gamedna-...", "modules": [...]}.`;

function header(role, mode, cat) {
  const lines = [RULES, ''];
  const byName = new Map(cat.skills.map((s) => [s.name, s]));
  const agent = cat.agents.find((a) => a.name === role);
  if (mode === 'global') {
    lines.push('## Skills (name: description)');
    for (const s of cat.skills) lines.push(`- ${s.name}: ${s.description}`);
    lines.push('', '## Specialist agents');
    for (const a of cat.agents.filter((x) => x.name !== 'gamedna-director')) lines.push(`- ${a.name}: ${a.description}`);
  } else if (role === 'director') {
    lines.push('## Your skill (already loaded as your instructions)', `- gamedna-director: ${byName.get('gamedna-director')?.description}`, '', '## Specialist agents you can delegate to');
    for (const a of cat.agents.filter((x) => x.name !== 'gamedna-director')) lines.push(`- ${a.name}: ${a.description}`);
    lines.push('', '## Other skills (names only, grouped by owner; open one only when doing the work yourself)');
    const owners = [...new Set(cat.skills.map((s) => s.owner))].filter((o) => o !== 'director');
    for (const o of owners) lines.push(`- ${o}: ${cat.skills.filter((s) => s.owner === o).map((s) => s.name).join(', ')}`);
  } else {
    const own = new Set(agent?.resources ?? []);
    lines.push(`## You are ${role}: ${agent?.description}`, '', '## Your skills (name: description)');
    for (const s of cat.skills.filter((x) => own.has(x.name))) lines.push(`- ${s.name}: ${s.description}`);
    lines.push('', '## Other skills (names and owning specialist only; reachable when a real dependency needs them)');
    for (const s of cat.skills.filter((x) => !own.has(x.name))) lines.push(`- ${s.name} (${s.owner})`);
    lines.push('', '## Specialists', cat.agents.filter((a) => a.name !== 'gamedna-director' && a.name !== role).map((a) => a.name).join(', '));
  }
  lines.push('', '## Reusable modules (id: what it gives)');
  for (const m of cat.modules) lines.push(`- ${m.id}: ${m.text}`);
  return lines.join('\n');
}

const strip = (c) => ({ id: c.id, role: c.role, context: c.context, request: c.request });

export function buildBatches(cases, mode, size = 45, cat = catalog()) {
  const groups = new Map();
  for (const c of cases) {
    const key = mode === 'global' ? 'all' : c.role;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const batches = [];
  for (const [key, list] of [...groups].sort()) {
    for (let i = 0; i < list.length; i += size) {
      const part = list.slice(i, i + size);
      const head = mode === 'global' ? header('all', mode, cat) : header(key, mode, cat);
      batches.push({ name: `${key}-${String(i / size + 1).padStart(2, '0')}`, header: head, cases: part.map(strip) });
    }
  }
  return batches;
}

function main(argv) {
  const get = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  const split = get('--split'), mode = get('--mode', 'scoped'), out = get('--out'), size = Number(get('--size', 45));
  if (!split || !out || !['scoped', 'global'].includes(mode)) { console.error('usage: build-prompts.mjs --split <dev|heldout> --mode <scoped|global> --out <dir> [--size N]'); return 2; }
  mkdirSync(out, { recursive: true });
  const batches = buildBatches(loadDataset(split), mode, size);
  const index = [];
  for (const b of batches) {
    const text = `${b.header}\n\n## Scenarios\n\n${b.cases.map((c) => JSON.stringify(c)).join('\n')}\n`;
    writeFileSync(path.join(out, `${b.name}.md`), text);
    index.push({ batch: b.name, cases: b.cases.length, headerTokens: Math.ceil(b.header.length / 4) });
  }
  writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
