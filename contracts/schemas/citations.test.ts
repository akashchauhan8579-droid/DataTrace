import { describe, it, expect } from 'vitest';
import { CandidateCitationSchema, PersistedCitationSchema } from './citations';

const valid = {
  evidenceDisplayId: 'EV-101',
  segmentOrdinal: 3,
  locatorType: 'PAGE',
  locator: { page: 2 },
};
const parse = (v: unknown) => CandidateCitationSchema.safeParse(v);

describe('T06 malformed citation fails safely (schema part)', () => {
  it('accepts a valid citation without quotedText', () => {
    expect(parse(valid).success).toBe(true);
  });
  it('accepts a valid citation with quotedText', () => {
    expect(parse({ ...valid, quotedText: 'we retain data' }).success).toBe(true);
  });
  it.each([0, -1, '3', 1.5])('rejects segmentOrdinal %p', (ordinal) => {
    expect(parse({ ...valid, segmentOrdinal: ordinal }).success).toBe(false);
  });
  it('rejects missing evidenceDisplayId', () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.evidenceDisplayId;
    expect(parse(rest).success).toBe(false);
  });
  it.each(['ev-101', 'EV-', 'EV-1a'])('rejects evidenceDisplayId %p', (id) => {
    expect(parse({ ...valid, evidenceDisplayId: id }).success).toBe(false);
  });
  it('rejects an extra key (strict)', () => {
    expect(parse({ ...valid, evidenceId: 'x' }).success).toBe(false);
  });
  it('rejects empty quotedText', () => {
    expect(parse({ ...valid, quotedText: '' }).success).toBe(false);
  });
  it.each([null, 'a string', [], undefined, 42])('rejects non-object %p without throwing', (v) => {
    expect(() => parse(v)).not.toThrow();
    expect(parse(v).success).toBe(false);
  });
});

describe('PersistedCitationSchema', () => {
  const persisted = {
    id: '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b',
    findingId: '4a3b9d2f-6b5e-4f70-8b8c-2d3e4f5a6b7c',
    evidenceId: '5b4c0e3a-7c6f-4081-9c9d-3e4f5a6b7c8d',
    evidenceDisplayId: 'EV-101',
    segmentId: '6c5d1f4b-8d70-4192-8dae-4f5a6b7c8d9e',
    segmentOrdinal: 3,
    locatorType: 'PAGE',
    locator: { page: 2 },
    quotedText: 'we retain data',
    validationStatus: 'VALID',
  };
  it('accepts a valid sample', () => {
    expect(PersistedCitationSchema.safeParse(persisted).success).toBe(true);
  });
  it('rejects a non-UUID id', () => {
    expect(PersistedCitationSchema.safeParse({ ...persisted, id: 'not-a-uuid' }).success).toBe(false);
  });
  it('allows segmentId to be null', () => {
    expect(PersistedCitationSchema.safeParse({ ...persisted, segmentId: null }).success).toBe(true);
  });
});
