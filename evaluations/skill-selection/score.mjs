#!/usr/bin/env node
// Deterministic scorer and dataset checker for the GameDNA skill-selection evaluation.
//
//   node score.mjs --check                                  validate dataset/*.jsonl
//   node score.mjs --split dev --predictions <file.json>    score predictions, print JSON
//
// Predictions file: JSON array of { id, skills: string[], specialist: string|null, modules: string[] }.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const repo = path.resolve(here, '..', '..');
export const CATEGORIES = ['explicit', 'implicit', 'near-miss', 'combined', 'no-skill', 'engine', 'project-context', 'mid-task', 'pivot', 'cross-specialist', 'reuse'];
export const ENGINE_SKILLS = { 'threejs-kit': 'three', 'phaser-starter': 'phaser' };

export function skillNames(root = repo) {
  const dir = path.join(root, 'power', 'skills');
  return new Set(readdirSync(dir).filter((d) => existsSync(path.join(dir, d, 'SKILL.md'))));
}
export function agentNames(root = repo) {
  const dir = path.join(root, 'integration', 'kiro', 'agents');
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
}
export function moduleNames(root = repo) {
  const out = new Set();
  for (const pkg of readdirSync(path.join(root, 'packages'))) {
    const pj = path.join(root, 'packages', pkg, 'package.json');
    if (!existsSync(pj)) continue;
    const j = JSON.parse(readFileSync(pj, 'utf8'));
    if (!j.name?.startsWith('@gamedna/') || !j.exports) continue;
    for (const sub of Object.keys(j.exports)) out.add(sub === '.' ? pkg : `${pkg}/${sub.slice(2)}`);
  }
  return out;
}

export function loadDataset(split, root = repo) {
  const dir = path.join(root, 'evaluations', 'skill-selection', 'dataset');
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl') && (!split || f === `${split}.jsonl` || f.startsWith(`${split}-`))).sort();
  const cases = [];
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try { cases.push({ ...JSON.parse(line), _file: f, _line: i + 1 }); } catch (e) { cases.push({ _file: f, _line: i + 1, _error: String(e) }); }
    });
  }
  return cases;
}

/** Every problem with the dataset, as strings. */
export function checkDataset(cases, root = repo) {
  const skills = skillNames(root), agents = agentNames(root), modules = moduleNames(root);
  const problems = [], ids = new Set(), requests = new Map();
  for (const c of cases) {
    const at = `${c._file}:${c._line}`;
    if (c._error) { problems.push(`${at}: invalid JSON (${c._error})`); continue; }
    const p = (m) => problems.push(`${at} ${c.id ?? ''}: ${m}`);
    if (typeof c.id !== 'string' || !/^(dev|heldout)-[a-z-]+-\d{3}$/.test(c.id)) p('id must look like dev-<category>-001');
    if (ids.has(c.id)) p('duplicate id');
    ids.add(c.id);
    if (!['dev', 'heldout'].includes(c.split) || !c._file.startsWith(c.split)) p(`split "${c.split}" must match its file`);
    if (!CATEGORIES.includes(c.category)) p(`unknown category "${c.category}"`);
    else if (!c.id?.startsWith(`${c.split}-${c.category}-`)) p('id must contain the split and category');
    if (c.role !== 'director' && !agents.has(c.role)) p(`unknown role "${c.role}"`);
    if (c.role === 'gamedna-director') p('use role "director" for the coordinating agent');
    const ctx = c.context ?? {};
    if (typeof c.request !== 'string' || c.request.length < 15) p('request is missing or too short');
    const key = (c.request ?? '').toLowerCase().replace(/\W+/g, ' ').trim();
    if (requests.has(key)) p(`same request as ${requests.get(key)}`);
    requests.set(key, c.id);
    const prof = ctx.profile;
    if (prof !== null && (typeof prof !== 'object' || typeof prof.engine !== 'string')) p('context.profile must be null or { engine, version, support }');
    if (prof && !['tested', 'untested-version', 'unsupported'].includes(prof.support)) p(`profile.support "${prof.support}" is not tested, untested-version or unsupported`);
    const loaded = ctx.loaded ?? [];
    if (!Array.isArray(loaded)) p('context.loaded must be an array');
    for (const s of loaded) if (!skills.has(s)) p(`context.loaded names unknown skill "${s}"`);
    const e = c.expected ?? {};
    for (const k of ['skills', 'forbidden', 'modules']) if (!Array.isArray(e[k])) p(`expected.${k} must be an array`);
    if (!('specialist' in e)) p('expected.specialist must be present (null or an agent)');
    for (const s of [...(e.skills ?? []), ...(e.forbidden ?? [])]) if (!skills.has(s)) p(`unknown skill "${s}"`);
    for (const s of e.skills ?? []) if (loaded.includes(s)) p(`expected skill "${s}" is already loaded; it would be a repeated read`);
    for (const s of e.forbidden ?? []) if ((e.skills ?? []).includes(s)) p(`"${s}" is both expected and forbidden`);
    if (e.specialist !== null && e.specialist !== undefined && !agents.has(e.specialist)) p(`unknown specialist "${e.specialist}"`);
    if (e.specialist === c.role) p('a specialist cannot hand work to itself');
    for (const m of e.modules ?? []) if (!modules.has(m)) p(`unknown module "${m}"`);
    if (c.category === 'no-skill' && e.skills?.length) p('no-skill cases expect no skills');
    if (c.category === 'combined' && (e.skills?.length ?? 0) < 2) p('combined cases expect at least two skills');
    if (c.category === 'near-miss' && !e.forbidden?.length) p('near-miss cases need a forbidden skill');
    if (c.category === 'reuse' && !e.modules?.length) p('reuse cases need expected modules');
    if (c.category === 'cross-specialist' && c.role === 'director') p('cross-specialist cases have a specialist role');
    if (['mid-task', 'pivot'].includes(c.category) && !ctx.task) p(`${c.category} cases need context.task`);
    for (const s of e.skills ?? []) {
      const eng = ENGINE_SKILLS[s];
      if (eng && prof && prof.engine !== eng) p(`expects ${s} for a ${prof.engine} project`);
    }
  }
  return problems;
}

const ratio = (a, b) => (b === 0 ? null : a / b);
const round = (x) => (x === null ? null : Math.round(x * 1000) / 1000);

/** Scores predictions against cases. Missing predictions count as empty selections. */
export function score(cases, predictions) {
  const byId = new Map(predictions.map((p) => [p.id, p]));
  let tp = 0, fp = 0, fn = 0, exact = 0, repeated = 0, missingPredictions = 0;
  let nearTotal = 0, nearRejected = 0, forbTotal = 0, forbClean = 0;
  let specTotal = 0, specRight = 0, modTotal = 0, modFound = 0, modCases = 0, modCasesFull = 0;
  let engineCases = 0, engineMismatch = 0;
  const perCategory = {};
  const failures = [];
  for (const c of cases) {
    const pred = byId.get(c.id);
    if (!pred) missingPredictions++;
    const got = new Set(pred?.skills ?? []), want = new Set(c.expected.skills);
    const loaded = new Set(c.context?.loaded ?? []);
    if (c.role === 'director') loaded.add('gamedna-director');
    const ctp = [...got].filter((s) => want.has(s)).length;
    const cfp = [...got].filter((s) => !want.has(s)).length;
    const cfn = [...want].filter((s) => !got.has(s)).length;
    tp += ctp; fp += cfp; fn += cfn;
    const isExact = cfp === 0 && cfn === 0;
    if (isExact) exact++;
    repeated += [...got].filter((s) => loaded.has(s)).length;
    const forbiddenHit = c.expected.forbidden.filter((s) => got.has(s));
    if (c.expected.forbidden.length) { forbTotal++; if (!forbiddenHit.length) forbClean++; }
    if (c.category === 'near-miss') { nearTotal++; if (!forbiddenHit.length) nearRejected++; }
    const specOk = (pred?.specialist ?? null) === c.expected.specialist;
    specTotal++; if (specOk) specRight++;
    if (c.expected.modules.length) {
      modCases++;
      const gotM = new Set((pred?.modules ?? []).map((m) => m.replace(/^@gamedna\//, '')));
      const found = c.expected.modules.filter((m) => gotM.has(m)).length;
      modTotal += c.expected.modules.length; modFound += found;
      if (found === c.expected.modules.length) modCasesFull++;
    }
    const prof = c.context?.profile;
    if (prof) {
      engineCases++;
      if ([...got].some((s) => ENGINE_SKILLS[s] && ENGINE_SKILLS[s] !== prof.engine)) engineMismatch++;
    }
    const pc = (perCategory[c.category] ??= { cases: 0, exact: 0, tp: 0, fp: 0, fn: 0, specialistRight: 0 });
    pc.cases++; pc.tp += ctp; pc.fp += cfp; pc.fn += cfn; if (isExact) pc.exact++; if (specOk) pc.specialistRight++;
    if (!isExact || !specOk || forbiddenHit.length) failures.push({ id: c.id, category: c.category, role: c.role, expected: c.expected.skills, got: [...got], forbiddenHit, expectedSpecialist: c.expected.specialist, gotSpecialist: pred?.specialist ?? null });
  }
  const precision = ratio(tp, tp + fp), recall = ratio(tp, tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
  const cat = (name) => perCategory[name] ? round(perCategory[name].exact / perCategory[name].cases) : null;
  return {
    cases: cases.length,
    missingPredictions,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    exactSetAccuracy: round(ratio(exact, cases.length)),
    nearMissRejection: round(ratio(nearRejected, nearTotal)),
    forbiddenAvoidance: round(ratio(forbClean, forbTotal)),
    combinedExact: cat('combined'),
    midTaskExact: cat('mid-task'),
    pivotExact: cat('pivot'),
    crossSpecialistExact: cat('cross-specialist'),
    engineMismatchRate: round(ratio(engineMismatch, engineCases)),
    unnecessaryLoads: fp,
    missedLoads: fn,
    repeatedReads: repeated,
    specialistAccuracy: round(ratio(specRight, specTotal)),
    moduleRecall: round(ratio(modFound, modTotal)),
    moduleCaseDiscovery: round(ratio(modCasesFull, modCases)),
    perCategory: Object.fromEntries(Object.entries(perCategory).sort().map(([k, v]) => [k, { ...v, exact: round(v.exact / v.cases), specialistRight: round(v.specialistRight / v.cases) }])),
    failures,
  };
}

function main(argv) {
  const get = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--check')) {
    const cases = loadDataset(get('--split'));
    const problems = checkDataset(cases);
    for (const p of problems) console.error(p);
    const counts = {};
    for (const c of cases) counts[`${c.split}/${c.category}`] = (counts[`${c.split}/${c.category}`] ?? 0) + 1;
    console.log(JSON.stringify({ cases: cases.length, counts }, null, 2));
    console.log(`dataset check: ${cases.length} case(s), ${problems.length} problem(s)`);
    return problems.length ? 1 : 0;
  }
  const file = get('--predictions');
  if (!file) { console.error('usage: score.mjs --check | --split <dev|heldout> --predictions <file>'); return 2; }
  const cases = loadDataset(get('--split'));
  const result = score(cases, JSON.parse(readFileSync(file, 'utf8')));
  if (!argv.includes('--failures')) delete result.failures;
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
