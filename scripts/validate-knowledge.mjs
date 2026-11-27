#!/usr/bin/env node
// Deterministic validator for GameDNA's knowledge system: skills in power/skills/ and agents in
// integration/kiro/agents/. Implements the rules listed in CONTRIBUTING.md. Prints one line per
// problem and exits 1 if any are found. This is repository development tooling, not a runtime.
//
//   node scripts/validate-knowledge.mjs [--root <dir>] [--no-compile] [--json] [--stats]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const OWNERS = ['director', 'gameplay', 'simulation', 'world', 'visual', 'motion', 'interaction', 'experience', 'performance', 'quality', 'engine'];
export const SKILL_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata'];
export const METADATA_KEYS = ['owner', 'topics', 'engines', 'kit'];
export const BODY_SECTIONS = ['Scope', 'Decisions', 'Mistakes', 'Reuse', 'Engines', 'Verify'];
export const AGENT_FIELDS = ['name', 'description', 'tools', 'resources', 'model', 'includeMcpJson', 'includePowers', 'permissions', 'welcomeMessage', 'excludedTools', 'mcpServers', 'prompt'];
const MAX_BODY_TOKENS = 1600;
const DESCRIPTION_RANGE = [100, 330];
const SPECIALIST_PROMPT_TOKENS = [150, 400];
const CONDITION = /\b(when|if|only|unless|for|whenever|once)\b/i;
const LOAD_VERB = /\b(load|loads|read|reads|open|opens|activate|activates|consult|consults|follow|follows)\b/i;
const VERSION_CONTEXT = /\b(not|unsupported|untested|removed|deprecated|since|before|after|newer|older|introduced|renamed|replaced)\b/i;
const OBSOLETE = [
  [/\bgd_[a-z_]+\b/, 'removed GameDNA MCP tool'],
  [/\bMath\.random\s*\(/, 'Math.random() in a code sample; use a seeded Rng'],
  [/\bTHREE\.(Geometry|Face3|CubeGeometry|MeshFaceMaterial)\b/, 'three.js API removed before 0.170'],
  [/\.outputEncoding\b|\bsRGBEncoding\b|\bLinearEncoding\b/, 'three.js encoding API removed; use colorSpace / outputColorSpace'],
  [/\bphysicallyCorrectLights\b|\buseLegacyLights\b/, 'three.js lighting flag removed before 0.170'],
  [/\.applyMatrix\(|\bTHREE\.Math\./, 'three.js API renamed before 0.170'],
  [/new Phaser\.Game\(\s*\d+\s*,/, 'Phaser 2 constructor'],
  [/\bPhaser\.State\b|\bgame\.state\.add\(|\bphysics\.startSystem\(/, 'Phaser 2 API'],
];

const read = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const tokens = (text) => Math.ceil(text.length / 4);
const relTo = (root, f) => path.relative(root, f).split(path.sep).join('/');

/** Parses the small YAML subset GameDNA frontmatter uses: scalars, one nested map, inline and block lists. */
export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: null, body: text, errors: ['missing frontmatter'] };
  const data = {}, errors = [];
  let parentKey = null, listKey = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (line.startsWith('- ')) {
      const target = listKey ? (parentKey && listKey !== parentKey ? data[parentKey] : data) : null;
      if (!target || !Array.isArray(target[listKey])) { errors.push(`list item without a list key: "${line}"`); continue; }
      target[listKey].push(unquote(line.slice(2).trim()));
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 1) { errors.push(`cannot parse frontmatter line "${line}"`); continue; }
    const key = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (indent === 0) {
      parentKey = null; listKey = null;
      if (value === '') { data[key] = {}; parentKey = key; listKey = key; }
      else data[key] = parseScalar(value);
    } else if (parentKey) {
      const parent = data[parentKey];
      if (Array.isArray(parent)) { errors.push(`unexpected mapping under list "${parentKey}"`); continue; }
      if (value === '') { parent[key] = []; listKey = key; }
      else { parent[key] = parseScalar(value); listKey = null; }
    } else errors.push(`unexpected indentation at "${line}"`);
  }
  fixBlockLists(m[1], data);
  return { data, body: text.slice(m[0].length), errors: errors.filter((e) => !e.startsWith('list item without')), raw: m[1] };
}

function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}
function parseScalar(v) {
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return unquote(v);
}

// Second pass for block lists: rebuild arrays from "key:\n  - a\n  - b" (indent 2) at the top level.
function fixBlockLists(fmRaw, data) {
  const lines = fmRaw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z][\w-]*):\s*$/);
    if (!m) continue;
    const items = [];
    let j = i + 1;
    while (j < lines.length && /^\s+- /.test(lines[j])) { items.push(unquote(lines[j].trim().slice(2).trim())); j++; }
    if (items.length) data[m[1]] = items;
  }
  return data;
}

/** Splits Markdown into prose lines and fenced code blocks. */
export function splitMarkdown(body) {
  const prose = [], code = [];
  let fence = null, buf = [], start = 0;
  body.split('\n').forEach((line, i) => {
    const f = line.match(/^```(\w*)/);
    if (f) {
      if (fence === null) { fence = f[1] || 'text'; buf = []; start = i + 1; }
      else { code.push({ lang: fence, text: buf.join('\n'), line: start }); fence = null; }
      return;
    }
    if (fence !== null) buf.push(line);
    else prose.push({ text: line, line: i + 1 });
  });
  return { prose, code };
}

/** Exported names of a TypeScript module, following `export * from` and `export { } from`. */
export function exportedNames(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return new Set();
  seen.add(file);
  const text = read(file), names = new Set();
  for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+['"]([^'"]+)['"])?/gm)) {
    for (const part of m[1].split(',')) {
      const p = part.trim().replace(/^type\s+/, '');
      if (!p) continue;
      const alias = p.split(/\s+as\s+/);
      names.add((alias[1] ?? alias[0]).trim());
    }
  }
  for (const m of text.matchAll(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
    const target = resolveRelative(file, m[1]);
    if (target) for (const n of exportedNames(target, seen)) names.add(n);
  }
  return names;
}
function resolveRelative(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base.replace(/\.js$/, '.ts'), base, `${base}.ts`, path.join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** `@gamedna/<pkg>/<sub>` specifiers that are real package exports, mapped to their source files. */
export function packageExports(root) {
  const out = new Map();
  const pkgsDir = path.join(root, 'packages');
  if (!existsSync(pkgsDir)) return out;
  for (const dir of readdirSync(pkgsDir)) {
    const pj = path.join(pkgsDir, dir, 'package.json');
    if (!existsSync(pj)) continue;
    const j = JSON.parse(read(pj));
    if (!j.name?.startsWith('@gamedna/') || !j.exports) continue;
    for (const [sub, target] of Object.entries(j.exports)) {
      const spec = sub === '.' ? j.name : `${j.name}/${sub.slice(2)}`;
      out.set(spec, path.join(pkgsDir, dir, typeof target === 'string' ? target : target.default ?? target.import));
    }
  }
  return out;
}

const kitRefToSpecifier = (ref) => `@gamedna/${ref.trim()}`;
const pinnedVersion = (root, pkg) => {
  const lock = path.join(root, 'node_modules', pkg, 'package.json');
  if (existsSync(lock)) return JSON.parse(read(lock)).version;
  return null;
};
const majorMinor = (v) => (v ?? '').replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');

export function loadSkills(root) {
  const dir = path.join(root, 'power', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().filter((d) => existsSync(path.join(dir, d, 'SKILL.md'))).map((d) => {
    const file = path.join(dir, d, 'SKILL.md');
    const text = read(file);
    const fm = parseFrontmatter(text);
    const refsDir = path.join(dir, d, 'references');
    const references = [];
    const walk = (p) => {
      if (!existsSync(p)) return;
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.md')) references.push({ rel: relTo(path.join(dir, d), full), file: full, text: read(full) });
      }
    };
    walk(refsDir);
    references.sort((a, b) => a.rel.localeCompare(b.rel));
    return { dir: d, file, text, fm: fm.data ?? {}, fmErrors: fm.errors, body: fm.body, references, folder: path.join(dir, d) };
  });
}

export function loadAgents(root) {
  const dir = path.join(root, 'integration', 'kiro', 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().filter((f) => f.endsWith('.md')).map((f) => {
    const file = path.join(dir, f);
    const text = read(file);
    const fm = parseFrontmatter(text);
    return { file, name: f.replace(/\.md$/, ''), fm: fm.data ?? {}, fmErrors: fm.errors, body: fm.body };
  });
}

const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const normalizeLine = (t) => t.toLowerCase().replace(/[`*_>#|]/g, ' ').replace(/^\s*([-+]|\d+\.)\s+/, '').replace(/\s+/g, ' ').trim();

/** Runs every rule. Returns problems as `{ file, line?, rule, message }`. */
export function validate(root, { compile = true, tsc: tscPath } = {}) {
  const problems = [];
  const add = (file, rule, message, line) => problems.push({ file: relTo(root, file), line, rule, message });
  const skills = loadSkills(root);
  const agents = loadAgents(root);
  const exports = packageExports(root);
  const names = new Set(skills.map((s) => s.dir));
  const pins = { three: majorMinor(pinnedVersion(root, 'three')), phaser: majorMinor(pinnedVersion(root, 'phaser')) };
  const topicOwners = new Map();
  const lineOwners = new Map();
  const compileBlocks = [];

  for (const s of skills) {
    const fm = s.fm;
    for (const e of s.fmErrors) add(s.file, 'frontmatter', e);
    if (fm.name !== s.dir) add(s.file, 'name', `name "${fm.name}" must equal the folder name "${s.dir}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.dir) || s.dir.length > 64) add(s.file, 'name', `"${s.dir}" must be lowercase words joined by single hyphens, at most 64 characters`);
    for (const k of Object.keys(fm)) if (!SKILL_FIELDS.includes(k)) add(s.file, 'frontmatter', `field "${k}" is not a documented skill field`);
    const d = typeof fm.description === 'string' ? fm.description : '';
    if (d.length < DESCRIPTION_RANGE[0] || d.length > DESCRIPTION_RANGE[1]) add(s.file, 'description', `description is ${d.length} characters; keep it within ${DESCRIPTION_RANGE.join(' to ')}`);
    if (!/\bNot for\b/.test(d)) add(s.file, 'description', 'description must end with a "Not for" clause naming the neighboring skills');
    if (/: | #|\u2014/.test(d) || /^[`'"{[&*!|>%@]/.test(d)) add(s.file, 'description', 'description is not a plain YAML-safe scalar (no ": ", " #", em-dash or leading quote)');
    for (const n of d.matchAll(/\(([a-z0-9-]+(?:,\s*[a-z0-9-]+)*)\)/g)) for (const ref of n[1].split(',').map((x) => x.trim())) if (ref.includes('-') && !names.has(ref)) add(s.file, 'description', `description names "${ref}", which is not a skill`);
    const md = fm.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata) ? fm.metadata : null;
    if (!md) { add(s.file, 'metadata', 'metadata map is required'); continue; }
    for (const k of Object.keys(md)) if (!METADATA_KEYS.includes(k)) add(s.file, 'metadata', `metadata key "${k}" is not allowed`);
    for (const k of METADATA_KEYS) if (typeof md[k] !== 'string') add(s.file, 'metadata', `metadata.${k} must be a string`);
    if (!OWNERS.includes(md.owner)) add(s.file, 'metadata', `owner "${md.owner}" is not one of ${OWNERS.join(', ')}`);
    const engines = list(md.engines);
    for (const e of engines) {
      const m = e.match(/^(portable|three|phaser)(?:@(\d+\.\d+))?$/);
      if (!m) add(s.file, 'engines', `engine "${e}" must be portable, three@<major.minor> or phaser@<major.minor>`);
      else if (m[1] !== 'portable' && pins[m[1]] && m[2] !== pins[m[1]]) add(s.file, 'engines', `engine "${e}" disagrees with the pinned ${m[1]} ${pins[m[1]]}`);
    }
    for (const t of list(md.topics)) {
      const key = t.toLowerCase();
      if (topicOwners.has(key)) add(s.file, 'ownership', `topic "${t}" is also claimed by ${topicOwners.get(key)}`);
      else topicOwners.set(key, s.dir);
    }
    for (const ref of list(md.kit)) if (!exports.has(kitRefToSpecifier(ref))) add(s.file, 'kit', `metadata.kit "${ref}" is not a package export (@gamedna/${ref})`);

    // Body structure and size.
    const sections = [...s.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const expected = s.fm.metadata?.owner === 'director' ? [] : BODY_SECTIONS;
    let cursor = -1;
    for (const want of expected) {
      const at = sections.indexOf(want);
      if (at < 0) add(s.file, 'body', `missing "## ${want}" section`);
      else if (at < cursor) add(s.file, 'body', `"## ${want}" is out of order`);
      else cursor = at;
    }
    const bodyTokens = tokens(s.body);
    if (bodyTokens > MAX_BODY_TOKENS) add(s.file, 'body', `body is about ${bodyTokens} tokens; move detail into references (limit ${MAX_BODY_TOKENS})`);

    // References: existence, linkage, no reference-to-reference links.
    const docs = [{ file: s.file, rel: 'SKILL.md', text: s.body, isSkill: true }, ...s.references.map((r) => ({ ...r, isSkill: false }))];
    for (const doc of docs) {
      for (const m of doc.text.matchAll(/`((?:references|scripts)\/[^`\s]+)`/g)) {
        const target = path.join(s.folder, m[1]);
        if (!existsSync(target)) add(doc.file, 'references', `\`${m[1]}\` does not exist`);
        if (!doc.isSkill && m[1].startsWith('references/')) add(doc.file, 'references', `references link only from SKILL.md; \`${m[1]}\` is linked from a reference`);
      }
    }
    for (const r of s.references) {
      const dirRel = r.rel.slice(0, r.rel.lastIndexOf('/') + 1);
      if (!s.body.includes(r.rel) && !s.body.includes(`\`${dirRel}\``)) add(r.file, 'references', `${r.rel} is not linked from SKILL.md`);
      if (r.text.split('\n').length > 100 && !/^##?\s*Contents/m.test(r.text)) add(r.file, 'references', 'a reference over 100 lines needs a "Contents" list');
    }

    // Prose rules: duplicates, unconditional loads, engine versions.
    for (const doc of docs) {
      const { prose, code } = splitMarkdown(doc.text);
      for (const { text, line } of prose) {
        if (/^\|[-\s|:]+\|$/.test(text.trim()) || /^#/.test(text.trim())) continue;
        const norm = normalizeLine(text);
        if (norm.length >= 60) {
          const prev = lineOwners.get(norm);
          if (prev && prev.skill !== s.dir) add(doc.file, 'duplicate', `duplicates guidance in ${prev.where}`, line);
          else if (!prev) lineOwners.set(norm, { skill: s.dir, where: `${relTo(root, doc.file)}:${line}` });
        }
        for (const sentence of text.split(/(?<=[.;!?])\s+/)) {
          const mentioned = [...sentence.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]).filter((n) => names.has(n) && n !== s.dir);
          if (mentioned.length && LOAD_VERB.test(sentence) && !CONDITION.test(sentence)) add(doc.file, 'dependency', `unconditional instruction to load ${mentioned.join(', ')}: "${sentence.trim().slice(0, 90)}"`, line);
          if (mentioned.length && /\balways\b/i.test(sentence) && /\b(load|read|open|use|activate)\b/i.test(sentence)) add(doc.file, 'dependency', `"always" load of ${mentioned.join(', ')}`, line);
        }
        for (const m of text.matchAll(/\b(three(?:\.js)?|phaser)\s*@?\s*v?(\d+\.\d+)(?:\.\d+)?\b/gi)) {
          const eng = m[1].toLowerCase().startsWith('three') ? 'three' : 'phaser';
          if (pins[eng] && m[2] !== pins[eng] && !VERSION_CONTEXT.test(text)) add(doc.file, 'version', `"${m[0]}" disagrees with the pinned ${eng} ${pins[eng]}`, line);
        }
      }
      for (const block of code) {
        for (const [re, why] of OBSOLETE) if (re.test(block.text)) add(doc.file, 'code', `${why}`, block.line);
        if (['ts', 'typescript', 'js', 'javascript'].includes(block.lang)) {
          for (const m of block.text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](@gamedna\/[^'"]+)['"]/g)) {
            const file = exports.get(m[2]);
            if (!file) { add(doc.file, 'code', `imports ${m[2]}, which is not a package export`, block.line); continue; }
            const have = exportedNames(file);
            for (const part of m[1].split(',')) {
              const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
              if (n && !have.has(n)) add(doc.file, 'code', `${m[2]} has no export "${n}"`, block.line);
            }
          }
          if (/^\/\/ check: compile/.test(block.text)) compileBlocks.push({ doc: doc.file, line: block.line, text: block.text, id: `${s.dir}-${compileBlocks.length}` });
        }
      }
      for (const m of doc.text.matchAll(/@gamedna\/[a-z]+(?:\/[a-z]+)?/g)) if (!exports.has(m[0])) add(doc.file, 'kit', `${m[0]} is not a package export`);
    }
  }

  // Agents.
  const agentNames = new Set(agents.map((a) => a.name));
  const discoveredBy = new Map();
  for (const a of agents) {
    for (const e of a.fmErrors) add(a.file, 'frontmatter', e);
    const fm = a.fm;
    for (const k of Object.keys(fm)) {
      if (k === 'hooks') add(a.file, 'agent', 'inline "hooks" are not allowed; the IDE ignores agents that contain them');
      else if (!AGENT_FIELDS.includes(k)) add(a.file, 'agent', `field "${k}" is not a documented agent field`);
    }
    if (fm.name !== a.name) add(a.file, 'agent', `name "${fm.name}" must equal the file name "${a.name}"`);
    if (typeof fm.description !== 'string' || fm.description.length < 40) add(a.file, 'agent', 'description must say when to delegate to this agent');
    const tools = list(fm.tools);
    const isDirector = a.name === 'gamedna-director';
    for (const t of tools) {
      if (t === '*' || t === '@builtin') add(a.file, 'agent', `tool "${t}" grants every built-in, including unrestricted sub-agents`);
      const sub = t.match(/^subagent(?:\/(.+))?$/);
      if (sub && !isDirector) add(a.file, 'agent', `specialists must not delegate (tool "${t}")`);
      if (sub && isDirector && !sub[1]) add(a.file, 'agent', 'the Director must name each specialist as subagent/<name>');
      if (sub?.[1] && !agentNames.has(sub[1])) add(a.file, 'agent', `subagent/${sub[1]} is not an agent in integration/kiro/agents`);
    }
    for (const r of list(fm.resources)) {
      const sk = r.match(/^skill:\/\/\.kiro\/skills\/([a-z0-9-]+)\/SKILL\.md$/);
      if (r.startsWith('skill://')) {
        if (!sk) add(a.file, 'agent', `resource "${r}" must be skill://.kiro/skills/<name>/SKILL.md`);
        else if (!names.has(sk[1])) add(a.file, 'agent', `resource "${r}" names a skill that does not exist`);
        else if (!discoveredBy.has(sk[1])) discoveredBy.set(sk[1], [a.name]);
        else discoveredBy.get(sk[1]).push(a.name);
      } else if (r.startsWith('file://')) {
        const p = r.slice('file://'.length).replace(/^\.kiro\/skills\//, 'power/skills/').replace(/^\.kiro\/agents\//, 'integration/kiro/agents/');
        if (!p.includes('*') && !existsSync(path.join(root, p))) add(a.file, 'agent', `resource "${r}" does not resolve`);
      } else add(a.file, 'agent', `resource "${r}" must use skill:// or file://`);
    }
    if (!isDirector) {
      const t = tokens(a.body);
      if (t < SPECIALIST_PROMPT_TOKENS[0] || t > SPECIALIST_PROMPT_TOKENS[1]) add(a.file, 'agent', `specialist prompt is about ${t} tokens; keep it within ${SPECIALIST_PROMPT_TOKENS.join(' to ')}`);
    }
  }
  if (agents.length) {
    for (const s of skills) {
      const owner = s.fm.metadata?.owner;
      const by = discoveredBy.get(s.dir) ?? [];
      const specialists = by.filter((n) => n !== 'gamedna-director');
      if (owner === 'engine') { if (specialists.length < agents.length - 2) add(s.file, 'discovery', `engine skill is discovered by only ${specialists.length} specialists`); }
      else if (owner === 'director') { if (!by.includes('gamedna-director')) add(s.file, 'discovery', 'the Director agent must list this skill'); }
      else if (specialists.length !== 1) add(s.file, 'discovery', `domain skill must be discovered by exactly one specialist, found ${specialists.length} (${specialists.join(', ') || 'none'})`);
      else if (`gamedna-${owner}` !== specialists[0]) add(s.file, 'discovery', `owner "${owner}" but discovered by ${specialists[0]}`);
    }
  }

  // Compile-checked code samples.
  if (compile && compileBlocks.length) {
    const dir = path.join(root, '.scratch', 'knowledge-check');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const b of compileBlocks) writeFileSync(path.join(dir, `${b.id}.ts`), `${b.text}\nexport {};\n`);
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { noEmit: true, noUnusedLocals: false }, include: ['*.ts'] }));
    const tsc = tscPath ?? path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    const r = spawnSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) {
      for (const line of `${r.stdout}${r.stderr}`.split('\n')) {
        const m = line.match(/([\w-]+-\d+)\.ts\((\d+),\d+\): (error .*)/);
        if (!m) continue;
        const b = compileBlocks.find((x) => x.id === m[1]);
        if (b) add(b.doc, 'compile', m[3], b.line + Number(m[2]) - 1);
      }
      if (!problems.some((p) => p.rule === 'compile')) add(dir, 'compile', `tsc failed: ${(r.stdout || r.stderr).slice(0, 300)}`);
    }
  }
  return { problems, skills, agents, compiled: compile ? compileBlocks.length : 0 };
}

/** Discovery-context sizes: what each agent sees before any skill body loads. */
export function discoveryStats(root) {
  const skills = loadSkills(root), agents = loadAgents(root);
  const meta = new Map(skills.map((s) => [s.dir, `${s.fm.name ?? ''}\n${s.fm.description ?? ''}`]));
  const all = [...meta.values()].join('\n');
  const perAgent = agents.map((a) => {
    const own = list(a.fm.resources).map((r) => r.match(/skills\/([a-z0-9-]+)\//)?.[1]).filter(Boolean);
    const text = own.map((n) => meta.get(n) ?? '').join('\n');
    return { agent: a.name, skills: own.length, chars: text.length, tokens: tokens(text) };
  });
  const bodies = skills.map((s) => ({ skill: s.dir, bodyTokens: tokens(s.body), references: s.references.length }));
  return { skills: skills.length, catalogChars: all.length, catalogTokens: tokens(all), perAgent, bodies };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const argv = process.argv.slice(2);
  const rootArg = argv.indexOf('--root');
  const root = path.resolve(rootArg >= 0 ? argv[rootArg + 1] : path.resolve(import.meta.dirname, '..'));
  if (argv.includes('--stats')) {
    console.log(JSON.stringify(discoveryStats(root), null, 2));
    process.exit(0);
  }
  const { problems, skills, agents, compiled } = validate(root, { compile: !argv.includes('--no-compile') });
  if (argv.includes('--json')) console.log(JSON.stringify(problems, null, 2));
  else for (const p of problems) console.error(`${p.file}${p.line ? `:${p.line}` : ''}: [${p.rule}] ${p.message}`);
  console.log(`validate-knowledge: ${skills.length} skill(s), ${agents.length} agent(s), ${compiled} compiled sample(s), ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
