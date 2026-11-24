export type CheckStatus = 'passed' | 'failed' | 'not_tested' | 'unsupported' | 'unstable';

export interface MetricRange {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  min: number | null;
  max: number | null;
  runs: number;
  resolution: string;
}

export interface VariantEvidence {
  scenarioId: string;
  status: CheckStatus;
  checks: Array<{ id: string; status: CheckStatus; observed?: string; tick?: number }>;
  metrics: MetricRange[];
  traceId: string | null;
  reproducibility: string;
}

export interface Variant {
  id: 'baseline' | 'A' | 'B' | 'C';
  label: string;
  rationale: string;
  changes: string;
  parameters: Record<string, number | boolean>;
}

export interface Experiment {
  experimentId: string;
  projectId: string;
  createdAt: string;
  baselineRevision: string;
  question: string;
  scenarioIds: string[];
  protectedChecks: string[];
  variants: Variant[];
  status: 'pending' | 'selected' | 'rejected';
  selection: { variantId: Variant['id'] | null; rationale: string; source: string; at: string } | null;
  evidence: { generatedAt: string; sessionId: string | null; results: Record<string, VariantEvidence[]> } | null;
}

export interface Delta {
  scenarioId: string;
  metricId: string;
  label: string;
  unit: string;
  baseline: number | null;
  variant: number | null;
  delta: number | null;
  resolution: string;
}

export interface ExperimentView {
  experiment: Experiment;
  gameUrl: string | null;
  previews: Array<{ variantId: Variant['id']; url: string | null; parameters: Record<string, number | boolean>; deltas: Delta[] }>;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  relPath: string;
  gameUrl: string | null;
  experiments: Array<{ experimentId: string; question: string; status: string; createdAt: string; variantCount: number }>;
}

export interface Decision {
  decisionId: string;
  experimentId: string;
  chosenVariant: string | null;
  status: string;
  requirementRefs: string[];
  rationale: string;
  baselineRevision: string;
  parameterDiff: Array<{ key: string; from?: number | boolean; to: number | boolean; unit?: string }>;
  history: Array<{ status: string; at: string; note: string }>;
}

const TOKEN_KEY = 'gamedna-token';

/** Read the token from the URL fragment once, keep it in sessionStorage, and scrub the URL. */
export function readHashState(): { token: string | null; project: string | null; experiment: string | null } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fromHash = hash.get('token');
  if (fromHash) sessionStorage.setItem(TOKEN_KEY, fromHash);
  const state = { token: sessionStorage.getItem(TOKEN_KEY), project: hash.get('project'), experiment: hash.get('experiment') };
  if (fromHash) {
    const keep = new URLSearchParams();
    if (state.project) keep.set('project', state.project);
    if (state.experiment) keep.set('experiment', state.experiment);
    history.replaceState(null, '', `${location.pathname}${keep.toString() ? `#${keep.toString()}` : ''}`);
  }
  return state;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY) ?? '';
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-GameDNA-Token': token, ...(init.headers ?? {}) } });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Request failed (${res.status})`);
  return body;
}

export const api = {
  projects: () => call<{ projects: ProjectSummary[] }>('/api/projects'),
  experiment: (projectId: string, experimentId: string) => call<ExperimentView>(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}`),
  decisions: (projectId: string) => call<{ decisions: Decision[] }>(`/api/projects/${encodeURIComponent(projectId)}/decisions`),
  select: (projectId: string, experimentId: string, variantId: Variant['id'] | null, rationale: string) =>
    call<{ experiment: Experiment }>(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/selection`, { method: 'POST', body: JSON.stringify({ variantId, rationale }) }),
};
