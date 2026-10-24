import { describe, it, expect } from 'vitest';
import {
  FindingRefSchema, ContradictionCandidatePayloadSchema, ContradictionPayloadSchema, EventPayloadSchema,
} from './payloads';

describe('FindingRefSchema', () => {
  it('accepts a local ref and a display ID', () => {
    expect(FindingRefSchema.safeParse('e1').success).toBe(true);
    expect(FindingRefSchema.safeParse('FND-201').success).toBe(true);
  });
  it.each(['3f2b8c1e-5a4d-4c3b-9e2f-1a2b3c4d5e6f', 'E1', '1a', 'fnd-1'])('rejects %s', (v) => {
    expect(FindingRefSchema.safeParse(v).success).toBe(false);
  });
});

describe('Contradiction payloads', () => {
  it('candidate accepts local refs', () => {
    expect(ContradictionCandidatePayloadSchema.safeParse({ claimARef: 'e1', claimBRef: 'e2' }).success).toBe(true);
  });
  it('candidate rejects a model-supplied resolution', () => {
    const r = ContradictionCandidatePayloadSchema.safeParse({
      claimARef: 'e1', claimBRef: 'e2', resolution: { mode: 'MECHANICAL' },
    });
    expect(r.success).toBe(false);
  });
  it('persisted requires FND-### refs', () => {
    expect(ContradictionPayloadSchema.safeParse({ claimARef: 'e1', claimBRef: 'e2' }).success).toBe(false);
    expect(ContradictionPayloadSchema.safeParse({ claimARef: 'FND-1', claimBRef: 'FND-2' }).success).toBe(true);
  });
  it('persisted accepts an engine resolution', () => {
    expect(ContradictionPayloadSchema.safeParse({
      claimARef: 'FND-1', claimBRef: 'FND-2', resolution: { mode: 'MECHANICAL' },
    }).success).toBe(true);
  });
});

describe('EventPayloadSchema', () => {
  it('defaults dateSource to TEXT', () => {
    const r = EventPayloadSchema.parse({ label: 'Request received' });
    expect(r.dateSource).toBe('TEXT');
  });
});