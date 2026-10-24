import { describe, it, expect } from 'vitest';
import { parseCandidate, parseEnvelope } from './findings';

const cite = (quotedText?: string) => ({
  evidenceDisplayId: 'EV-1',
  segmentOrdinal: 1,
  locatorType: 'PAGE',
  locator: { page: 1 },
  ...(quotedText ? { quotedText } : {}),
});

const base = (over: Record<string, unknown> = {}) => ({
  statement: 'A statement',
  evidenceBasis: 'DIRECT',
  citations: [cite('some quoted text')],
  ...over,
});

const claimPayload = () => ({
  normalizedClaim: { subject: 'Acme Corp', predicate: 'holds_data', object: 'personal data', polarity: 'AFFIRMS' },
});

const claim = (payload: unknown) => base({ findingType: 'CLAIM', structuredPayload: payload });

const reasonOf = (raw: unknown) => {
  const r = parseCandidate(raw);
  return r.ok ? 'OK' : r.reason;
};

describe('T03 invalid CLAIM payload is rejected by Zod', () => {
  it('accepts a valid claim', () => {
    expect(parseCandidate(claim(claimPayload())).ok).toBe(true);
  });
  it('rejects missing normalizedClaim', () => {
    expect(reasonOf(claim({}))).toBe('SCHEMA');
  });
  it('rejects an unknown predicate', () => {
    const p = claimPayload();
    (p.normalizedClaim as any).predicate = 'sells_data';
    expect(reasonOf(claim(p))).toBe('SCHEMA');
  });
  it('rejects an extra key', () => {
    expect(reasonOf(claim({ ...claimPayload(), extra: 1 }))).toBe('SCHEMA');
  });
  it('rejects polarity MAYBE', () => {
    const p = claimPayload();
    (p.normalizedClaim as any).polarity = 'MAYBE';
    expect(reasonOf(claim(p))).toBe('SCHEMA');
  });
});

describe('parseCandidate: general', () => {
  it('rejects a CLAIM with no quotedText citation, accepts with one', () => {
    expect(reasonOf(base({ findingType: 'CLAIM', structuredPayload: claimPayload(), citations: [cite()] }))).toBe('SCHEMA');
    expect(reasonOf(base({ findingType: 'CLAIM', structuredPayload: claimPayload(), citations: [cite(), cite('quote')] }))).toBe('OK');
  });
  it('unknown findingType gives UNKNOWN_TYPE', () => {
    expect(reasonOf(base({ findingType: 'OPINION', structuredPayload: {} }))).toBe('UNKNOWN_TYPE');
  });
  it('non-objects give SCHEMA', () => {
    for (const v of [null, undefined, 'x', 5, [], true]) expect(reasonOf(v)).toBe('SCHEMA');
  });
  it('non-string findingType gives SCHEMA', () => {
    expect(reasonOf(base({ findingType: 7, structuredPayload: {} }))).toBe('SCHEMA');
  });
  it('rejects zero and six citations', () => {
    expect(reasonOf(base({ findingType: 'ENTITY', structuredPayload: { name: 'A', entityType: 'OTHER' }, citations: [] }))).toBe('SCHEMA');
    const six = Array.from({ length: 6 }, () => cite('q'));
    expect(reasonOf(base({ findingType: 'ENTITY', structuredPayload: { name: 'A', entityType: 'OTHER' }, citations: six }))).toBe('SCHEMA');
  });
  it('rejects evidenceBasis OBSERVED for a candidate', () => {
    expect(reasonOf(base({ findingType: 'ENTITY', structuredPayload: { name: 'A', entityType: 'OTHER' }, evidenceBasis: 'OBSERVED' }))).toBe('SCHEMA');
  });
});

describe('parseCandidate: one valid candidate per finding type', () => {
  const valid: Record<string, unknown> = {
    CLAIM: claimPayload(),
    ENTITY: { name: 'Acme Corp', entityType: 'CONTROLLER' },
    EVENT: { label: 'Response sent' },
    RELATIONSHIP: { relationshipType: 'RESPONDED_TO', fromRef: 'e1', toRef: 'FND-3' },
    REQUEST: { item: 'Delete my phone number', requestType: 'DELETION' },
    RESPONSE: { addresses: ['e1'], coverage: 'PARTIAL' },
    FRICTION_SIGNAL: { signalType: 'UNANSWERED_REQUEST' },
    CONTRADICTION: { claimARef: 'FND-1', claimBRef: 'e2' },
    DATA_CATEGORY: { category: 'phone number' },
  };
  it.each(Object.keys(valid))('accepts %s', (t) => {
    const r = parseCandidate(base({ findingType: t, structuredPayload: valid[t] }));
    expect(r.ok).toBe(true);
  });
});

describe('parseCandidate: never throws', () => {
  it('survives hostile input', () => {
    const cyc: any = {}; cyc.self = cyc;
    expect(() => parseCandidate(cyc)).not.toThrow();
    expect(() => parseEnvelope(cyc)).not.toThrow();
  });
});

describe('parseEnvelope', () => {
  it('accepts an empty candidates array and returns it', () => {
    const r = parseEnvelope({ candidates: [] });
    expect(r).toEqual({ ok: true, value: [] });
  });
  it('returns raw items untouched', () => {
    const r = parseEnvelope({ candidates: [1, 'a', { x: 1 }] });
    expect(r.ok && r.value.length).toBe(3);
  });
  it.each([{}, { candidates: 'x' }, { candidates: [], extra: 1 }, null])('rejects %j', (v) => {
    const r = parseEnvelope(v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ENVELOPE');
  });
});