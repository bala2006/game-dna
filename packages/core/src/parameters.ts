import { GameDNAError } from './errors.js';
import { LIMITS, type ParameterSpec, type ParameterValues } from './schemas.js';

export interface OverrideRules {
  /** Allow changes to parameters marked `protected` (core rules the game must keep). */
  allowProtected?: boolean;
  /** Allow seeded-fault switches; only tests that prove a scenario catches a bug should set this. */
  allowFault?: boolean;
}

export interface OverrideProblem {
  key: string;
  reason: string;
}

/** Check tuning overrides against the project's parameter allowlist, types and ranges. */
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
    if (spec.protected && !rules.allowProtected) problems.push({ key, reason: 'Protected gameplay parameter; tuning changes may not alter it' });
    if (spec.fault && !rules.allowFault) problems.push({ key, reason: 'Seeded-fault switch; only fault-detection tests may enable it' });
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

/** Like `checkParameterOverrides`, but throws `INVALID_PARAMETER` listing every problem. */
export function assertParameterOverrides(specs: Record<string, ParameterSpec>, overrides: Record<string, unknown>, rules: OverrideRules = {}): ParameterValues {
  const problems = checkParameterOverrides(specs, overrides, rules);
  if (problems.length > 0) {
    throw new GameDNAError('INVALID_PARAMETER', `Rejected ${problems.length} parameter override(s)`, {
      details: { problems },
      fix: 'Use keys from .gamedna/project.json "parameters" within their min/max; leave protected and fault parameters alone.',
    });
  }
  return overrides as ParameterValues;
}
