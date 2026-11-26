import { z } from 'zod';

/** Hard limits that keep every runtime operation bounded (PRD section 12). */
export const LIMITS = {
  maxTicks: 36_000,
  maxInputs: 5_000,
  maxAssertions: 40,
  maxCheckpoints: 8,
  maxSamples: 6_000,
  maxEvents: 20_000,
  maxRepeat: 10,
  maxParameters: 200,
} as const;

export const CHECK_STATUSES = ['passed', 'failed', 'not_tested', 'unsupported', 'unstable'] as const;
export const CheckStatusSchema = z.enum(CHECK_STATUSES);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const PrimitiveSchema = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
export type Primitive = z.infer<typeof PrimitiveSchema>;

export const ParameterKeySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, 'Parameter keys are dotted lowerCamel segments, e.g. "movement.maxSpeed"');

export const ParameterValueSchema = z.union([z.number().refine(Number.isFinite, 'must be finite'), z.boolean()]);
export type ParameterValue = z.infer<typeof ParameterValueSchema>;
export type ParameterValues = Record<string, ParameterValue>;

export const ParameterSpecSchema = z
  .object({
    type: z.enum(['number', 'boolean']).default('number'),
    value: ParameterValueSchema.optional(),
    unit: z.string().max(16).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    description: z.string().max(300).optional(),
    group: z.string().max(40).optional(),
    /** Protected parameters encode game rules; tuning changes may not alter them. */
    protected: z.boolean().default(false),
    /** Seeded-fault switches used by tests to prove a scenario detects a known bug. */
    fault: z.boolean().default(false),
  })
  .refine((s) => s.min === undefined || s.max === undefined || s.min <= s.max, { message: 'min must be <= max' });
export type ParameterSpec = z.infer<typeof ParameterSpecSchema>;

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/, 'Use lowercase kebab-case, 2-63 characters');
export const ConstraintIdSchema = z.string().regex(/^[A-Z][A-Z0-9]*-\d{2}$/, 'Constraint IDs look like "MOVE-01"');

export const ConstraintSchema = z.object({
  id: ConstraintIdSchema,
  requirementRef: z.string().regex(/^REQ-\d+(\.\d+)?$/, 'Requirement refs look like "REQ-4" or "REQ-4.2"'),
  statement: z.string().min(3).max(300),
});
export type Constraint = z.infer<typeof ConstraintSchema>;


export const MovementMetricsSchema = z.object({
  family: z.literal('movement'),
  x: z.string(),
  y: z.string(),
  vx: z.string(),
  gravitySign: z.string().optional(),
  jumpEvent: z.string().default('jump'),
  landEvent: z.string().default('land'),
  moveKey: z.string().default('right'),
});
export const CombatMetricsSchema = z.object({
  family: z.literal('combat'),
  attackEvent: z.string().default('attack'),
  hitEvent: z.string().default('hit'),
  feedbackEvents: z.array(z.string()).max(10).default(['hitstop', 'knockback', 'flash', 'shake']),
  hitstopField: z.string().optional(),
});
export const MetricFamilySchema = z.discriminatedUnion('family', [MovementMetricsSchema, CombatMetricsSchema]);
export type MetricFamily = z.infer<typeof MetricFamilySchema>;
export type MovementMetricsConfig = z.infer<typeof MovementMetricsSchema>;
export type CombatMetricsConfig = z.infer<typeof CombatMetricsSchema>;

export const ProjectRecordSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: IdSchema,
  name: z.string().min(1).max(80),
  engine: z.object({ id: z.string(), version: z.string() }),
  design: z.object({
    genre: z.string().max(60),
    coreLoop: z.string().max(200),
    stylePack: z.string().max(40),
    experienceGoals: z.array(z.string().max(40)).max(8),
  }),
  /** Kiro spec requirements file, relative to the project root. */
  requirementsFile: z.string().max(200).optional(),
  /** The native tuning file the game reads. */
  tuningFile: z.string().max(200),
  constraints: z.array(ConstraintSchema).max(50),
  parameters: z.record(ParameterKeySchema, ParameterSpecSchema),
  metrics: z.array(MetricFamilySchema).max(4).default([]),
});
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

export const ComparisonOpSchema = z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']);
export type ComparisonOp = z.infer<typeof ComparisonOpSchema>;

const TickSchema = z.number().int().min(0).max(LIMITS.maxTicks);

export const AssertionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('eventCount'),
    checkId: ConstraintIdSchema,
    event: z.string().max(40),
    where: z.record(z.string(), PrimitiveSchema).optional(),
    op: ComparisonOpSchema,
    value: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('stateAlways'),
    checkId: ConstraintIdSchema,
    path: z.string().max(80),
    op: ComparisonOpSchema,
    value: PrimitiveSchema,
    fromTick: TickSchema.optional(),
  }),
  z.object({
    type: z.literal('stateAtEnd'),
    checkId: ConstraintIdSchema,
    path: z.string().max(80),
    op: ComparisonOpSchema,
    value: PrimitiveSchema,
  }),
  z.object({
    type: z.literal('minEventInterval'),
    checkId: ConstraintIdSchema,
    event: z.string().max(40),
    minMs: z.number().min(0).optional(),
    minMsFromParam: ParameterKeySchema.optional(),
  }),
  z.object({
    type: z.literal('eventUnique'),
    checkId: ConstraintIdSchema,
    event: z.string().max(40),
    key: z.string().max(40),
  }),
]);
export type Assertion = z.infer<typeof AssertionSchema>;

export const InputTransitionSchema = z.object({
  tick: TickSchema,
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,19}$/),
  down: z.boolean(),
});
export type InputTransition = z.infer<typeof InputTransitionSchema>;

export const ScenarioSchema = z.object({
  id: IdSchema,
  description: z.string().max(300),
  seed: z.number().int().min(0).max(2_147_483_647),
  maxTicks: z.number().int().min(1).max(LIMITS.maxTicks),
  setup: z.record(z.string(), PrimitiveSchema).default({}),
  params: z.record(ParameterKeySchema, ParameterValueSchema).default({}),
  inputs: z.array(InputTransitionSchema).max(LIMITS.maxInputs),
  checkpoints: z.array(TickSchema).max(LIMITS.maxCheckpoints).default([]),
  sampleEvery: z.number().int().min(1).max(60).default(1),
  assertions: z.array(AssertionSchema).max(LIMITS.maxAssertions),
  tags: z.array(z.string().max(30)).max(10).default([]),
  /** Scenario is expected to fail only when this fault parameter is enabled. Documentation aid. */
  detectsFault: ParameterKeySchema.optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;

export type FlatState = Record<string, Primitive>;

export interface TraceEvent {
  seq: number;
  tick: number;
  type: string;
  data: Record<string, Primitive>;
}

export interface RawEvent {
  type: string;
  data?: Record<string, Primitive>;
}

export interface TraceSample {
  tick: number;
  state: FlatState;
}

/** Format a Zod error as a list of "path: message" lines Kiro can act on. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${where}: ${issue.message}`;
  });
}
