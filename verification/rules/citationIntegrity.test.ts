import { describe, it, expect } from 'vitest';
import { evaluateCitationIntegrity, citationIntegrityRule } from './citationIntegrity';
import type { EvidenceView, FindingView, RuleContext, SegmentView } from '../types';

describe('citationIntegrity.v1', () => {
  const caseId = 'case-001';
  const evidenceId = 'ev-101';
  const segmentId = 'seg-1';

  const validEvidence: EvidenceView = {
    id: evidenceId,
    caseId,
    displayId: 'EV-101',
    status: 'PROCESSED',
    deletedAt: null,
    sha256Stored: 'abc123sha256hash',
    hashCheckPassed: true,
  };

  const validSegment: SegmentView = {
    id: segmentId,
    evidenceId,
    ordinal: 1,
    locatorType: 'PAGE',
    locator: { page: 1 },
    text: 'Acme Corp retains customer account data for 30 days.',
    artifactId: 'art-1',
  };

  const validFinding: FindingView = {
    id: 'fnd-1',
    caseId,
    displayId: 'FND-101',
    findingType: 'CLAIM',
    evidenceBasis: 'DIRECT',
    verificationState: 'UNVERIFIED',
    sourceUnavailable: false,
    statement: 'Acme Corp retains customer account data for 30 days.',
    structuredPayload: {},
    citations: [
      {
        id: 'cit-1',
        evidenceId,
        segmentId,
        quotedText: 'Acme Corp retains customer account data for 30 days.',
        locatorType: 'PAGE',
        locator: { page: 1 },
        validationStatus: 'PENDING',
      },
    ],
  };

  function makeContext(
    evidence: EvidenceView = validEvidence,
    segment: SegmentView = validSegment,
  ): RuleContext {
    return {
      getEvidence: (id: string) => (id === evidence.id ? evidence : undefined),
      getSegment: (id: string) => (id === segment.id ? segment : undefined),
      getArtifact: () => undefined,
    };
  }

  it('passes when citation satisfies all integrity checks', () => {
    const ctx = makeContext();
    const result = citationIntegrityRule.evaluate(validFinding, ctx);

    expect(result.outcome).toBe('PASS');
    expect(result.ruleId).toBe('citation_integrity.v1');
    expect(result.details?.citations).toEqual([
      { citationId: 'cit-1', status: 'VALID', reason: undefined },
    ]);
  });

  it('fails with EVIDENCE_OTHER_CASE when evidence belongs to another case', () => {
    const crossCaseEvidence: EvidenceView = {
      ...validEvidence,
      caseId: 'other-case-999',
    };
    const ctx = makeContext(crossCaseEvidence);
    const result = evaluateCitationIntegrity(validFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('EVIDENCE_OTHER_CASE');
    expect(result.details?.citations).toEqual([
      { citationId: 'cit-1', status: 'INVALID', reason: 'EVIDENCE_OTHER_CASE' },
    ]);
  });

  it('fails with EVIDENCE_NOT_PROCESSED when evidence is deleted or quarantined', () => {
    const deletedEvidence: EvidenceView = {
      ...validEvidence,
      deletedAt: '2026-10-20T10:00:00Z',
    };
    const ctx1 = makeContext(deletedEvidence);
    const result1 = evaluateCitationIntegrity(validFinding, ctx1);
    expect(result1.outcome).toBe('FAIL');
    expect(result1.reason).toBe('EVIDENCE_NOT_PROCESSED');

    const quarantinedEvidence: EvidenceView = {
      ...validEvidence,
      status: 'QUARANTINED',
    };
    const ctx2 = makeContext(quarantinedEvidence);
    const result2 = evaluateCitationIntegrity(validFinding, ctx2);
    expect(result2.outcome).toBe('FAIL');
    expect(result2.reason).toBe('EVIDENCE_NOT_PROCESSED');
  });

  it('fails with HASH_MISMATCH when evidence hash check did not pass', () => {
    const hashFailedEvidence: EvidenceView = {
      ...validEvidence,
      hashCheckPassed: false,
    };
    const ctx = makeContext(hashFailedEvidence);
    const result = evaluateCitationIntegrity(validFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('HASH_MISMATCH');
    expect(result.details?.citations).toEqual([
      { citationId: 'cit-1', status: 'INVALID', reason: 'HASH_MISMATCH' },
    ]);
  });

  it('fails with SEGMENT_MISSING when segment is missing or not found', () => {
    const ctx: RuleContext = {
      getEvidence: (id: string) => (id === validEvidence.id ? validEvidence : undefined),
      getSegment: () => undefined,
      getArtifact: () => undefined,
    };
    const result = evaluateCitationIntegrity(validFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('SEGMENT_MISSING');
  });

  it('fails with LOCATOR_MISMATCH when locator values or types do not match', () => {
    const findingWithMismatchedLocator: FindingView = {
      ...validFinding,
      citations: [
        {
          ...validFinding.citations[0],
          locator: { page: 99 },
        },
      ],
    };
    const ctx = makeContext();
    const result = evaluateCitationIntegrity(findingWithMismatchedLocator, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('LOCATOR_MISMATCH');
  });

  it('quote check is case- and quote-style-insensitive via normalizeText', () => {
    const segmentWithCurlyQuotes: SegmentView = {
      ...validSegment,
      text: 'Acme’s “Official Policy” specifies data retention.',
    };
    const findingWithStraightQuotesAndDifferentCase: FindingView = {
      ...validFinding,
      citations: [
        {
          ...validFinding.citations[0],
          quotedText: "acme's \"official policy\"",
        },
      ],
    };

    const ctx = makeContext(validEvidence, segmentWithCurlyQuotes);
    const result = evaluateCitationIntegrity(findingWithStraightQuotesAndDifferentCase, ctx);

    expect(result.outcome).toBe('PASS');
    expect(result.details?.citations).toEqual([
      { citationId: 'cit-1', status: 'VALID', reason: undefined },
    ]);
  });

  it('fails with QUOTE_NOT_FOUND when quote does not occur in segment text', () => {
    const fabricatedFinding: FindingView = {
      ...validFinding,
      citations: [
        {
          ...validFinding.citations[0],
          quotedText: 'This text was completely fabricated and does not exist.',
        },
      ],
    };
    const ctx = makeContext();
    const result = evaluateCitationIntegrity(fabricatedFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('QUOTE_NOT_FOUND');
    expect(result.details?.citations).toEqual([
      { citationId: 'cit-1', status: 'INVALID', reason: 'QUOTE_NOT_FOUND' },
    ]);
  });
});
