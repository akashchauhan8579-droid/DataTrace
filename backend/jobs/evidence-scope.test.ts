import { describe, expect, it } from 'vitest';
import { parseEvidenceScope } from './evidence-scope';

describe('parseEvidenceScope', () => {
  it('supports a legacy single evidence display ID', () => {
    expect(parseEvidenceScope('EV-101')).toEqual([
      { evidenceDisplayId: 'EV-101', segmentOrdinals: null },
    ]);
  });

  it('supports evidence IDs and explicitly scoped segment ordinals', () => {
    expect(
      parseEvidenceScope([
        'EV-101',
        { evidenceDisplayId: 'EV-202', segmentOrdinals: [1, 3, 3] },
      ])
    ).toEqual([
      { evidenceDisplayId: 'EV-101', segmentOrdinals: null },
      { evidenceDisplayId: 'EV-202', segmentOrdinals: [1, 3] },
    ]);
  });

  it.each([
    null,
    1,
    [{ evidenceDisplayId: 'EV-101', segmentOrdinals: [] }],
    [{ evidenceDisplayId: 'EV-101', segmentOrdinals: [0] }],
    ['EV-101', 'EV-101'],
  ])('rejects malformed or ambiguous scope: %j', (scope) => {
    expect(() => parseEvidenceScope(scope)).toThrow();
  });
});
