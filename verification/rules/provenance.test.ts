import { describe, it, expect } from 'vitest';
import { evaluateProvenance, provenanceRule } from './provenance';
import type { ArtifactView, EvidenceView, FindingView, RuleContext, SegmentView } from '../types';

describe('provenance.v1', () => {
  const caseId = 'case-001';
  const evidenceId = 'ev-101';
  const segmentId = 'seg-1';
  const artifactId = 'art-1';

  const validEvidence: EvidenceView = {
    id: evidenceId,
    caseId,
    displayId: 'EV-101',
    status: 'PROCESSED',
    deletedAt: null,
    sha256Stored: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    hashCheckPassed: true,
  };

  const validArtifact: ArtifactView = {
    id: artifactId,
    evidenceId,
    extractionMethod: 'PARSER',
  };

  const validSegment: SegmentView = {
    id: segmentId,
    evidenceId,
    ordinal: 1,
    locatorType: 'PAGE',
    locator: { page: 1 },
    text: 'Preserved segment text.',
    artifactId,
  };

  const validFinding: FindingView = {
    id: 'fnd-1',
    caseId,
    displayId: 'FND-101',
    findingType: 'CLAIM',
    evidenceBasis: 'DIRECT',
    verificationState: 'UNVERIFIED',
    sourceUnavailable: false,
    statement: 'Claim statement',
    structuredPayload: {},
    citations: [
      {
        id: 'cit-1',
        evidenceId,
        segmentId,
        quotedText: 'Preserved segment text.',
        locatorType: 'PAGE',
        locator: { page: 1 },
        validationStatus: 'PENDING',
      },
    ],
  };

  function makeContext(
    evidence?: EvidenceView,
    segment?: SegmentView,
    artifact?: ArtifactView,
  ): RuleContext {
    return {
      getEvidence: (id: string) => (evidence && id === evidence.id ? evidence : undefined),
      getSegment: (id: string) => (segment && id === segment.id ? segment : undefined),
      getArtifact: (id: string) => (artifact && id === artifact.id ? artifact : undefined),
    };
  }

  it('passes and records extractionMethods on unbroken chain', () => {
    const ctx = makeContext(validEvidence, validSegment, validArtifact);
    const result = provenanceRule.evaluate(validFinding, ctx);

    expect(result.outcome).toBe('PASS');
    expect(result.ruleId).toBe('provenance.v1');
    expect(result.details?.extractionMethods).toEqual(['PARSER']);
  });

  it('fails when artifact is missing', () => {
    const ctx = makeContext(validEvidence, validSegment, undefined);
    const result = evaluateProvenance(validFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('BROKEN_CHAIN');
    expect(result.details?.step).toBe('ARTIFACT_NOT_FOUND');
  });

  it('fails when hash verification failed on evidence', () => {
    const badHashEvidence = { ...validEvidence, hashCheckPassed: false };
    const ctx = makeContext(badHashEvidence, validSegment, validArtifact);
    const result = evaluateProvenance(validFinding, ctx);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('BROKEN_CHAIN');
    expect(result.details?.step).toBe('HASH_VERIFICATION_FAILED');
  });
});
