import { claimKey } from '../../contracts/normalize';
import type { Result } from '../../contracts/result';
import {
  ClaimPayloadSchema,
  ContradictionPayloadSchema,
} from '../../contracts/schemas/payloads';
import type { FindingRule, FindingView, RuleContext, RuleResult } from '../types';

export interface ContradictionRuleContext extends RuleContext {
  lookup?(displayId: string): FindingView | undefined;
  getFindingByDisplayId?(displayId: string): FindingView | undefined;
  getFinding?(idOrDisplayId: string): FindingView | undefined;
}

export function evaluateContradiction(
  contradiction: FindingView,
  claimA: FindingView,
  claimB: FindingView,
): RuleResult {
  const ruleId = 'contradiction_support.v1';

  // 1. Contradiction payload must parse
  const parsedContradiction = ContradictionPayloadSchema.safeParse(contradiction.structuredPayload);
  if (!parsedContradiction.success) {
    return { ruleId, outcome: 'INCONCLUSIVE', reason: 'PAYLOAD_INVALID' };
  }

  // 2. Both claims must be CLAIM, DIRECT, and currently VERIFIED
  if (
    claimA.findingType !== 'CLAIM' ||
    claimB.findingType !== 'CLAIM' ||
    claimA.evidenceBasis !== 'DIRECT' ||
    claimB.evidenceBasis !== 'DIRECT' ||
    claimA.verificationState !== 'VERIFIED' ||
    claimB.verificationState !== 'VERIFIED'
  ) {
    return { ruleId, outcome: 'FAIL', reason: 'CLAIM_NOT_VERIFIED' };
  }

  // 3. Different evidence items
  const evidenceIdsA = new Set(claimA.citations.map((c) => c.evidenceId));
  const evidenceIdsB = new Set(claimB.citations.map((c) => c.evidenceId));

  let sharesEvidence = false;
  for (const id of evidenceIdsA) {
    if (evidenceIdsB.has(id)) {
      sharesEvidence = true;
      break;
    }
  }

  if (sharesEvidence) {
    return { ruleId, outcome: 'FAIL', reason: 'SAME_EVIDENCE' };
  }

  // 4. Each claim's normalizedClaim must parse
  const parsedA = ClaimPayloadSchema.safeParse(claimA.structuredPayload);
  const parsedB = ClaimPayloadSchema.safeParse(claimB.structuredPayload);

  if (!parsedA.success || !parsedB.success) {
    return { ruleId, outcome: 'INCONCLUSIVE', reason: 'PAYLOAD_INVALID' };
  }

  const normA = parsedA.data.normalizedClaim;
  const normB = parsedB.data.normalizedClaim;

  const keyA = claimKey(normA);
  const keyB = claimKey(normB);

  // 5. Incompatibility check
  if (keyA === keyB) {
    if (normA.polarity !== normB.polarity) {
      return {
        ruleId,
        outcome: 'PASS',
        details: { mode: 'MECHANICAL' },
      };
    }
    // Equal polarity with equal keys is not a contradiction
    return { ruleId, outcome: 'FAIL', reason: 'NOT_CONTRADICTORY' };
  }

  // Keys differ
  return { ruleId, outcome: 'INCONCLUSIVE', reason: 'NEEDS_USER_CONFIRMATION' };
}

export interface ConfirmContradictionInput {
  contradiction: FindingView;
  claimA: FindingView;
  claimB: FindingView;
  userId: string;
  now: Date | string;
}

export interface UserConfirmedResolution {
  mode: 'USER_CONFIRMED';
  confirmedBy: string;
  confirmedAt: string;
}

export function confirmContradiction(
  input: ConfirmContradictionInput,
): Result<UserConfirmedResolution, 'CLAIM_NOT_VERIFIED' | 'SAME_EVIDENCE' | 'PAYLOAD_INVALID'> {
  const { claimA, claimB, userId, now } = input;

  // Both claims must be CLAIM, DIRECT, and currently VERIFIED at that moment
  if (
    claimA.findingType !== 'CLAIM' ||
    claimB.findingType !== 'CLAIM' ||
    claimA.evidenceBasis !== 'DIRECT' ||
    claimB.evidenceBasis !== 'DIRECT' ||
    claimA.verificationState !== 'VERIFIED' ||
    claimB.verificationState !== 'VERIFIED'
  ) {
    return { ok: false, reason: 'CLAIM_NOT_VERIFIED' };
  }

  // Different evidence items
  const evidenceIdsA = new Set(claimA.citations.map((c) => c.evidenceId));
  const evidenceIdsB = new Set(claimB.citations.map((c) => c.evidenceId));

  for (const id of evidenceIdsA) {
    if (evidenceIdsB.has(id)) {
      return { ok: false, reason: 'SAME_EVIDENCE' };
    }
  }

  // Payloads must parse
  const parsedA = ClaimPayloadSchema.safeParse(claimA.structuredPayload);
  const parsedB = ClaimPayloadSchema.safeParse(claimB.structuredPayload);
  if (!parsedA.success || !parsedB.success) {
    return { ok: false, reason: 'PAYLOAD_INVALID' };
  }

  const confirmedAt = typeof now === 'string' ? now : now.toISOString();

  return {
    ok: true,
    value: {
      mode: 'USER_CONFIRMED',
      confirmedBy: userId,
      confirmedAt,
    },
  };
}

export interface ReevaluateContradictionResult {
  shouldDemote: boolean;
  targetState?: 'AI_INFERRED';
  reason?: string;
}

export function reevaluateContradiction(
  contradiction: FindingView,
  claimA: FindingView,
  claimB: FindingView,
): ReevaluateContradictionResult {
  if (claimA.verificationState !== 'VERIFIED' || claimB.verificationState !== 'VERIFIED') {
    return {
      shouldDemote: true,
      targetState: 'AI_INFERRED',
      reason: 'CLAIM_NOT_VERIFIED',
    };
  }
  return {
    shouldDemote: false,
  };
}

export const contradictionSupport: FindingRule = {
  id: 'contradiction_support.v1',
  passState: 'CONTRADICTED',
  applies(f: FindingView): boolean {
    return f.findingType === 'CONTRADICTION';
  },
  evaluate(f: FindingView, ctx: RuleContext): RuleResult {
    const parsed = ContradictionPayloadSchema.safeParse(f.structuredPayload);
    if (!parsed.success) {
      return { ruleId: 'contradiction_support.v1', outcome: 'INCONCLUSIVE', reason: 'PAYLOAD_INVALID' };
    }

    const cCtx = ctx as ContradictionRuleContext;
    const lookup = cCtx.lookup ?? cCtx.getFindingByDisplayId ?? cCtx.getFinding;
    if (!lookup) {
      return { ruleId: 'contradiction_support.v1', outcome: 'FAIL', reason: 'CLAIM_NOT_VERIFIED' };
    }

    const claimA = lookup.call(cCtx, parsed.data.claimARef);
    const claimB = lookup.call(cCtx, parsed.data.claimBRef);

    if (!claimA || !claimB) {
      return { ruleId: 'contradiction_support.v1', outcome: 'FAIL', reason: 'CLAIM_NOT_VERIFIED' };
    }

    return evaluateContradiction(f, claimA, claimB);
  },
};
