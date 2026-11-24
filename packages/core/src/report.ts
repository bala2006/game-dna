import type { DecisionRecord } from './decisions.js';
import type { ExperimentRecord } from './experiments.js';
import type { CheckStatus } from './schemas.js';

export interface ReportRun {
  traceId: string;
  scenarioId: string;
  seed: number;
  status: CheckStatus;
  revision: string;
  params: Record<string, unknown>;
  checks: Array<{ id: string; status: CheckStatus; observed?: string; tick?: number }>;
  metrics: Array<{ id: string; label: string; value: number | null; unit: string }>;
  limitations: string[];
}

export interface ReportInput {
  projectId: string;
  projectName: string;
  generatedAt: string;
  revision: string;
  engine: string;
  runs: ReportRun[];
  experiments: ExperimentRecord[];
  decisions: DecisionRecord[];
  assets: Array<{ id: string; type: string; file: string; generator: string; seed: number; sha256: string; license: string }>;
  limitations: string[];
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  passed: 'PASSED',
  failed: 'FAILED',
  not_tested: 'NOT TESTED',
  unsupported: 'UNSUPPORTED',
  unstable: 'UNSTABLE',
};

function cell(v: unknown): string {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Render a plain Markdown evidence report. Status is always spelled out, never color-only. */
export function renderReport(r: ReportInput): string {
  const lines: string[] = [];
  lines.push(`# GameDNA evidence report: ${r.projectName}`, '');
  lines.push(`- Project: \`${r.projectId}\``, `- Generated: ${r.generatedAt}`, `- Revision: \`${r.revision}\``, `- Engine: ${r.engine}`, '');
  lines.push('## Scenario runs', '');
  if (r.runs.length === 0) lines.push('No runs were selected for this report.', '');
  for (const run of r.runs) {
    lines.push(`### ${run.scenarioId} (trace \`${run.traceId}\`)`, '');
    lines.push(`Result: **${STATUS_LABEL[run.status]}**. Seed ${run.seed}. Revision \`${run.revision}\`.`, '');
    lines.push('| Check | Status | Observation | Tick |', '|---|---|---|---|');
    for (const c of run.checks) lines.push(`| \`${c.id}\` | ${STATUS_LABEL[c.status]} | ${cell(c.observed)} | ${c.tick ?? ''} |`);
    lines.push('');
    if (run.metrics.length) {
      lines.push('| Metric | Value | Unit |', '|---|---|---|');
      for (const m of run.metrics) lines.push(`| ${cell(m.label)} | ${m.value ?? 'n/a'} | ${m.unit} |`);
      lines.push('');
    }
    if (run.limitations.length) lines.push(...run.limitations.map((l) => `- Limitation: ${l}`), '');
  }
  lines.push('## Experiments', '');
  if (r.experiments.length === 0) lines.push('No experiments recorded.', '');
  for (const e of r.experiments) {
    const sel = e.selection ? (e.selection.variantId ? `variant ${e.selection.variantId}` : 'all variants rejected') : 'no selection yet';
    lines.push(`- \`${e.experimentId}\`: ${cell(e.question)}. Status ${e.status}, ${sel}. Baseline \`${e.baselineRevision}\`.`);
  }
  lines.push('', '## Decisions', '');
  if (r.decisions.length === 0) lines.push('No decisions recorded.', '');
  else {
    lines.push('| Decision | Variant | Status | Requirements | Changes |', '|---|---|---|---|---|');
    for (const d of r.decisions) {
      const changes = d.parameterDiff.map((p) => `${p.key}: ${String(p.from)} → ${String(p.to)}${p.unit ? ` ${p.unit}` : ''}`).join('; ');
      lines.push(`| \`${d.decisionId}\` | ${d.chosenVariant ?? 'none'} | ${d.status} | ${d.requirementRefs.join(', ')} | ${cell(changes)} |`);
    }
    lines.push('');
  }
  lines.push('## Asset provenance', '');
  if (r.assets.length === 0) lines.push('No generated assets recorded in the manifest.', '');
  else {
    lines.push('| Asset | Type | File | Generator | Seed | SHA-256 | License |', '|---|---|---|---|---|---|---|');
    for (const a of r.assets) lines.push(`| ${a.id} | ${a.type} | \`${a.file}\` | ${a.generator} | ${a.seed} | \`${a.sha256.slice(0, 16)}…\` | ${a.license} |`);
    lines.push('');
  }
  lines.push('## Known limitations', '');
  for (const l of r.limitations) lines.push(`- ${l}`);
  lines.push('');
  return lines.join('\n');
}
