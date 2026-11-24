import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  DecisionLogSchema,
  ExperimentRecordSchema,
  GameDNAError,
  ParameterValueSchema,
  ProjectRecordSchema,
  ScenarioSchema,
  emptyDecisionLog,
  formatIssues,
  type DecisionLog,
  type ExperimentRecord,
  type ParameterValues,
  type ProjectRecord,
  type Scenario,
} from '@gamedna/core';
import { computeRevision, readJsonFile, resolveInside, writeJsonAtomic } from '@gamedna/core/node';
import { z } from 'zod';

export const RECORD_FILE = '.gamedna/project.json';
export const DECISIONS_FILE = '.gamedna/decisions.json';
export const SCENARIO_DIR = '.gamedna/scenarios';
export const EXPERIMENT_DIR = '.gamedna/experiments';
export const EVIDENCE_DIR = '.gamedna/evidence';

const OTHER_ENGINES: Record<string, string> = {
  'pixi.js': 'PixiJS',
  three: 'three.js',
  '@babylonjs/core': 'Babylon.js',
  kaboom: 'Kaboom',
  kaplay: 'KAPLAY',
  excalibur: 'Excalibur',
  'melonjs': 'melonJS',
  'playcanvas': 'PlayCanvas',
};

export interface PackageInfo {
  name: string;
  scripts: Record<string, string>;
  deps: Record<string, string>;
}

export function readPackage(root: string): PackageInfo {
  const file = path.join(root, 'package.json');
  if (!existsSync(file)) {
    throw new GameDNAError('UNSUPPORTED_ENGINE', 'No package.json in the project folder', { fix: 'Point projectPath at a JavaScript/TypeScript game folder.' });
  }
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return { name: pkg.name ?? path.basename(root), scripts: pkg.scripts ?? {}, deps: { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } };
}

export function detectEngine(root: string, pkg: PackageInfo): { id: 'phaser'; version: string; declared: string } {
  if (!pkg.deps['phaser']) {
    const other = Object.keys(OTHER_ENGINES).find((d) => pkg.deps[d]);
    throw new GameDNAError('UNSUPPORTED_ENGINE', other ? `Detected ${OTHER_ENGINES[other]}; GameDNA v0.1 supports Phaser only` : 'No Phaser dependency found', {
      details: { detected: other ? OTHER_ENGINES[other] : null },
      fix: 'GameDNA v0.1 supports Phaser 3 projects. Add "phaser" to package.json, or use a supported project.',
    });
  }
  let version = 'unresolved';
  try {
    const req = createRequire(path.join(root, 'package.json'));
    version = (JSON.parse(readFileSync(req.resolve('phaser/package.json'), 'utf8')) as { version: string }).version;
  } catch {
    // Not installed yet; report the declared range only.
  }
  return { id: 'phaser', version, declared: pkg.deps['phaser'] as string };
}

export function detectPackageManager(root: string, stopAt: string): string {
  let dir = root;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
    if (existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock'))) return 'bun';
    if (existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
    const parent = path.dirname(dir);
    if (dir === stopAt || parent === dir) return 'npm (no lockfile found)';
    dir = parent;
  }
}

export function resolveFromProject(root: string, specifier: string): string | null {
  try {
    return createRequire(path.join(root, 'package.json')).resolve(specifier);
  } catch {
    return null;
  }
}

export interface LoadedProject {
  root: string;
  relPath: string;
  record: ProjectRecord;
  tuning: ParameterValues;
}

export function loadRecord(root: string): ProjectRecord {
  return readJsonFile(resolveInside(root, RECORD_FILE), ProjectRecordSchema, RECORD_FILE);
}

const TuningSchema = z.record(z.string(), ParameterValueSchema);

export function loadTuning(root: string, record: ProjectRecord): ParameterValues {
  return readJsonFile(resolveInside(root, record.tuningFile), TuningSchema, record.tuningFile);
}

export function baselineRevision(root: string, record: ProjectRecord): string {
  return computeRevision(root, [RECORD_FILE, record.tuningFile]);
}

export function listScenarios(root: string): { scenarios: Scenario[]; invalid: Array<{ file: string; errors: string[] }> } {
  const dir = resolveInside(root, SCENARIO_DIR);
  if (!existsSync(dir)) return { scenarios: [], invalid: [] };
  const scenarios: Scenario[] = [];
  const invalid: Array<{ file: string; errors: string[] }> = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    try {
      const parsed = ScenarioSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      if (parsed.success) scenarios.push(parsed.data);
      else invalid.push({ file: f, errors: formatIssues(parsed.error) });
    } catch (err) {
      invalid.push({ file: f, errors: [(err as Error).message] });
    }
  }
  return { scenarios, invalid };
}

export function getScenario(root: string, id: string): Scenario {
  const s = listScenarios(root).scenarios.find((x) => x.id === id);
  if (!s) throw new GameDNAError('NOT_FOUND', `Scenario "${id}" not found in ${SCENARIO_DIR}`, { details: { available: listScenarios(root).scenarios.map((x) => x.id) } });
  return s;
}

export function experimentFile(root: string, id: string): string {
  if (!/^exp-[a-z0-9-]{4,60}$/.test(id)) throw new GameDNAError('INVALID_INPUT', 'Experiment IDs look like exp-20261124-120000-abc123');
  return resolveInside(root, path.posix.join(EXPERIMENT_DIR, `${id}.json`));
}

export function loadExperiment(root: string, id: string): ExperimentRecord {
  return readJsonFile(experimentFile(root, id), ExperimentRecordSchema, `experiment ${id}`);
}

export function saveExperiment(root: string, exp: ExperimentRecord): void {
  writeJsonAtomic(experimentFile(root, exp.experimentId), exp);
}

export function listExperiments(root: string): ExperimentRecord[] {
  const dir = resolveInside(root, EXPERIMENT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^exp-.*\.json$/.test(f))
    .flatMap((f) => {
      try {
        return [loadExperiment(root, f.replace(/\.json$/, ''))];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function loadDecisions(root: string): DecisionLog {
  const file = resolveInside(root, DECISIONS_FILE);
  if (!existsSync(file)) return emptyDecisionLog();
  return readJsonFile(file, DecisionLogSchema, DECISIONS_FILE);
}

export function saveDecisions(root: string, log: DecisionLog): void {
  writeJsonAtomic(resolveInside(root, DECISIONS_FILE), log);
}
