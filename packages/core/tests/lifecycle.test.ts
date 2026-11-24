import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DECISION_STATUSES,
  DECISION_TRANSITIONS,
  GameDNAError,
  ProjectRecordSchema,
  canTransition,
  checkParameterOverrides,
  createExperiment,
  decisionFromSelection,
  effectiveParameters,
  recordSelection,
  transitionDecision,
  validateDesign,
  renderReport,
  type ProjectRecord,
} from '../src/index.js';

const project: ProjectRecord = ProjectRecordSchema.parse({
  schemaVersion: 1,
  projectId: 'demo-game',
  name: 'Demo',
  engine: { id: 'phaser', version: '3.90.0' },
  design: { genre: 'platformer', coreLoop: 'jump', stylePack: 'layered-minimal', experienceGoals: [] },
  requirementsFile: 'req.md',
  tuningFile: 'tuning.json',
  viewport: { width: 960, height: 540 },
  constraints: [{ id: 'MOVE-01', requirementRef: 'REQ-1', statement: 'No double jump' }],
  parameters: {
    'movement.speed': { type: 'number', unit: 'px/s', min: 100, max: 300 },
    'rules.lives': { type: 'number', min: 1, max: 9, protected: true },
    'fault.bug': { type: 'boolean', fault: true },
  },
  commands: { dev: { script: 'dev', kind: 'dev', url: 'http://127.0.0.1:5173/' } },
});
const baseline = { 'movement.speed': 200, 'rules.lives': 3, 'fault.bug': false };
const mk = () =>
  createExperiment({
    project,
    baselineValues: baseline,
    revision: 'sha256:abc',
    experimentId: 'exp-test-0001',
    now: '2026-11-24T00:00:00Z',
    knownScenarioIds: ['jump-arc'],
    input: {
      question: 'Which speed feels best?',
      scenarioIds: ['jump-arc'],
      protectedChecks: ['MOVE-01'],
      variants: [
        { id: 'A', label: 'Slow', rationale: 'calm', parameters: { 'movement.speed': 150 } },
        { id: 'B', label: 'Fast', rationale: 'snappy', parameters: { 'movement.speed': 280 } },
      ],
    },
  });

describe('parameter allowlist', () => {
  it('rejects unknown, out-of-range, protected and fault parameters', () => {
    const problems = checkParameterOverrides(project.parameters, { 'movement.speed': 999, 'rules.lives': 4, 'fault.bug': true, 'x.y': 1 });
    expect(problems.map((p) => p.key).sort()).toEqual(['fault.bug', 'movement.speed', 'rules.lives', 'x.y']);
  });
  it('accepts any in-range value (property)', () => {
    fc.assert(fc.property(fc.double({ min: 100, max: 300, noNaN: true }), (v) => checkParameterOverrides(project.parameters, { 'movement.speed': v }).length === 0));
  });
});

describe('experiments', () => {
  it('creates a baseline plus variants with the revision', () => {
    const e = mk();
    expect(e.variants.map((v) => v.id)).toEqual(['baseline', 'A', 'B']);
    expect(e.baselineRevision).toBe('sha256:abc');
    expect(effectiveParameters(e, 'B')['movement.speed']).toBe(280);
  });
  it('rejects a variant that changes nothing or touches protected parameters', () => {
    expect(() =>
      createExperiment({ ...{ project, baselineValues: baseline, revision: 'r', experimentId: 'exp-x-0001', now: 'n', knownScenarioIds: ['jump-arc'] }, input: { question: 'q?!', scenarioIds: ['jump-arc'], variants: [{ id: 'A', label: 'a', rationale: 'r', parameters: { 'movement.speed': 200 } }, { id: 'B', label: 'b', rationale: 'r', parameters: { 'rules.lives': 5 } }] } }),
    ).toThrowError(GameDNAError);
  });
  it('rejects unknown scenarios', () => {
    expect(() => createExperiment({ project, baselineValues: baseline, revision: 'r', experimentId: 'exp-x-0001', now: 'n', knownScenarioIds: [], input: { question: 'q?!', scenarioIds: ['nope'], variants: [{ id: 'A', label: 'a', rationale: 'r', parameters: { 'movement.speed': 150 } }, { id: 'B', label: 'b', rationale: 'r', parameters: { 'movement.speed': 250 } }] } })).toThrow(/Unknown scenario/);
  });
  it('requires the user\'s words for chat selections and forbids reselection', () => {
    expect(() => recordSelection(mk(), { variantId: 'A', source: 'chat' }, 'now')).toThrow(/userStatement/);
    const sel = recordSelection(mk(), { variantId: 'A', source: 'workbench', rationale: 'felt calm' }, 'now');
    expect(sel.status).toBe('selected');
    expect(() => recordSelection(sel, { variantId: 'B', source: 'workbench' }, 'now')).toThrow(/already/);
  });
  it('rejecting all variants records a rejected experiment', () => {
    expect(recordSelection(mk(), { variantId: null, source: 'workbench' }, 'now').status).toBe('rejected');
  });
});

describe('decision lifecycle', () => {
  it('follows the PRD state diagram only', () => {
    expect(canTransition('proposed', 'selected')).toBe(true);
    expect(canTransition('selected', 'verified')).toBe(false);
    for (const s of ['verified', 'rejected', 'stale', 'failed', 'reverted'] as const) expect(DECISION_TRANSITIONS[s]).toEqual([]);
    fc.assert(
      fc.property(fc.constantFrom(...DECISION_STATUSES), fc.constantFrom(...DECISION_STATUSES), (a, b) => canTransition(a, b) === DECISION_TRANSITIONS[a].includes(b)),
    );
  });
  it('builds a decision with requirement links and parameter diff', () => {
    const e = recordSelection(mk(), { variantId: 'B', source: 'workbench' }, '2026-11-24T01:00:00Z');
    const d = decisionFromSelection(e, project, 'dec-test-0001', '2026-11-24T01:00:00Z');
    expect(d.status).toBe('selected');
    expect(d.requirementRefs).toEqual(['REQ-1']);
    expect(d.parameterDiff).toEqual([{ key: 'movement.speed', from: 200, to: 280, unit: 'px/s' }]);
    const applied = transitionDecision(d, 'applied', 'patched', 'later');
    expect(transitionDecision(applied, 'verified', 'checks pass', 'later').status).toBe('verified');
    expect(() => transitionDecision(d, 'verified', 'skip', 'later')).toThrow(/cannot move/);
  });
});

describe('design validation', () => {
  it('flags missing requirement refs and record/source conflicts without resolving them', () => {
    const raw = { ...project, parameters: { ...project.parameters, 'movement.speed': { type: 'number', min: 100, max: 300, value: 250 } } };
    const v = validateDesign(raw, { tuningValues: baseline, requirementsMarkdown: '# Reqs\nREQ-2 something' });
    expect(v.valid).toBe(false);
    expect(v.missingRequirementRefs).toEqual(['REQ-1']);
    expect(v.conflicts).toEqual([{ key: 'movement.speed', recordValue: 250, sourceValue: 200 }]);
  });
  it('returns field-level schema errors', () => {
    const v = validateDesign({ schemaVersion: 2 });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.startsWith('schemaVersion'))).toBe(true);
  });
});

describe('report', () => {
  it('spells out statuses in text', () => {
    const md = renderReport({ projectId: 'p', projectName: 'P', generatedAt: 'now', revision: 'r', engine: 'phaser 3.90.0', runs: [{ traceId: 't', scenarioId: 's', seed: 1, status: 'failed', revision: 'r', params: {}, checks: [{ id: 'MOVE-01', status: 'failed', observed: 'x' }], metrics: [], limitations: [] }], experiments: [], decisions: [], assets: [], limitations: ['none'] });
    expect(md).toContain('FAILED');
    expect(md).toContain('MOVE-01');
  });
});
