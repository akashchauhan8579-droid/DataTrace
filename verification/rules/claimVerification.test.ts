import { describe, it, expect } from 'vitest';
import {
  evaluateClaimSupport,
  claimVerification,
} from './claimVerification';
import { InMemoryEngineStore } from '../engine.fake';
import { runFindingRules } from '../engine';
import type {
  ArtifactView,
  EvidenceView,
  FindingView,
  RuleContext,
  SegmentView,
} from '../types';

describe('claim_verification.v1', () => {
  describe('evaluateClaimSupport goldens', () => {
    it('Golden 1 PASS: subject anchors through header text', () => {
      const res = evaluateClaimSupport({
        quote: 'We have deleted your personal data from our systems.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('Golden 2 PASS: retains billing records', () => {
      const res = evaluateClaimSupport({
        quote: 'We retain your billing records for seven years.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'retains_data',
          object: 'billing records',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('Golden 3 PASS: negated share with third parties', () => {
      const res = evaluateClaimSupport({
        quote: 'We do not share your data with third parties.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'shares_data_with',
          object: 'data third parties',
          polarity: 'DENIES',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('Golden 4 PASS: acknowledges request', () => {
      const res = evaluateClaimSupport({
        quote: 'We received your request on 3 March.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'acknowledges_request',
          object: 'request',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('Golden 5 PASS: requires identity verification', () => {
      const res = evaluateClaimSupport({
        quote: 'Please verify your identity before we proceed.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'requires_identity_verification',
          object: 'identity',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('Golden 6 PASS: hedge cue > 8 tokens before predicate cue', () => {
      const res = evaluateClaimSupport({
        quote:
          'If you need anything else please call our support line any time today. We deleted your personal data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('PASS');
    });

    it('INCONCLUSIVE (HEDGED): will delete', () => {
      const res = evaluateClaimSupport({
        quote: 'We will delete your data within 30 days.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('INCONCLUSIVE');
      expect(res.reason).toBe('HEDGED');
    });

    it('INCONCLUSIVE (HEDGED): may retain', () => {
      const res = evaluateClaimSupport({
        quote: 'We may retain your data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'retains_data',
          object: 'data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('INCONCLUSIVE');
      expect(res.reason).toBe('HEDGED');
    });

    it('INCONCLUSIVE (HEDGED): unless you object', () => {
      const res = evaluateClaimSupport({
        quote: 'Unless you object we keep your records.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'retains_data',
          object: 'records',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('INCONCLUSIVE');
      expect(res.reason).toBe('HEDGED');
    });

    it('FAIL: POLARITY_MISMATCH when quote affirms but claim denies', () => {
      const res = evaluateClaimSupport({
        quote: 'We deleted your data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'data',
          polarity: 'DENIES',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('POLARITY_MISMATCH');
    });

    it('FAIL: POLARITY_MISMATCH when quote denies but claim affirms', () => {
      const res = evaluateClaimSupport({
        quote: 'We never deleted your data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('POLARITY_MISMATCH');
    });

    it('FAIL: NO_CUE when no predicate cues are found', () => {
      const res = evaluateClaimSupport({
        quote: 'Thank you for contacting us about your data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('NO_CUE');
    });

    it('FAIL: OBJECT_UNANCHORED when object content tokens are missing', () => {
      const res = evaluateClaimSupport({
        quote: 'We deleted the newsletter subscription.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: privacy@acme.example',
      });
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('OBJECT_UNANCHORED');
    });

    it('FAIL: SUBJECT_UNANCHORED when subject is absent from quote and header', () => {
      const res = evaluateClaimSupport({
        quote: 'We deleted your personal data.',
        claim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
        headerText: 'From: support@othercorp.example',
      });
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('SUBJECT_UNANCHORED');
    });
  });

  describe('claimVerification FindingRule', () => {
    const validEvidence: EvidenceView = {
      id: 'ev-1',
      caseId: 'case-1',
      displayId: 'EV-101',
      status: 'PROCESSED',
      deletedAt: null,
      sha256Stored: 'hash123',
      hashCheckPassed: true,
      headerText: 'From: dpo@acme.example',
    };

    const validArtifact: ArtifactView = {
      id: 'art-1',
      evidenceId: 'ev-1',
      extractionMethod: 'PARSER',
    };

    const validSegment: SegmentView = {
      id: 'seg-1',
      evidenceId: 'ev-1',
      ordinal: 1,
      locatorType: 'PAGE',
      locator: { page: 1 },
      text: 'We have deleted your personal data.',
      artifactId: 'art-1',
    };

    const validClaimFinding: FindingView = {
      id: 'fnd-1',
      caseId: 'case-1',
      displayId: 'FND-101',
      findingType: 'CLAIM',
      evidenceBasis: 'DIRECT',
      verificationState: 'AI_INFERRED',
      sourceUnavailable: false,
      statement: 'Acme deleted personal data',
      structuredPayload: {
        normalizedClaim: {
          subject: 'Acme Corp',
          predicate: 'deletes_data',
          object: 'personal data',
          polarity: 'AFFIRMS',
        },
      },
      citations: [
        {
          id: 'cit-1',
          evidenceId: 'ev-1',
          segmentId: 'seg-1',
          quotedText: 'We have deleted your personal data.',
          locatorType: 'PAGE',
          locator: { page: 1 },
          validationStatus: 'VALID',
        },
      ],
    };

    const dummyContext: RuleContext = {
      getEvidence: (id) => (id === validEvidence.id ? validEvidence : undefined),
      getSegment: (id) => (id === validSegment.id ? validSegment : undefined),
      getArtifact: (id) => (id === validArtifact.id ? validArtifact : undefined),
    };

    it('T02: applies is false for an INFERRED claim and for non-CLAIM findings', () => {
      const inferredClaim: FindingView = {
        ...validClaimFinding,
        evidenceBasis: 'INFERRED',
      };
      expect(claimVerification.applies(inferredClaim)).toBe(false);

      const entityFinding: FindingView = {
        ...validClaimFinding,
        findingType: 'ENTITY',
      };
      expect(claimVerification.applies(entityFinding)).toBe(false);

      expect(claimVerification.applies(validClaimFinding)).toBe(true);
    });

    it('returns INCONCLUSIVE with PAYLOAD_INVALID if payload fails Zod', () => {
      const badPayloadFinding: FindingView = {
        ...validClaimFinding,
        structuredPayload: { invalid: 'payload' },
      };
      const res = claimVerification.evaluate(badPayloadFinding, dummyContext);
      expect(res.outcome).toBe('INCONCLUSIVE');
      expect(res.reason).toBe('PAYLOAD_INVALID');
    });

    it('returns FAIL if citation is not VALID', () => {
      const invalidCitationFinding: FindingView = {
        ...validClaimFinding,
        citations: [
          {
            ...validClaimFinding.citations[0],
            validationStatus: 'INVALID',
          },
        ],
      };
      const res = claimVerification.evaluate(invalidCitationFinding, dummyContext);
      expect(res.outcome).toBe('FAIL');
      expect(res.reason).toBe('CITATION_INVALID');
    });

    it('returns INCONCLUSIVE with UNTRUSTED_EXTRACTION if artifact is AI_VISION', () => {
      const visionArtifact: ArtifactView = {
        ...validArtifact,
        extractionMethod: 'AI_VISION',
      };
      const visionCtx: RuleContext = {
        ...dummyContext,
        getArtifact: (id) => (id === visionArtifact.id ? visionArtifact : undefined),
      };
      const res = claimVerification.evaluate(validClaimFinding, visionCtx);
      expect(res.outcome).toBe('INCONCLUSIVE');
      expect(res.reason).toBe('UNTRUSTED_EXTRACTION');
    });

    it('T01: with engine from step 8 a PASS moves AI_INFERRED to VERIFIED', () => {
      const store = new InMemoryEngineStore();
      store.addEvidence(validEvidence);
      store.addArtifact(validArtifact);
      store.addSegment(validSegment);
      store.addFinding({ ...validClaimFinding, verificationState: 'UNVERIFIED' });

      // Run finding rules with claimVerification rule
      runFindingRules(store, validClaimFinding.id, [claimVerification]);

      const verifiedFinding = store.getFindingView(validClaimFinding.id)!;
      expect(verifiedFinding.verificationState).toBe('VERIFIED');

      const claimResultRow = store.verificationResults.find(
        (r) => r.ruleId === 'claim_verification.v1',
      );
      expect(claimResultRow).toBeDefined();
      expect(claimResultRow?.outcome).toBe('PASS');
      expect(claimResultRow?.resultingState).toBe('VERIFIED');
    });
  });
});
