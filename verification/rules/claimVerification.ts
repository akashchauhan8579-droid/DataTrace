import { normalizeText, normalizeToken } from '../../contracts';
import { ClaimPayloadSchema } from '../../contracts/schemas/payloads';
import type { NormalizedClaim } from '../../contracts/schemas/payloads';
import {
  PREDICATE_CUES,
  NEGATION_CUES,
  HEDGE_CUES,
} from '../../contracts/schemas/predicates';
import type { FindingRule, FindingView, RuleContext, RuleResult } from '../types';

export interface EvaluateClaimSupportArgs {
  quote: string;
  claim: NormalizedClaim;
  headerText?: string;
  firstSegmentText?: string;
  lastSegmentText?: string;
}

export function evaluateClaimSupport(args: EvaluateClaimSupportArgs): RuleResult {
  const q = normalizeText(args.quote);

  // 1. Predicate cue: find the position of the first cue in q
  const cues = PREDICATE_CUES[args.claim.predicate] ?? [];
  let firstMatchIndex = Infinity;

  for (const cue of cues) {
    const m = cue.exec(q);
    if (m && m.index < firstMatchIndex) {
      firstMatchIndex = m.index;
    }
  }

  if (firstMatchIndex === Infinity) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'FAIL',
      reason: 'NO_CUE',
    };
  }

  // Tokens for the windows come from normalizeText(quote) split on whitespace.
  // p is the token index where the first cue begins.
  const prefixText = q.slice(0, firstMatchIndex).trim();
  const p = prefixText.length === 0 ? 0 : prefixText.split(/\s+/).length;
  const tokens = q.split(/\s+/).filter(Boolean);

  // 2. Object anchor: at least ceil(|T|/2) content tokens (normalizeToken, >= 3 chars, no stopwords)
  const objTokens = normalizeToken(args.claim.object).filter((t) => t.length >= 3);
  if (objTokens.length === 0) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'FAIL',
      reason: 'OBJECT_UNANCHORED',
    };
  }

  const requiredObjMatches = Math.ceil(objTokens.length / 2);
  let matchedObjTokens = 0;
  for (const tok of objTokens) {
    if (q.includes(tok)) {
      matchedObjTokens++;
    }
  }

  if (matchedObjTokens < requiredObjMatches) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'FAIL',
      reason: 'OBJECT_UNANCHORED',
    };
  }

  // 3. Subject anchor: a content token of subject occurs in q, headerText, firstSegmentText, or lastSegmentText
  const subjTokens = normalizeToken(args.claim.subject).filter((t) => t.length >= 3);
  let subjectAnchored = false;

  const targetTexts = [
    q,
    args.headerText ? normalizeText(args.headerText) : '',
    args.firstSegmentText ? normalizeText(args.firstSegmentText) : '',
    args.lastSegmentText ? normalizeText(args.lastSegmentText) : '',
  ].filter(Boolean);

  for (const tok of subjTokens) {
    for (const target of targetTexts) {
      // Check token match: either in normalizeToken list or as a word boundary
      if (normalizeToken(target).includes(tok)) {
        subjectAnchored = true;
        break;
      }
    }
    if (subjectAnchored) break;
  }

  if (!subjectAnchored) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'FAIL',
      reason: 'SUBJECT_UNANCHORED',
    };
  }

  // 4. Polarity: negation cue within 6 tokens before p
  const negationWindow = tokens.slice(Math.max(0, p - 6), p);
  let isNegated = false;
  for (const rawTok of negationWindow) {
    const tok = rawTok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    for (const neg of NEGATION_CUES) {
      if (tok === neg || rawTok.endsWith("n't") || tok.endsWith("n't")) {
        isNegated = true;
        break;
      }
    }
    if (isNegated) break;
  }

  const quotePolarity = isNegated ? 'DENIES' : 'AFFIRMS';
  if (quotePolarity !== args.claim.polarity) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'FAIL',
      reason: 'POLARITY_MISMATCH',
      details: { quotePolarity, claimPolarity: args.claim.polarity },
    };
  }

  // 5. Hedge gate: hedge cue within 8 tokens before p gives INCONCLUSIVE
  const hedgeWindow = tokens.slice(Math.max(0, p - 8), p);
  const hedgeWindowText = hedgeWindow.join(' ');
  let isHedged = false;

  for (const hedge of HEDGE_CUES) {
    if (hedge === 'subject to') {
      if (hedgeWindowText.includes('subject to')) {
        isHedged = true;
        break;
      }
    } else {
      for (const rawTok of hedgeWindow) {
        const tok = rawTok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (tok === hedge) {
          isHedged = true;
          break;
        }
      }
      if (isHedged) break;
    }
  }

  if (isHedged) {
    return {
      ruleId: 'claim_verification.v1',
      outcome: 'INCONCLUSIVE',
      reason: 'HEDGED',
    };
  }

  return {
    ruleId: 'claim_verification.v1',
    outcome: 'PASS',
  };
}

export const claimVerification: FindingRule = {
  id: 'claim_verification.v1',
  applies: (f: FindingView) => f.findingType === 'CLAIM' && f.evidenceBasis === 'DIRECT',
  passState: 'VERIFIED',
  evaluate: (f: FindingView, ctx: RuleContext): RuleResult => {
    // 1. Payload validation
    const parsedPayload = ClaimPayloadSchema.safeParse(f.structuredPayload);
    if (!parsedPayload.success) {
      return {
        ruleId: 'claim_verification.v1',
        outcome: 'INCONCLUSIVE',
        reason: 'PAYLOAD_INVALID',
      };
    }

    // 2. Citation checks: at least one VALID citation with quotedText, and no citations are INVALID
    if (f.citations.length === 0) {
      return {
        ruleId: 'claim_verification.v1',
        outcome: 'FAIL',
        reason: 'NO_VALID_CITATION',
      };
    }

    const hasInvalidCitation = f.citations.some((c) => c.validationStatus === 'INVALID');
    if (hasInvalidCitation) {
      return {
        ruleId: 'claim_verification.v1',
        outcome: 'FAIL',
        reason: 'CITATION_INVALID',
      };
    }

    const validCitation = f.citations.find(
      (c) => c.validationStatus === 'VALID' && c.quotedText && c.quotedText.trim().length > 0,
    );
    if (!validCitation || !validCitation.quotedText) {
      return {
        ruleId: 'claim_verification.v1',
        outcome: 'FAIL',
        reason: 'NO_VALID_QUOTE',
      };
    }

    // 3. Provenance artifact check: every artifact on path must be PARSER or MANUAL
    if (validCitation.segmentId) {
      const segment = ctx.getSegment(validCitation.segmentId);
      if (segment?.artifactId) {
        const artifact = ctx.getArtifact(segment.artifactId);
        if (artifact && artifact.extractionMethod === 'AI_VISION') {
          return {
            ruleId: 'claim_verification.v1',
            outcome: 'INCONCLUSIVE',
            reason: 'UNTRUSTED_EXTRACTION',
          };
        }
      }
    }

    const evidence = ctx.getEvidence(validCitation.evidenceId);

    return evaluateClaimSupport({
      quote: validCitation.quotedText,
      claim: parsedPayload.data.normalizedClaim,
      headerText: evidence?.headerText,
    });
  },
};
