import { z } from 'zod';
import { GameDNAError } from './errors.js';
import { ParameterValueSchema, type ProjectRecord } from './schemas.js';
import { diffParameters, effectiveParameters, type ExperimentRecord } from './experiments.js';

export const DECISION_STATUSES = ['proposed', 'selected', 'applied', 'verified', 'rejected', 'stale', 'failed', 'reverted'] as const;
export const DecisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

/** Allowed transitions, from the PRD section 6 state diagram. */
export const DECISION_TRANSITIONS: Record<DecisionStatus, readonly DecisionStatus[]> = {
  proposed: ['selected', 'rejected'],
  selected: ['applied', 'stale'],
  applied: ['verified', 'failed', 'reverted'],
  verified: [],
  rejected: [],
  stale: [],
  failed: [],
  reverted: [],
};

export function canTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  return DECISION_TRANSITIONS[from].includes(to);
}

export const DecisionRecordSchema = z.object({
  decisionId: z.string().regex(/^dec-[a-z0-9-]{4,60}$/),
  experimentId: z.string(),
  requirementRefs: z.array(z.string()),
  protectedChecks: z.array(z.string()),
  baselineRevision: z.string(),
  chosenVariant: z.string().nullable(),
  parameterDiff: z.array(
    z.object({ key: z.string(), from: ParameterValueSchema.optional(), to: ParameterValueSchema, unit: z.string().optional() }),
  ),
  rationale: z.string(),
  source: z.enum(['workbench', 'chat']),
  userStatement: z.string().optional(),
  evidenceIds: z.array(z.string()),
  status: DecisionStatusSchema,
  history: z.array(z.object({ status: DecisionStatusSchema, at: z.string(), note: z.string() })),
  appliedRevision: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const DecisionLogSchema = z.object({ schemaVersion: z.literal(1), decisions: z.array(DecisionRecordSchema) });
export type DecisionLog = z.infer<typeof DecisionLogSchema>;

export function emptyDecisionLog(): DecisionLog {
  return { schemaVersion: 1, decisions: [] };
}

/** Build the decision for a user's selection. Rejections are recorded as terminal "rejected" decisions. */
export function decisionFromSelection(exp: ExperimentRecord, project: ProjectRecord, decisionId: string, now: string): DecisionRecord {
  if (!exp.selection) throw new GameDNAError('INVALID_TRANSITION', `Experiment ${exp.experimentId} has no selection yet`);
  const variantId = exp.selection.variantId;
  const requirementRefs = [
    ...new Set(project.constraints.filter((c) => exp.protectedChecks.includes(c.id)).map((c) => c.requirementRef)),
  ];
  const evidenceIds = Object.values(exp.evidence?.results ?? {})
    .flat()
    .flatMap((e) => [e.traceId, ...e.screenshotIds])
    .filter((x): x is string => typeof x === 'string');
  const parameterDiff = variantId === null ? [] : diffParameters(exp.baselineParameters, effectiveParameters(exp, variantId), project.parameters);
  const status: DecisionStatus = variantId === null ? 'rejected' : 'selected';
  return {
    decisionId,
    experimentId: exp.experimentId,
    requirementRefs,
    protectedChecks: exp.protectedChecks,
    baselineRevision: exp.baselineRevision,
    chosenVariant: variantId,
    parameterDiff: parameterDiff.map((d) => ({ key: d.key, to: d.to, ...(d.from !== undefined ? { from: d.from } : {}), ...(d.unit ? { unit: d.unit } : {}) })),
    rationale: exp.selection.rationale,
    source: exp.selection.source,
    ...(exp.selection.userStatement ? { userStatement: exp.selection.userStatement } : {}),
    evidenceIds,
    status,
    history: [
      { status: 'proposed', at: exp.createdAt, note: `Experiment created: ${exp.question}` },
      { status, at: now, note: variantId === null ? 'User rejected all variants' : `User selected variant ${variantId} via ${exp.selection.source}` },
    ],
    appliedRevision: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionDecision(rec: DecisionRecord, to: DecisionStatus, note: string, now: string, patch: Partial<Pick<DecisionRecord, 'appliedRevision'>> = {}): DecisionRecord {
  if (!canTransition(rec.status, to)) {
    throw new GameDNAError('INVALID_TRANSITION', `Decision ${rec.decisionId} cannot move from ${rec.status} to ${to}`, {
      details: { allowed: DECISION_TRANSITIONS[rec.status] },
    });
  }
  return { ...rec, ...patch, status: to, updatedAt: now, history: [...rec.history, { status: to, at: now, note }] };
}

export function upsertDecision(log: DecisionLog, rec: DecisionRecord): DecisionLog {
  const others = log.decisions.filter((d) => d.decisionId !== rec.decisionId);
  return { ...log, decisions: [...others, rec].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}
