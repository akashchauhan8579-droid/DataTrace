import type { FindingRule, FindingView, RuleContext, RuleResult } from '../types';

export function evaluateProvenance(finding: FindingView, ctx: RuleContext): RuleResult {
  if (finding.citations.length === 0) {
    return {
      ruleId: 'provenance.v1',
      outcome: 'FAIL',
      reason: 'NO_CITATIONS',
      details: { extractionMethods: [] },
    };
  }

  const extractionMethods: string[] = [];

  for (const citation of finding.citations) {
    if (!citation.segmentId) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'SEGMENT_MISSING', extractionMethods },
      };
    }

    const segment = ctx.getSegment(citation.segmentId);
    if (!segment) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'SEGMENT_NOT_FOUND', extractionMethods },
      };
    }

    if (!segment.artifactId) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'ARTIFACT_MISSING', extractionMethods },
      };
    }

    const artifact = ctx.getArtifact(segment.artifactId);
    if (!artifact) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'ARTIFACT_NOT_FOUND', extractionMethods },
      };
    }

    if (artifact.evidenceId !== citation.evidenceId || segment.evidenceId !== citation.evidenceId) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'EVIDENCE_MISMATCH', extractionMethods },
      };
    }

    const evidence = ctx.getEvidence(citation.evidenceId);
    if (!evidence || evidence.caseId !== finding.caseId) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'EVIDENCE_NOT_FOUND', extractionMethods },
      };
    }

    if (!evidence.sha256Stored || evidence.sha256Stored.trim() === '' || !evidence.hashCheckPassed) {
      return {
        ruleId: 'provenance.v1',
        outcome: 'FAIL',
        reason: 'BROKEN_CHAIN',
        details: { brokenCitationId: citation.id, step: 'HASH_VERIFICATION_FAILED', extractionMethods },
      };
    }

    extractionMethods.push(artifact.extractionMethod);
  }

  return {
    ruleId: 'provenance.v1',
    outcome: 'PASS',
    details: {
      extractionMethods: Array.from(new Set(extractionMethods)),
    },
  };
}

export const provenanceRule: FindingRule = {
  id: 'provenance.v1',
  applies: () => true,
  evaluate: evaluateProvenance,
  passState: null,
};
