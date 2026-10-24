import { describe, expect, it, vi } from 'vitest';
import { resolveCandidates, resolveCitation } from './resolver';
import type { ResolveContext, ResolveResult } from './resolver';
import { createFakeResolverStore } from './resolver.fake';
import { scopeKey } from './scope';
import type { ScopeMap } from './scope';

const CASE_A = 'case-a';
const CASE_B = 'case-b';

function world() {
  const store = createFakeResolverStore();
  const scopeMap: ScopeMap = new Map();
  const link = (displayId: string, ordinal: number, evidenceId: string, segmentId: string): void => {
    scopeMap.set(scopeKey(displayId, ordinal), { evidenceId, segmentId, locatorType: 'PAGE', locator: {} });
  };

  const ev101 = store.addEvidence({ caseId: CASE_A });
  const seg3 = store.addSegment({ evidenceId: ev101.id, locatorType: 'PAGE', locator: { page: 3 } });
  const seg4 = store.addSegment({ evidenceId: ev101.id, locatorType: 'PAGE', locator: { page: 4 } });
  link('EV-101', 3, ev101.id, seg3.id);
  link('EV-101', 4, ev101.id, seg4.id);

  const ev102 = store.addEvidence({ caseId: CASE_A });
  const seg102a = store.addSegment({ evidenceId: ev102.id, locatorType: 'PAGE', locator: { page: 1 } });
  const seg102b = store.addSegment({
    evidenceId: ev102.id,
    locatorType: 'LINE_NUMBER',
    locator: { line: 1, endLine: 2 },
  });
  link('EV-102', 1, ev102.id, seg102a.id);
  link('EV-102', 2, ev102.id, seg102b.id);

  // Another case's evidence: exists in the store, NOT in the scope map.
  const ev900 = store.addEvidence({ caseId: CASE_B });
  store.addSegment({ evidenceId: ev900.id, locatorType: 'PAGE', locator: { page: 3 } });

  // Deliberately mis-built scope entries (the store is the second line of defence).
  const otherCase = store.addEvidence({ caseId: CASE_B });
  const otherCaseSeg = store.addSegment({ evidenceId: otherCase.id, locatorType: 'PAGE', locator: { page: 1 } });
  link('EV-201', 1, otherCase.id, otherCaseSeg.id);
  for (const [displayId, status, deletedAt] of [
    ['EV-202', 'QUARANTINED', null],
    ['EV-203', 'DELETED', null],
    ['EV-204', 'PENDING', null],
    ['EV-205', 'PROCESSED', '2026-01-01T00:00:00Z'],
  ] as const) {
    const e = store.addEvidence({ caseId: CASE_A, status, deletedAt });
    const s = store.addSegment({ evidenceId: e.id, locatorType: 'PAGE', locator: { page: 1 } });
    link(displayId, 1, e.id, s.id);
  }
  link('EV-206', 1, ev101.id, seg102a.id); // segment belongs to EV-102, not EV-101
  link('EV-207', 1, 'missing-evidence-id', seg3.id);
  link('EV-208', 1, ev101.id, 'missing-segment-id');

  return { store, scopeMap, ev101, seg3, seg4, ev102, seg102a, seg102b };
}

type World = ReturnType<typeof world>;

const ctxOf = (w: World, extra: Partial<ResolveContext> = {}): ResolveContext => ({
  caseId: CASE_A,
  scopeMap: w.scopeMap,
  store: w.store,
  ...extra,
});

const QUOTE = 'We will respond within 45 days.';
const cit = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  evidenceDisplayId: 'EV-101',
  segmentOrdinal: 3,
  locatorType: 'PAGE',
  locator: { page: 3 },
  quotedText: QUOTE,
  ...o,
});
const payloadFor = (findingType: string): Record<string, unknown> => {
  switch (findingType) {
    case 'CLAIM':
      return {
        normalizedClaim: {
          subject: 'Acme Corp',
          predicate: 'holds_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
      };
    case 'ENTITY':
      return { name: 'Acme Corp', entityType: 'OTHER' };
    case 'EVENT':
      return { label: 'Response sent' };
    case 'RELATIONSHIP':
      return { relationshipType: 'RESPONDED_TO', fromRef: 'e1', toRef: 'e2' };
    case 'REQUEST':
      return { item: 'Delete my data', requestType: 'DELETION' };
    case 'RESPONSE':
      return { addresses: ['e1'], coverage: 'PARTIAL' };
    case 'FRICTION_SIGNAL':
      return { signalType: 'UNANSWERED_REQUEST', relatedRefs: [] };
    case 'CONTRADICTION':
      return { claimARef: 'FND-1', claimBRef: 'FND-2' };
    case 'DATA_CATEGORY':
      return { category: 'personal data' };
    default:
      return {};
  }
};
const cand = (
  findingType: string,
  structuredPayload: Record<string, unknown> = {},
  o: Record<string, unknown> = {},
): Record<string, unknown> => ({
  findingType,
  statement: 'A statement supported by the cited evidence.',
  evidenceBasis: 'DIRECT',
  citations: [cit()],
  structuredPayload: { ...payloadFor(findingType), ...structuredPayload },
  ...o,
});
const without = (o: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...o };
  delete copy[key];
  return copy;
};
const rejectedOf = (r: ResolveResult) => r.rejected.map(({ index, reason }) => ({ index, reason }));
const payloadOf = (c: unknown): Record<string, unknown> =>
  (c as { structuredPayload: Record<string, unknown> }).structuredPayload;

describe('T04 human-readable citation resolves to the correct UUIDs', () => {
  it('EV-101 ordinal 3 resolves to the expected evidenceId and segmentId', () => {
    const w = world();
    const r = resolveCitation(cit(), ctxOf(w));
    expect(r).toEqual({
      ok: true,
      value: {
        evidenceId: w.ev101.id,
        segmentId: w.seg3.id,
        evidenceDisplayId: 'EV-101',
        segmentOrdinal: 3,
        locatorType: 'PAGE',
        locator: { page: 3 },
        quotedText: QUOTE,
        validationStatus: 'PENDING',
      },
    });
  });

  it('the persisted locator is the stored one, not the model copy', () => {
    const w = world();
    const modelLocator = { endLine: 2, line: 1 }; // same content, different key order
    const r = resolveCitation(
      cit({ evidenceDisplayId: 'EV-102', segmentOrdinal: 2, locatorType: 'LINE_NUMBER', locator: modelLocator }),
      ctxOf(w),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.locator).toEqual({ line: 1, endLine: 2 });
      expect(r.value.locator).not.toBe(modelLocator);
      expect(r.value.segmentId).toBe(w.seg102b.id);
    }
  });

  it('a missing quote gives quotedText null', () => {
    const w = world();
    const r = resolveCitation(without(cit(), 'quotedText'), ctxOf(w));
    expect(r.ok && r.value.quotedText).toBeNull();
  });
});

describe('T05 citation outside scope', () => {
  it('evidence/ordinal not in the scope map gives OUT_OF_SCOPE', () => {
    const w = world();
    expect(resolveCitation(cit({ segmentOrdinal: 99 }), ctxOf(w))).toMatchObject({ ok: false, reason: 'OUT_OF_SCOPE' });
    expect(resolveCitation(cit({ evidenceDisplayId: 'EV-555' }), ctxOf(w))).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    });
  });

  it("another case's evidence that exists in the store but not in scope gives OUT_OF_SCOPE", () => {
    const w = world();
    expect(resolveCitation(cit({ evidenceDisplayId: 'EV-900' }), ctxOf(w))).toMatchObject({
      ok: false,
      reason: 'OUT_OF_SCOPE',
    });
  });

  it('the candidate is rejected when no citation survives', () => {
    const w = world();
    const result = resolveCandidates([cand('CLAIM', {}, { citations: [cit({ evidenceDisplayId: 'EV-900' })] })], ctxOf(w));
    expect(result.accepted).toHaveLength(0);
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'NO_VALID_CITATION' }]);
    expect(result.droppedCitations).toEqual([{ candidateIndex: 0, citationIndex: 0, reason: 'OUT_OF_SCOPE' }]);
  });

  it('one good plus one out-of-scope citation keeps the candidate and lists the dropped one', () => {
    const w = world();
    const result = resolveCandidates(
      [cand('CLAIM', {}, { citations: [cit(), cit({ evidenceDisplayId: 'EV-900' })] })],
      ctxOf(w),
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]!.citations).toHaveLength(1);
    expect(result.accepted[0]!.citations[0]!.segmentId).toBe(w.seg3.id);
    expect(result.droppedCitations).toEqual([{ candidateIndex: 0, citationIndex: 1, reason: 'OUT_OF_SCOPE' }]);
  });
});

describe('T06 malformed citation fails safely', () => {
  const malformed: Array<[string, unknown]> = [
    ['null', null],
    ['string', 'EV-101#3'],
    ['number', 42],
    ['array', []],
    ['empty object', {}],
    ['missing evidenceDisplayId', without(cit(), 'evidenceDisplayId')],
    ['missing segmentOrdinal', without(cit(), 'segmentOrdinal')],
    ['missing locatorType', without(cit(), 'locatorType')],
    ['missing locator', without(cit(), 'locator')],
    ['ordinal 0', cit({ segmentOrdinal: 0 })],
    ['ordinal negative', cit({ segmentOrdinal: -1 })],
    ['ordinal string', cit({ segmentOrdinal: '3' })],
    ['ordinal fractional', cit({ segmentOrdinal: 1.5 })],
    ['bad display id', cit({ evidenceDisplayId: 'ev-101' })],
    ['locator is a string', cit({ locator: 'page 3' })],
    ['locator is an array', cit({ locator: [3] })],
    ['locator is null', cit({ locator: null })],
    ['unknown extra key (strict)', cit({ extra: true })],
    ['empty quote', cit({ quotedText: '' })],
    ['quote over 2000 chars', cit({ quotedText: 'x'.repeat(2001) })],
  ];

  it.each(malformed)('%s is dropped with MALFORMED and does not throw', (_label, raw) => {
    const w = world();
    expect(() => resolveCitation(raw, ctxOf(w))).not.toThrow();
    expect(resolveCitation(raw, ctxOf(w))).toMatchObject({ ok: false, reason: 'MALFORMED' });
  });

  it('a wrong locator shape for the segment is dropped with LOCATOR_MISMATCH', () => {
    const w = world();
    expect(resolveCitation(cit({ locator: { wrong: true } }), ctxOf(w))).toMatchObject({
      ok: false,
      reason: 'LOCATOR_MISMATCH',
    });
  });

  it('non-object candidates are rejected without throwing and nothing is accepted', () => {
    const w = world();
    const result = resolveCandidates([null, 5, 'x', [], undefined], ctxOf(w));
    expect(result.accepted).toHaveLength(0);
    expect(rejectedOf(result)).toEqual([0, 1, 2, 3, 4].map((index) => ({ index, reason: 'SCHEMA' })));
  });

  it('a malformed citation invalidates the candidate against the contract schema', () => {
    const w = world();
    const result = resolveCandidates([cand('CLAIM', {}, { citations: [null, cit()] })], ctxOf(w));
    expect(result.accepted).toHaveLength(0);
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'SCHEMA' }]);
    expect(result.droppedCitations).toEqual([]);
  });
});

describe('BAD_REFERENCE on reloaded rows', () => {
  it.each([
    ['evidence from a different case', 'EV-201'],
    ['QUARANTINED evidence', 'EV-202'],
    ['DELETED evidence', 'EV-203'],
    ['PENDING evidence', 'EV-204'],
    ['evidence with deletedAt set', 'EV-205'],
    ['segment belonging to another evidence item', 'EV-206'],
    ['evidence row missing', 'EV-207'],
    ['segment row missing', 'EV-208'],
  ])('%s', (_label, displayId) => {
    const w = world();
    const r = resolveCitation(cit({ evidenceDisplayId: displayId, segmentOrdinal: 1, locator: { page: 1 } }), ctxOf(w));
    expect(r).toMatchObject({ ok: false, reason: 'BAD_REFERENCE' });
  });
});

describe('LOCATOR_MISMATCH', () => {
  it.each([
    ['different value', { page: 99 }, 'PAGE'],
    ['empty locator', {}, 'PAGE'],
    ['extra key', { page: 3, extra: 1 }, 'PAGE'],
    ['different locatorType, same locator', { page: 3 }, 'LINE_NUMBER'],
  ])('%s', (_label, locator, locatorType) => {
    const w = world();
    expect(resolveCitation(cit({ locator, locatorType }), ctxOf(w))).toMatchObject({
      ok: false,
      reason: 'LOCATOR_MISMATCH',
    });
  });
});

describe('quoted text', () => {
  it('a fabricated quote still resolves with validationStatus PENDING', () => {
    const w = world();
    const r = resolveCitation(cit({ quotedText: 'This sentence does not appear anywhere in the segment.' }), ctxOf(w));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.validationStatus).toBe('PENDING');
      expect(r.value.quotedText).toBe('This sentence does not appear anywhere in the segment.');
    }
  });

  it('detokenize is applied to quotedText', () => {
    const w = world();
    const detokenize = vi.fn((s: string) => s.replace('[PERSON_1]', 'Jane Doe'));
    const r = resolveCitation(cit({ quotedText: 'Hello [PERSON_1], we received it.' }), ctxOf(w, { detokenize }));
    expect(r.ok && r.value.quotedText).toBe('Hello Jane Doe, we received it.');
    expect(detokenize).toHaveBeenCalledTimes(1);
  });

  it('detokenize is not called when there is no quote', () => {
    const w = world();
    const detokenize = vi.fn((s: string) => s);
    resolveCitation(without(cit(), 'quotedText'), ctxOf(w, { detokenize }));
    expect(detokenize).not.toHaveBeenCalled();
  });
});

describe('finding references', () => {
  it('a valid local ref resolves and refs are not rewritten', () => {
    const w = world();
    const result = resolveCandidates(
      [
        cand('CLAIM', {}, { ref: 'a1' }),
        cand('CLAIM', {}, { ref: 'a2' }),
        cand('RELATIONSHIP', { fromRef: 'a1', toRef: 'a2' }),
      ],
      ctxOf(w),
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(3);
    expect(payloadOf(result.accepted[2]!.candidate)).toMatchObject({ fromRef: 'a1', toRef: 'a2' });
  });

  it('duplicate local refs resolve to another live candidate with the required type', () => {
    const w = world();
    const result = resolveCandidates(
      [
        cand('CLAIM', {}, { ref: 'shared' }),
        cand('EVENT', {}, { ref: 'shared' }),
        cand('CONTRADICTION', { claimARef: 'shared', claimBRef: 'shared' }),
      ],
      ctxOf(w),
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(3);
  });

  it('a local ref to a missing candidate gives BAD_REFERENCE', () => {
    const w = world();
    const result = resolveCandidates([cand('RELATIONSHIP', { fromRef: 'nope', toRef: 'nope2' })], ctxOf(w));
    expect(result.accepted).toHaveLength(0);
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it('a candidate cannot satisfy a local ref with its own ref', () => {
    const w = world();
    const result = resolveCandidates([cand('RELATIONSHIP', { fromRef: 'me', toRef: 'me' }, { ref: 'me' })], ctxOf(w));
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it('a valid display ID resolves through the store', () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-201', findingType: 'REQUEST' });
    const result = resolveCandidates([cand('RESPONSE', { addresses: ['FND-201'] })], ctxOf(w));
    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(1);
  });

  it('an unknown display ID gives BAD_REFERENCE', () => {
    const w = world();
    const result = resolveCandidates([cand('RESPONSE', { addresses: ['FND-999'] })], ctxOf(w));
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it("a display ID that exists only in another case gives BAD_REFERENCE", () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_B, displayId: 'FND-301', findingType: 'REQUEST' });
    const result = resolveCandidates([cand('RESPONSE', { addresses: ['FND-301'] })], ctxOf(w));
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it('friction relatedRefs are checked', () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-201', findingType: 'EVENT' });
    const ok = resolveCandidates([cand('FRICTION_SIGNAL', { signalType: 'UNANSWERED_REQUEST', relatedRefs: ['FND-201'] })], ctxOf(w));
    expect(ok.accepted).toHaveLength(1);
    const bad = resolveCandidates([cand('FRICTION_SIGNAL', { signalType: 'UNANSWERED_REQUEST', relatedRefs: ['FND-201', 'FND-404'] })], ctxOf(w));
    expect(rejectedOf(bad)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it('a contradiction between two existing CLAIM findings is accepted', () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-201', findingType: 'CLAIM' });
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-202', findingType: 'CLAIM' });
    const result = resolveCandidates([cand('CONTRADICTION', { claimARef: 'FND-201', claimBRef: 'FND-202' })], ctxOf(w));
    expect(result.accepted).toHaveLength(1);
  });

  it('a contradiction pointing at a non-CLAIM finding gives BAD_REFERENCE', () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-201', findingType: 'CLAIM' });
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-202', findingType: 'EVENT' });
    const result = resolveCandidates([cand('CONTRADICTION', { claimARef: 'FND-201', claimBRef: 'FND-202' })], ctxOf(w));
    expect(rejectedOf(result)).toEqual([{ index: 0, reason: 'BAD_REFERENCE' }]);
  });

  it('a contradiction mixing a batch CLAIM and an existing CLAIM is accepted; a batch non-CLAIM is not', () => {
    const w = world();
    w.store.addFinding({ caseId: CASE_A, displayId: 'FND-201', findingType: 'CLAIM' });
    const good = resolveCandidates(
      [cand('CLAIM', {}, { ref: 'c1' }), cand('CONTRADICTION', { claimARef: 'c1', claimBRef: 'FND-201' })],
      ctxOf(w),
    );
    expect(good.accepted).toHaveLength(2);
    const bad = resolveCandidates(
      [cand('EVENT', {}, { ref: 'e1' }), cand('CONTRADICTION', { claimARef: 'e1', claimBRef: 'FND-201' })],
      ctxOf(w),
    );
    expect(rejectedOf(bad)).toEqual([{ index: 1, reason: 'BAD_REFERENCE' }]);
  });

  it('a ref to a batch candidate that was itself rejected is also BAD_REFERENCE', () => {
    const w = world();
    const result = resolveCandidates(
      [
        cand('CLAIM', {}, { ref: 'y', citations: [cit({ evidenceDisplayId: 'EV-900' })] }),
        cand('RELATIONSHIP', { fromRef: 'y', toRef: 'y' }),
      ],
      ctxOf(w),
    );
    expect(result.accepted).toHaveLength(0);
    expect(rejectedOf(result)).toEqual([
      { index: 0, reason: 'NO_VALID_CITATION' },
      { index: 1, reason: 'BAD_REFERENCE' },
    ]);
  });
});

describe('EVENT dateSource', () => {
  it('is forced to TEXT without mutating the input', () => {
    const w = world();
    const raw = cand('EVENT', { label: 'Response sent', dateSource: 'HEADER', occurredAt: '2026-03-01T00:00:00Z' });
    const result = resolveCandidates([raw], ctxOf(w));
    expect(result.accepted).toHaveLength(1);
    expect(payloadOf(result.accepted[0]!.candidate)).toMatchObject({
      dateSource: 'TEXT',
      occurredAt: '2026-03-01T00:00:00Z',
    });
    expect(payloadOf(raw).dateSource).toBe('HEADER');
  });

  it('is added when the model omitted it, and left alone on other types', () => {
    const w = world();
    const result = resolveCandidates([cand('EVENT', {}), cand('CLAIM')], ctxOf(w));
    expect(payloadOf(result.accepted[0]!.candidate).dateSource).toBe('TEXT');
    expect(payloadOf(result.accepted[1]!.candidate)).toEqual(payloadFor('CLAIM'));
  });
});

describe('mixed batch', () => {
  it('one valid, one UNKNOWN_TYPE, one with only out-of-scope citations', () => {
    const w = world();
    const result = resolveCandidates(
      [
        cand('CLAIM'),
        cand('BOGUS'),
        cand('CLAIM', {}, { citations: [cit({ evidenceDisplayId: 'EV-900' })] }),
      ],
      ctxOf(w),
    );
    expect(result.accepted).toHaveLength(1);
    expect(rejectedOf(result)).toEqual([
      { index: 1, reason: 'UNKNOWN_TYPE' },
      { index: 2, reason: 'NO_VALID_CITATION' },
    ]);
    expect(result.droppedCitations).toEqual([{ candidateIndex: 2, citationIndex: 0, reason: 'OUT_OF_SCOPE' }]);
  });

  it('a non-array batch is treated as empty and does not throw', () => {
    const w = world();
    expect(() => resolveCandidates(null as unknown as unknown[], ctxOf(w))).not.toThrow();
    expect(resolveCandidates(null as unknown as unknown[], ctxOf(w))).toEqual({
      accepted: [],
      rejected: [],
      droppedCitations: [],
    });
  });
});