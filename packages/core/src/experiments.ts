import { z } from 'zod';
import { GameDNAError } from './errors.js';
import {
  CheckStatusSchema,
  ConstraintIdSchema,
  LIMITS,
  ParameterKeySchema,
  ParameterValueSchema,
  type ParameterSpec,
  type ParameterValue,
  type ParameterValues,
  type ProjectRecord,
} from './schemas.js';

export interface OverrideRules {
  allowProtected?: boolean;
  allowFault?: boolean;
}

export interface OverrideProblem {
  key: string;
  reason: string;
}

/** Check overrides against the project's parameter allowlist, types and ranges. */
export function checkParameterOverrides(
  specs: Record<string, ParameterSpec>,
  overrides: Record<string, unknown>,
  rules: OverrideRules = {},
): OverrideProblem[] {
  const problems: OverrideProblem[] = [];
  const keys = Object.keys(overrides);
  if (keys.length > LIMITS.maxParameters) problems.push({ key: '*', reason: `At most ${LIMITS.maxParameters} overrides are allowed` });
  for (const key of keys) {
    const spec = specs[key];
    const value = overrides[key];
    if (!spec) {
      problems.push({ key, reason: 'Not in the project parameter allowlist (.gamedna/project.json "parameters")' });
      continue;
    }
    if (spec.protected && !rules.allowProtected) problems.push({ key, reason: 'Protected gameplay parameter; experiments may not change it' });
    if (spec.fault && !rules.allowFault) problems.push({ key, reason: 'Seeded-fault switch; only scenario runs may enable it' });
    if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') problems.push({ key, reason: `Expected boolean, got ${typeof value}` });
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push({ key, reason: `Expected finite number${spec.unit ? ` in ${spec.unit}` : ''}, got ${JSON.stringify(value)}` });
      continue;
    }
    if (spec.min !== undefined && value < spec.min) problems.push({ key, reason: `${value} is below min ${spec.min}${spec.unit ? ` ${spec.unit}` : ''}` });
    if (spec.max !== undefined && value > spec.max) problems.push({ key, reason: `${value} is above max ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}` });
  }
  return problems;
}

export function assertParameterOverrides(specs: Record<string, ParameterSpec>, overrides: Record<string, unknown>, rules: OverrideRules = {}): ParameterValues {
  const problems = checkParameterOverrides(specs, overrides, rules);
  if (problems.length > 0) {
    throw new GameDNAError('INVALID_PARAMETER', `Rejected ${problems.length} parameter override(s)`, {
      details: { problems },
      fix: 'Use keys from .gamedna/project.json "parameters" within their min/max; do not change protected or fault parameters in experiments.',
    });
  }
  return overrides as ParameterValues;
}

const VariantIdSchema = z.enum(['baseline', 'A', 'B', 'C']);

export const VariantInputSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  label: z.string().min(1).max(40),
  rationale: z.string().min(1).max(400),
  changes: z.string().max(300).default(''),
  parameters: z.record(ParameterKeySchema, ParameterValueSchema),
});

export const CreateExperimentInputSchema = z.object({
  question: z.string().min(3).max(300),
  scenarioIds: z.array(z.string().max(63)).min(1).max(LIMITS.maxScenariosPerExperiment),
  protectedChecks: z.array(ConstraintIdSchema).max(20).default([]),
  variants: z.array(VariantInputSchema).min(2).max(LIMITS.maxVariants),
});
export type CreateExperimentInput = z.input<typeof CreateExperimentInputSchema>;

export const MetricRangeSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string(),
  value: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  runs: z.number(),
  resolution: z.string(),
  method: z.string(),
});

export const VariantEvidenceSchema = z.object({
  scenarioId: z.string(),
  status: CheckStatusSchema,
  checks: z.array(z.object({ id: z.string(), status: CheckStatusSchema, observed: z.string().optional(), tick: z.number().optional() })),
  metrics: z.array(MetricRangeSchema),
  traceId: z.string().nullable(),
  reproducibility: z.string(),
  screenshotIds: z.array(z.string()).default([]),
});
export type VariantEvidence = z.infer<typeof VariantEvidenceSchema>;

export const ExperimentRecordSchema = z.object({
  schemaVersion: z.literal(1),
  experimentId: z.string().regex(/^exp-[a-z0-9-]{4,60}$/),
  projectId: z.string(),
  createdAt: z.string(),
  baselineRevision: z.string(),
  baselineParameters: z.record(z.string(), ParameterValueSchema),
  question: z.string(),
  scenarioIds: z.array(z.string()),
  protectedChecks: z.array(z.string()),
  variants: z.array(
    z.object({
      id: VariantIdSchema,
      label: z.string(),
      rationale: z.string(),
      changes: z.string(),
      parameters: z.record(z.string(), ParameterValueSchema),
    }),
  ),
  status: z.enum(['pending', 'selected', 'rejected']),
  selection: z
    .object({
      variantId: VariantIdSchema.nullable(),
      rationale: z.string().max(1000),
      source: z.enum(['workbench', 'chat']),
      userStatement: z.string().max(1000).optional(),
      at: z.string(),
    })
    .nullable(),
  evidence: z
    .object({
      generatedAt: z.string(),
      sessionId: z.string().nullable(),
      seedNote: z.string(),
      results: z.record(z.string(), z.array(VariantEvidenceSchema)),
      notTestedReason: z.string().nullable(),
    })
    .nullable(),
  decisionId: z.string().nullable(),
});
export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;
export type ExperimentVariant = ExperimentRecord['variants'][number];

export function createExperiment(args: {
  project: ProjectRecord;
  baselineValues: ParameterValues;
  input: CreateExperimentInput;
  revision: string;
  experimentId: string;
  now: string;
  knownScenarioIds: readonly string[];
}): ExperimentRecord {
  const parsed = CreateExperimentInputSchema.safeParse(args.input);
  if (!parsed.success) {
    throw new GameDNAError('INVALID_INPUT', 'Experiment input is invalid', { details: { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) } });
  }
  const input = parsed.data;
  const ids = input.variants.map((v) => v.id);
  if (new Set(ids).size !== ids.length) throw new GameDNAError('INVALID_INPUT', 'Variant IDs must be unique (A, B, C)');

  const unknownScenarios = input.scenarioIds.filter((s) => !args.knownScenarioIds.includes(s));
  if (unknownScenarios.length) {
    throw new GameDNAError('NOT_FOUND', `Unknown scenario(s): ${unknownScenarios.join(', ')}`, { details: { known: args.knownScenarioIds } });
  }
  const constraintIds = args.project.constraints.map((c) => c.id);
  const unknownChecks = input.protectedChecks.filter((c) => !constraintIds.includes(c));
  if (unknownChecks.length) throw new GameDNAError('NOT_FOUND', `Unknown protected check(s): ${unknownChecks.join(', ')}`, { details: { known: constraintIds } });

  const problems: Array<{ variant: string; key: string; reason: string }> = [];
  const signatures = new Set<string>();
  for (const v of input.variants) {
    for (const p of checkParameterOverrides(args.project.parameters, v.parameters)) problems.push({ variant: v.id, ...p });
    const changed = Object.entries(v.parameters).filter(([k, val]) => args.baselineValues[k] !== val);
    if (changed.length === 0) problems.push({ variant: v.id, key: '*', reason: 'Variant does not change any parameter from the baseline' });
    const sig = JSON.stringify(Object.entries({ ...args.baselineValues, ...v.parameters }).sort());
    if (signatures.has(sig)) problems.push({ variant: v.id, key: '*', reason: 'Variant is identical to another variant' });
    signatures.add(sig);
  }
  if (problems.length) {
    throw new GameDNAError('INVALID_PARAMETER', `Rejected ${problems.length} variant problem(s)`, { details: { problems } });
  }

  return {
    schemaVersion: 1,
    experimentId: args.experimentId,
    projectId: args.project.projectId,
    createdAt: args.now,
    baselineRevision: args.revision,
    baselineParameters: { ...args.baselineValues },
    question: input.question,
    scenarioIds: input.scenarioIds,
    protectedChecks: input.protectedChecks,
    variants: [
      { id: 'baseline', label: 'Baseline', rationale: 'Current tuning file values', changes: 'No changes', parameters: {} },
      ...input.variants.map((v) => ({ id: v.id, label: v.label, rationale: v.rationale, changes: v.changes, parameters: v.parameters })),
    ],
    status: 'pending',
    selection: null,
    evidence: null,
    decisionId: null,
  };
}

/** Full parameter set for a variant: baseline values with the variant's overrides applied. */
export function effectiveParameters(exp: ExperimentRecord, variantId: string): ParameterValues {
  const v = exp.variants.find((x) => x.id === variantId);
  if (!v) throw new GameDNAError('NOT_FOUND', `Variant ${variantId} not in ${exp.experimentId}`);
  return { ...exp.baselineParameters, ...v.parameters };
}

export function recordSelection(
  exp: ExperimentRecord,
  selection: { variantId: 'baseline' | 'A' | 'B' | 'C' | null; rationale?: string; source: 'workbench' | 'chat'; userStatement?: string },
  now: string,
): ExperimentRecord {
  if (exp.status !== 'pending') {
    throw new GameDNAError('INVALID_TRANSITION', `Experiment ${exp.experimentId} is already ${exp.status}`, { fix: 'Create a new experiment to revisit the choice.' });
  }
  if (selection.variantId !== null && !exp.variants.some((v) => v.id === selection.variantId)) {
    throw new GameDNAError('NOT_FOUND', `Variant ${selection.variantId} not in ${exp.experimentId}`);
  }
  if (selection.source === 'chat' && !selection.userStatement?.trim()) {
    throw new GameDNAError('INVALID_INPUT', 'A chat selection must include the user\'s own words in userStatement', {
      fix: 'Only record a selection the user explicitly stated. Never infer it.',
    });
  }
  return {
    ...exp,
    status: selection.variantId === null ? 'rejected' : 'selected',
    selection: {
      variantId: selection.variantId,
      rationale: selection.rationale ?? '',
      source: selection.source,
      ...(selection.userStatement ? { userStatement: selection.userStatement } : {}),
      at: now,
    },
  };
}

export interface ParameterChange {
  key: string;
  from: ParameterValue | undefined;
  to: ParameterValue;
  unit?: string;
}

export function diffParameters(from: ParameterValues, to: ParameterValues, specs: Record<string, ParameterSpec> = {}): ParameterChange[] {
  return Object.keys(to)
    .filter((k) => from[k] !== to[k])
    .sort()
    .map((k) => ({ key: k, from: from[k], to: to[k] as ParameterValue, ...(specs[k]?.unit ? { unit: specs[k]!.unit } : {}) }));
}

export interface MetricDelta {
  scenarioId: string;
  metricId: string;
  label: string;
  unit: string;
  baseline: number | null;
  variant: number | null;
  delta: number | null;
  resolution: string;
}

export function metricDeltas(exp: ExperimentRecord, variantId: string): MetricDelta[] {
  const results = exp.evidence?.results;
  if (!results) return [];
  const base = results['baseline'] ?? [];
  const other = results[variantId] ?? [];
  const out: MetricDelta[] = [];
  for (const ev of other) {
    const b = base.find((x) => x.scenarioId === ev.scenarioId);
    for (const m of ev.metrics) {
      const bm = b?.metrics.find((x) => x.id === m.id);
      const delta = m.value !== null && bm?.value !== null && bm?.value !== undefined ? Math.round((m.value - bm.value) * 100) / 100 : null;
      out.push({ scenarioId: ev.scenarioId, metricId: m.id, label: m.label, unit: m.unit, baseline: bm?.value ?? null, variant: m.value, delta, resolution: m.resolution });
    }
  }
  return out;
}
