import { isDeepStrictEqual } from 'node:util';
import { normalizeText } from '../../contracts';
import type { FindingRule, FindingView, RuleContext, RuleResult, CitationView } from '../types';

export type CitationIntegrityReason =
  | 'EVIDENCE_OTHER_CASE'
  | 'EVIDENCE_NOT_PROCESSED'
  | 'HASH_MISMATCH'
  | 'SEGMENT_MISSING'
  | 'LOCATOR_MISMATCH'
  | 'QUOTE_NOT_FOUND'
  | 'NO_CITATIONS';

export interface CitationCheckResult {
  citationId: string;
  status: 'VALID' | 'INVALID';
  reason?: CitationIntegrityReason;
}

export function evaluateCitation(
  citation: CitationView,
  findingCaseId: string,
  ctx: RuleContext,
): { status: 'VALID'; reason?: undefined } | { status: 'INVALID'; reason: CitationIntegrityReason } {
  const evidence = ctx.getEvidence(citation.evidenceId);
  if (!evidence || evidence.caseId !== findingCaseId) {
    return { status: 'INVALID', reason: 'EVIDENCE_OTHER_CASE' };
  }

  if (evidence.status !== 'PROCESSED' || evidence.deletedAt !== null) {
    return { status: 'INVALID', reason: 'EVIDENCE_NOT_PROCESSED' };
  }

  if (!evidence.hashCheckPassed) {
    return { status: 'INVALID', reason: 'HASH_MISMATCH' };
  }

  if (!citation.segmentId) {
    return { status: 'INVALID', reason: 'SEGMENT_MISSING' };
  }

  const segment = ctx.getSegment(citation.segmentId);
  if (!segment || segment.evidenceId !== evidence.id) {
    return { status: 'INVALID', reason: 'SEGMENT_MISSING' };
  }

  if (citation.locatorType !== segment.locatorType || !isDeepStrictEqual(citation.locator, segment.locator)) {
    return { status: 'INVALID', reason: 'LOCATOR_MISMATCH' };
  }

  if (citation.quotedText !== null && citation.quotedText !== undefined) {
    const normalizedSegmentText = normalizeText(segment.text);
    const normalizedQuote = normalizeText(citation.quotedText);
    if (!normalizedSegmentText.includes(normalizedQuote)) {
      return { status: 'INVALID', reason: 'QUOTE_NOT_FOUND' };
    }
  }

  return { status: 'VALID' };
}

export function evaluateCitationIntegrity(finding: FindingView, ctx: RuleContext): RuleResult {
  if (finding.citations.length === 0) {
    return {
      ruleId: 'citation_integrity.v1',
      outcome: 'FAIL',
      reason: 'NO_CITATIONS',
      details: { citations: [] },
    };
  }

  const citationResults: CitationCheckResult[] = [];
  let allValid = true;
  let firstFailReason: CitationIntegrityReason | undefined;

  for (const citation of finding.citations) {
    const res = evaluateCitation(citation, finding.caseId, ctx);
    citationResults.push({
      citationId: citation.id,
      status: res.status,
      reason: res.reason,
    });
    if (res.status === 'INVALID') {
      allValid = false;
      if (!firstFailReason) {
        firstFailReason = res.reason;
      }
    }
  }

  return {
    ruleId: 'citation_integrity.v1',
    outcome: allValid ? 'PASS' : 'FAIL',
    reason: firstFailReason,
    details: { citations: citationResults },
  };
}

export const citationIntegrityRule: FindingRule = {
  id: 'citation_integrity.v1',
  applies: () => true,
  evaluate: evaluateCitationIntegrity,
  passState: 'AI_INFERRED',
};
