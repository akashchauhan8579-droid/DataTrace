import { describe, it, expect } from 'vitest';
import type { FindingView } from '../types';
import {
  evaluateContradiction,
  confirmContradiction,
  reevaluateContradiction,
  contradictionSupport,
} from './contradictionSupport';

function makeClaim(
  id: string,
  displayId: string,
  evidenceId: string,
  normalizedClaim: {
    subject: string;
    predicate: any;
    object: string;
    polarity: 'AFFIRMS' | 'DENIES';
  },
  verificationState: any = 'VERIFIED',
): FindingView {
  return {
    id,
    caseId: 'case-1',
    displayId,
    findingType: 'CLAIM',
    evidenceBasis: 'DIRECT',
    verificationState,
    sourceUnavailable: false,
    statement: `Claim statement for ${displayId}`,
    structuredPayload: {
      normalizedClaim,
      speaker: 'ORGANIZATION',
    },
    citations: [
      {
        id: `cit-${displayId}`,
        evidenceId,
        segmentId: `seg-${displayId}`,
        quotedText: 'Sample quoted text',
        locatorType: 'PAGE',
        locator: { page: 1 },
        validationStatus: 'VALID',
      },
    ],
  };
}

function makeContradiction(
  claimARef: string,
  claimBRef: string,
  displayId = 'FND-301',
): FindingView {
  return {
    id: 'cnt-1',
    caseId: 'case-1',
    displayId,
    findingType: 'CONTRADICTION',
    evidenceBasis: 'CONFLICTING',
    verificationState: 'AI_INFERRED',
    sourceUnavailable: false,
    statement: 'Contradiction between claims',
    structuredPayload: {
      claimARef,
      claimBRef,
    },
    citations: [],
  };
}

describe('contradiction_support.v1 (T15, Scenario 3)', () => {
  it('passes mechanically with matching claimKey and opposite polarity', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('PASS');
    expect(result.details?.mode).toBe('MECHANICAL');
  });

  it('fails with CLAIM_NOT_VERIFIED if one claim is not VERIFIED', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    }, 'AI_INFERRED');

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    }, 'VERIFIED');

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('CLAIM_NOT_VERIFIED');
  });

  it('fails with SAME_EVIDENCE if both claims cite the same evidence item', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-SAME', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-SAME', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('SAME_EVIDENCE');
  });

  it('fails if equal keys have equal polarity (not a contradiction)', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('FAIL');
    expect(result.reason).toBe('NOT_CONTRADICTORY');
  });

  it('returns INCONCLUSIVE NEEDS_USER_CONFIRMATION when keys differ, and confirmContradiction succeeds with USER_CONFIRMED', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'shares_data_with',
      object: 'third parties',
      polarity: 'DENIES',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'shares_data_with',
      object: 'analytics partners',
      polarity: 'AFFIRMS',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('INCONCLUSIVE');
    expect(result.reason).toBe('NEEDS_USER_CONFIRMATION');

    // User confirmation succeeds when both are VERIFIED
    const confirmRes = confirmContradiction({
      contradiction,
      claimA,
      claimB,
      userId: 'user-42',
      now: '2024-06-01T10:00:00Z',
    });

    expect(confirmRes.ok).toBe(true);
    if (confirmRes.ok) {
      expect(confirmRes.value.mode).toBe('USER_CONFIRMED');
      expect(confirmRes.value.confirmedBy).toBe('user-42');
      expect(confirmRes.value.confirmedAt).toBe('2024-06-01T10:00:00Z');
    }

    // But fails if claimA lost VERIFIED in the meantime
    const demotedClaimA = { ...claimA, verificationState: 'AI_INFERRED' as const };
    const failConfirm = confirmContradiction({
      contradiction,
      claimA: demotedClaimA,
      claimB,
      userId: 'user-42',
      now: '2024-06-01T10:05:00Z',
    });

    expect(failConfirm.ok).toBe(false);
    if (!failConfirm.ok) {
      expect(failConfirm.reason).toBe('CLAIM_NOT_VERIFIED');
    }
  });

  it('gives INCONCLUSIVE PAYLOAD_INVALID when claim payload fails Zod', () => {
    const claimA = {
      ...makeClaim('c1', 'FND-101', 'ev-1', {
        subject: 'Acme Corp',
        predicate: 'deletes_data',
        object: 'personal data',
        polarity: 'AFFIRMS',
      }),
      structuredPayload: { invalid: 'payload' },
    };

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');
    const result = evaluateContradiction(contradiction, claimA, claimB);

    expect(result.outcome).toBe('INCONCLUSIVE');
    expect(result.reason).toBe('PAYLOAD_INVALID');
  });

  it('reevaluateContradiction returns demotion to AI_INFERRED when either claim loses VERIFIED', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');

    // Both verified -> no demotion
    const r1 = reevaluateContradiction(contradiction, claimA, claimB);
    expect(r1.shouldDemote).toBe(false);

    // One demoted -> demote
    const demotedB = { ...claimB, verificationState: 'AI_INFERRED' as const };
    const r2 = reevaluateContradiction(contradiction, claimA, demotedB);
    expect(r2.shouldDemote).toBe(true);
    expect(r2.targetState).toBe('AI_INFERRED');
  });

  it('contradictionSupport FindingRule integrates with context lookup', () => {
    const claimA = makeClaim('c1', 'FND-101', 'ev-1', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'AFFIRMS',
    });

    const claimB = makeClaim('c2', 'FND-102', 'ev-2', {
      subject: 'Acme Corp',
      predicate: 'deletes_data',
      object: 'personal data',
      polarity: 'DENIES',
    });

    const contradiction = makeContradiction('FND-101', 'FND-102');

    const ctx = {
      getEvidence: () => undefined,
      getSegment: () => undefined,
      getArtifact: () => undefined,
      lookup: (dispId: string) => {
        if (dispId === 'FND-101') return claimA;
        if (dispId === 'FND-102') return claimB;
        return undefined;
      },
    };

    expect(contradictionSupport.applies(contradiction)).toBe(true);
    expect(contradictionSupport.applies(claimA)).toBe(false);
    expect(contradictionSupport.passState).toBe('CONTRADICTED');

    const ruleRes = contradictionSupport.evaluate(contradiction, ctx);
    expect(ruleRes.outcome).toBe('PASS');
    expect(ruleRes.details?.mode).toBe('MECHANICAL');
  });
});
