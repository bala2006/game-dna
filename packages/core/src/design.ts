import { ProjectRecordSchema, formatIssues, type ParameterValues, type ProjectRecord } from './schemas.js';
import { checkParameterOverrides } from './experiments.js';

export interface DesignValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Places where the design record and the code disagree. Reported, never auto-resolved. */
  conflicts: Array<{ key: string; recordValue: unknown; sourceValue: unknown }>;
  missingRequirementRefs: string[];
  record: ProjectRecord | null;
}

/** Requirement IDs mentioned in a Kiro requirements file, e.g. "REQ-4" or "REQ-4.2". */
export function extractRequirementIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(/\bREQ-\d+(?:\.\d+)?\b/g)) ids.add(m[0]);
  return ids;
}

export function validateDesign(candidate: unknown, context: { tuningValues?: ParameterValues | null; requirementsMarkdown?: string | null } = {}): DesignValidation {
  const out: DesignValidation = { valid: false, errors: [], warnings: [], conflicts: [], missingRequirementRefs: [], record: null };
  const parsed = ProjectRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    out.errors.push(...formatIssues(parsed.error));
    return out;
  }
  const record = parsed.data;
  out.record = record;

  const ids = record.constraints.map((c) => c.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) out.errors.push(`constraints: duplicate IDs ${[...new Set(dupes)].join(', ')}`);

  if (context.requirementsMarkdown != null) {
    const known = extractRequirementIds(context.requirementsMarkdown);
    out.missingRequirementRefs = [...new Set(record.constraints.map((c) => c.requirementRef).filter((r) => !known.has(r)))];
    for (const ref of out.missingRequirementRefs) out.errors.push(`constraints: requirementRef ${ref} does not appear in ${record.requirementsFile ?? 'the requirements file'}`);
  } else if (record.requirementsFile) {
    out.warnings.push(`requirementsFile ${record.requirementsFile} could not be read; requirement links were not checked`);
  } else {
    out.warnings.push('No requirementsFile set; constraint links to Kiro specs are not checked');
  }

  for (const [key, spec] of Object.entries(record.parameters)) {
    if (spec.value !== undefined) {
      const problems = checkParameterOverrides(record.parameters, { [key]: spec.value }, { allowFault: true, allowProtected: true });
      for (const p of problems) out.errors.push(`parameters.${key}.value: ${p.reason}`);
    }
  }

  if (context.tuningValues) {
    for (const [key, spec] of Object.entries(record.parameters)) {
      const src = context.tuningValues[key];
      if (src === undefined) {
        out.errors.push(`${record.tuningFile}: missing allowlisted parameter "${key}"`);
        continue;
      }
      if (spec.value !== undefined && spec.value !== src) out.conflicts.push({ key, recordValue: spec.value, sourceValue: src });
      for (const p of checkParameterOverrides(record.parameters, { [key]: src }, { allowFault: true, allowProtected: true })) {
        out.errors.push(`${record.tuningFile}: ${key}: ${p.reason}`);
      }
    }
    for (const key of Object.keys(context.tuningValues)) {
      if (!(key in record.parameters)) out.warnings.push(`${record.tuningFile}: "${key}" is not in the allowlist, so experiments cannot change it`);
    }
  }
  if (out.conflicts.length) out.warnings.push(`${out.conflicts.length} value conflict(s) between project.json and ${record.tuningFile}; reconcile them deliberately`);
  if (!record.commands['dev']) out.warnings.push('No "dev" command; gd_start_session needs a command ID or a loopback URL');

  out.valid = out.errors.length === 0;
  return out;
}
