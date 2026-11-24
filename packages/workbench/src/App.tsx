import { useCallback, useEffect, useRef, useState } from 'react';
import { api, readHashState, type CheckStatus, type Decision, type ExperimentView, type ProjectSummary, type Variant } from './api.js';

const STATUS_TEXT: Record<CheckStatus, { icon: string; label: string }> = {
  passed: { icon: '✓', label: 'Passed' },
  failed: { icon: '✗', label: 'Failed' },
  not_tested: { icon: '○', label: 'Not tested' },
  unsupported: { icon: '—', label: 'Unsupported' },
  unstable: { icon: '≈', label: 'Unstable' },
};

/** Status is always icon plus words, never color alone. */
function Status({ status }: { status: CheckStatus }) {
  const s = STATUS_TEXT[status];
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true">{s.icon}</span> {s.label}
    </span>
  );
}

function fmt(v: number | boolean | null | undefined, unit = ''): string {
  if (v === null || v === undefined) return 'n/a';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return `${Math.round(v * 100) / 100}${unit && unit !== 'count' && unit !== 'ratio' ? ` ${unit}` : ''}`;
}

export function App() {
  const [hash] = useState(readHashState);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<{ project: string | null; experiment: string | null }>({ project: hash.project, experiment: hash.experiment });

  useEffect(() => {
    if (!hash.token) {
      setError('No session token. Open the workbench from the link Kiro gave you (gd_compare_experiment).');
      return;
    }
    api.projects().then((r) => setProjects(r.projects), (e: Error) => setError(e.message));
  }, [hash.token, route]);

  return (
    <div className="shell">
      <header className="top">
        <button className="brand" onClick={() => setRoute({ project: null, experiment: null })}>
          GameDNA Workbench
        </button>
        <p className="tagline">Play the variants, compare the evidence, choose. Kiro applies only what you pick.</p>
      </header>
      <main id="main">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!error && !projects && <p aria-live="polite">Loading…</p>}
        {projects && route.project && route.experiment ? (
          <Compare projectId={route.project} experimentId={route.experiment} onBack={() => setRoute({ project: null, experiment: null })} />
        ) : projects ? (
          <Overview projects={projects} open={(project, experiment) => setRoute({ project, experiment })} />
        ) : null}
      </main>
    </div>
  );
}

function Overview({ projects, open }: { projects: ProjectSummary[]; open: (p: string, e: string) => void }) {
  if (projects.length === 0) return <p>No projects yet. Ask Kiro to run gd_project_status on a game.</p>;
  return (
    <>
      {projects.map((p) => (
        <section key={p.projectId} className="card" aria-labelledby={`p-${p.projectId}`}>
          <h2 id={`p-${p.projectId}`}>{p.name}</h2>
          <p className="muted">
            <code>{p.relPath}</code> · game {p.gameUrl ? <code>{p.gameUrl}</code> : 'no dev URL'}
          </p>
          <h3>Experiments</h3>
          {p.experiments.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <ul className="list">
              {p.experiments.map((e) => (
                <li key={e.experimentId}>
                  <button className="link" onClick={() => open(p.projectId, e.experimentId)}>
                    {e.question}
                  </button>{' '}
                  <span className="pill">{e.status}</span> <span className="muted">{e.variantCount} variants · {new Date(e.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <Decisions projectId={p.projectId} />
        </section>
      ))}
    </>
  );
}

function Decisions({ projectId }: { projectId: string }) {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  useEffect(() => {
    api.decisions(projectId).then((r) => setDecisions(r.decisions), () => setDecisions([]));
  }, [projectId]);
  if (!decisions?.length) return null;
  return (
    <>
      <h3>Decision history</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Decision</th>
            <th scope="col">Variant</th>
            <th scope="col">Status</th>
            <th scope="col">Requirements</th>
            <th scope="col">Changes</th>
            <th scope="col">Revert</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.decisionId}>
              <td>
                <code>{d.decisionId}</code>
              </td>
              <td>{d.chosenVariant ?? 'none'}</td>
              <td>{d.status}</td>
              <td>{d.requirementRefs.join(', ') || '—'}</td>
              <td>{d.parameterDiff.map((p) => `${p.key}: ${fmt(p.from, p.unit)} → ${fmt(p.to, p.unit)}`).join('; ') || '—'}</td>
              <td className="muted">Ask Kiro: gd_prepare_change mode "revert"</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Compare({ projectId, experimentId, onBack }: { projectId: string; experimentId: string; onBack: () => void }) {
  const [view, setView] = useState<ExperimentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blind, setBlind] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});

  const load = useCallback(() => {
    api.experiment(projectId, experimentId).then(setView, (e: Error) => setError(e.message));
  }, [projectId, experimentId]);
  useEffect(load, [load]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!view) return <p aria-live="polite">Loading experiment…</p>;
  const exp = view.experiment;
  const decided = exp.status !== 'pending';

  const choose = async (variantId: Variant['id'] | null) => {
    setSaving(true);
    try {
      await api.select(projectId, experimentId, variantId, rationale);
      setMessage(variantId ? `Recorded: you chose ${variantId === 'baseline' ? 'the baseline' : `variant ${variantId}`}. Tell Kiro to apply it.` : 'Recorded: you rejected all variants. Your project stays unchanged.');
      load();
    } catch (e) {
      setMessage(`Could not save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  const focusVariant = (id: string) => {
    const f = frames.current[id];
    f?.focus();
    f?.contentWindow?.focus();
  };

  return (
    <>
      <button className="link" onClick={onBack}>
        ← All projects
      </button>
      <h2>{exp.question}</h2>
      <p className="muted">
        Experiment <code>{exp.experimentId}</code> · baseline <code>{exp.baselineRevision}</code> · protected {exp.protectedChecks.join(', ') || 'none'}
      </p>
      <div className="toolbar" role="group" aria-label="Comparison controls">
        <button onClick={() => setResetKey((k) => k + 1)}>Reset all variants</button>
        <label className="check">
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind mode (hide labels and parameters)
        </label>
      </div>
      <p className="hint">Click “Play” to give a variant keyboard focus. Every variant starts from the same seed, controls and viewport. Nothing in your project changes until you choose and Kiro applies it.</p>

      <div className="grid">
        {exp.variants.map((v, i) => {
          const preview = view.previews.find((p) => p.variantId === v.id);
          const name = blind ? `Option ${i + 1}` : v.id === 'baseline' ? 'Baseline' : `Variant ${v.id}: ${v.label}`;
          return (
            <section key={v.id} className="variant" aria-labelledby={`v-${v.id}`}>
              <h3 id={`v-${v.id}`}>{name}</h3>
              {!blind && <p className="muted small">{v.rationale}</p>}
              {preview?.url ? (
                <iframe
                  key={`${v.id}-${resetKey}`}
                  ref={(el) => {
                    frames.current[v.id] = el;
                  }}
                  title={`${name} playable preview`}
                  src={preview.url}
                  sandbox="allow-scripts allow-same-origin"
                  tabIndex={0}
                />
              ) : (
                <p className="frame-missing">The game dev server is not configured, so this variant cannot be played here.</p>
              )}
              <div className="row">
                <button onClick={() => focusVariant(v.id)} disabled={!preview?.url}>
                  Play {blind ? `option ${i + 1}` : v.id}
                </button>
                <button className="primary" onClick={() => void choose(v.id)} disabled={decided || saving}>
                  Choose {blind ? `option ${i + 1}` : v.id === 'baseline' ? 'baseline' : v.id}
                </button>
              </div>
              {!blind && v.id !== 'baseline' && (
                <details>
                  <summary>Parameter changes</summary>
                  <ul className="small">
                    {Object.entries(v.parameters).map(([k, val]) => (
                      <li key={k}>
                        <code>{k}</code>: {fmt(view.previews.find((p) => p.variantId === 'baseline')?.parameters[k])} → {fmt(val)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>

      <section className="card" aria-labelledby="evidence">
        <h3 id="evidence">Evidence</h3>
        {!exp.evidence ? (
          <p>No measurements yet. Ask Kiro to run gd_compare_experiment.</p>
        ) : (
          exp.scenarioIds.map((sid) => (
            <div key={sid} className="scenario">
              <h4>
                Scenario <code>{sid}</code>
              </h4>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    {exp.variants.map((v, i) => (
                      <th scope="col" key={v.id}>
                        {blind ? `Option ${i + 1}` : v.id === 'baseline' ? 'Baseline' : v.id}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Protected checks</th>
                    {exp.variants.map((v) => {
                      const ev = exp.evidence?.results[v.id]?.find((e) => e.scenarioId === sid);
                      return <td key={v.id}>{ev ? <Status status={ev.status} /> : '—'}</td>;
                    })}
                  </tr>
                  {(exp.evidence?.results['baseline']?.find((e) => e.scenarioId === sid)?.metrics ?? [])
                    .filter((m) => exp.variants.some((v) => exp.evidence?.results[v.id]?.find((e) => e.scenarioId === sid)?.metrics.find((x) => x.id === m.id)?.value !== null))
                    .map((m) => (
                      <tr key={m.id}>
                        <th scope="row" title={m.resolution}>
                          {m.label} <span className="muted small">({m.unit})</span>
                        </th>
                        {exp.variants.map((v) => {
                          const mv = exp.evidence?.results[v.id]?.find((e) => e.scenarioId === sid)?.metrics.find((x) => x.id === m.id);
                          const d = v.id === 'baseline' || mv?.value == null || m.value == null ? null : Math.round((mv.value - m.value) * 100) / 100;
                          return (
                            <td key={v.id}>
                              {fmt(mv?.value ?? null)}
                              {mv && mv.min !== mv.max ? <span className="muted small"> (range {fmt(mv.min)}–{fmt(mv.max)})</span> : null}
                              {d !== null && d !== 0 ? <span className="delta"> {d > 0 ? '+' : ''}{d}</span> : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="muted small">Timing resolution is one simulation tick (16.67 ms at 60 Hz). Ranges come from repeated identical-seed runs. Metrics describe behavior; they do not rank fun.</p>
            </div>
          ))
        )}
      </section>

      <section className="card" aria-labelledby="choose">
        <h3 id="choose">Your choice</h3>
        {decided ? (
          <p>
            <strong>{exp.status === 'rejected' ? 'All variants rejected.' : `Chosen: ${exp.selection?.variantId === 'baseline' ? 'baseline' : `variant ${exp.selection?.variantId}`}.`}</strong> {exp.selection?.rationale ? `Reason: ${exp.selection.rationale}` : ''}
          </p>
        ) : (
          <>
            <label htmlFor="rationale">Why? (optional, saved with the decision)</label>
            <textarea id="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={1000} rows={3} />
            <div className="row">
              <button onClick={() => void choose(null)} disabled={saving}>
                Reject all, keep my game as is
              </button>
            </div>
          </>
        )}
        <p aria-live="polite" className="message">
          {message}
        </p>
      </section>
    </>
  );
}
