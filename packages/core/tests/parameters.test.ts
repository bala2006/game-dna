import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GameDNAError, ProjectRecordSchema, assertParameterOverrides, checkParameterOverrides, type ProjectRecord } from '../src/index.js';

const project: ProjectRecord = ProjectRecordSchema.parse({
  schemaVersion: 1,
  projectId: 'demo-game',
  name: 'Demo',
  engine: { id: 'phaser', version: '3.90.0' },
  design: { genre: 'platformer', coreLoop: 'jump', stylePack: 'layered-minimal', experienceGoals: [] },
  tuningFile: 'tuning.json',
  constraints: [{ id: 'MOVE-01', requirementRef: 'REQ-1', statement: 'No double jump' }],
  parameters: {
    'movement.speed': { type: 'number', unit: 'px/s', min: 100, max: 300 },
    'rules.lives': { type: 'number', min: 1, max: 9, protected: true },
    'fault.bug': { type: 'boolean', fault: true },
  },
});

describe('tuning parameter allowlist', () => {
  it('rejects unknown, out-of-range, protected and fault parameters', () => {
    const problems = checkParameterOverrides(project.parameters, { 'movement.speed': 999, 'rules.lives': 4, 'fault.bug': true, 'x.y': 1 });
    expect(problems.map((p) => p.key).sort()).toEqual(['fault.bug', 'movement.speed', 'rules.lives', 'x.y']);
  });
  it('allows fault switches only when the caller opts in', () => {
    expect(checkParameterOverrides(project.parameters, { 'fault.bug': true }, { allowFault: true })).toEqual([]);
  });
  it('accepts any in-range value (property)', () => {
    fc.assert(fc.property(fc.double({ min: 100, max: 300, noNaN: true }), (v) => checkParameterOverrides(project.parameters, { 'movement.speed': v }).length === 0));
  });
  it('throws a typed error listing every problem', () => {
    try {
      assertParameterOverrides(project.parameters, { 'movement.speed': 50 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GameDNAError);
      expect((e as GameDNAError).code).toBe('INVALID_PARAMETER');
    }
  });
  it('ignores fields that only the removed MCP server used', () => {
    const parsed = ProjectRecordSchema.parse({ ...project, harness: { module: 'x', export: 'Y' }, commands: {} });
    expect('harness' in parsed).toBe(false);
  });
});
