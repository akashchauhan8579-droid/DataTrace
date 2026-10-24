import type { Result } from '../contracts';
import { citationIntegrityRule } from './rules/citationIntegrity';
import { provenanceRule } from './rules/provenance';
import type {
  FindingRule,
  FindingView,
  RuleContext,
  RuleOutcome,
  RuleResult,
  VerificationState,
} from './types';

export interface VerificationResultRow {
  id?: string;
  findingId: string;
  ruleId: string;
  inputSnapshot: unknown;
  outcome: RuleOutcome;
  previousState: VerificationState;
  resultingState: VerificationState;
  details?: Record<string, unknown>;
  performedAt: string;
}

export interface AuditEventInput {
  id?: string;
  caseId: string;
  actorType: 'USER' | 'SYSTEM' | 'AI_GATEWAY';
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  occurredAt?: string;
}

export interface EngineStore {
  getFindingView(id: string): FindingView | undefined;
  getFindingsByCaseId(caseId: string): FindingView[];
  getFindingsByEvidenceId(evidenceId: string): FindingView[];
  getRuleContext(caseId: string): RuleContext;
  insertVerificationResult(row: VerificationResultRow): void;
  updateFindingState(id: string, state: VerificationState): void;
  setSourceUnavailable(id: string, unavailable: boolean): void;
  updateCitationValidationStatus(
    citationId: string,
    status: 'PENDING' | 'VALID' | 'INVALID',
  ): void;
  appendAuditEvent(event: AuditEventInput): void;
}

export interface ApplyVerificationResultOptions {
  findingId: string;
  result: RuleResult;
  targetState: VerificationState;
  inputSnapshot?: unknown;
}

const STATE_RANK: Record<VerificationState, number> = {
  UNVERIFIED: 0,
  AI_INFERRED: 1,
  CORROBORATED: 2,
  VERIFIED: 3,
  CONTRADICTED: 3,
};

function restsOnlyOnAiVision(finding: FindingView, ctx: RuleContext): boolean {
  if (finding.citations.length === 0) return false;

  return finding.citations.every((citation) => {
    if (!citation.segmentId) return false;
    const segment = ctx.getSegment(citation.segmentId);
    if (!segment) return false;
    const artifact = ctx.getArtifact(segment.artifactId);
    return artifact?.extractionMethod === 'AI_VISION';
  });
}

export function isTransitionAllowed(
  finding: FindingView,
  targetState: VerificationState,
  outcome: RuleOutcome,
  ctx: RuleContext,
): boolean {
  const aiVisionOnly = restsOnlyOnAiVision(finding, ctx);
  if (aiVisionOnly && STATE_RANK[targetState] > STATE_RANK.AI_INFERRED) {
    return false;
  }

  // Demotion to UNVERIFIED is always allowed
  if (targetState === 'UNVERIFIED') {
    return true;
  }

  // If provenance is now AI-vision-only, allow a passing rule to apply the state cap.
  if (
    aiVisionOnly &&
    finding.verificationState !== 'AI_INFERRED' &&
    targetState === 'AI_INFERRED' &&
    outcome === 'PASS'
  ) {
    return true;
  }

  // Cascade demotion of CONTRADICTION finding from CONTRADICTED to AI_INFERRED
  if (
    finding.findingType === 'CONTRADICTION' &&
    finding.verificationState === 'CONTRADICTED' &&
    targetState === 'AI_INFERRED'
  ) {
    return true;
  }

  // Promotion requires a PASS outcome
  if (outcome !== 'PASS') {
    return false;
  }

  const previousState = finding.verificationState;

  // Retaining higher state when lower-state rule passes
  if (STATE_RANK[previousState] >= STATE_RANK[targetState]) {
    return true;
  }

  // Transitions from UNVERIFIED
  if (previousState === 'UNVERIFIED') {
    return targetState === 'AI_INFERRED';
  }

  // Transitions from AI_INFERRED
  if (previousState === 'AI_INFERRED') {
    if (targetState === 'CORROBORATED') {
      return (
        finding.evidenceBasis === 'DIRECT' ||
        finding.evidenceBasis === 'OBSERVED' ||
        finding.evidenceBasis === 'INFERRED'
      );
    }
    if (targetState === 'VERIFIED') {
      return (
        finding.evidenceBasis === 'DIRECT' || finding.evidenceBasis === 'OBSERVED'
      );
    }
    if (targetState === 'CONTRADICTED') {
      return finding.findingType === 'CONTRADICTION';
    }
    return false;
  }

  // Transitions from CORROBORATED
  if (previousState === 'CORROBORATED') {
    if (targetState === 'VERIFIED') {
      return (
        finding.evidenceBasis === 'DIRECT' || finding.evidenceBasis === 'OBSERVED'
      );
    }
    return false;
  }

  return false;
}

export function applyVerificationResult(
  store: EngineStore,
  options: ApplyVerificationResultOptions,
  clock: () => Date = () => new Date(),
): Result<FindingView, 'TRANSITION_NOT_ALLOWED' | 'FINDING_NOT_FOUND'> {
  const finding = store.getFindingView(options.findingId);
  if (!finding) {
    return {
      ok: false,
      reason: 'FINDING_NOT_FOUND',
      detail: `Finding ${options.findingId} not found`,
    };
  }

  const ruleContext = store.getRuleContext(finding.caseId);
  if (!isTransitionAllowed(finding, options.targetState, options.result.outcome, ruleContext)) {
    return {
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      detail: `Transition from ${finding.verificationState} to ${options.targetState} not allowed for ${finding.evidenceBasis} ${finding.findingType} with outcome ${options.result.outcome}`,
    };
  }

  const previousState = finding.verificationState;
  const aiVisionOnly = restsOnlyOnAiVision(finding, ruleContext);
  const resultingState = aiVisionOnly && STATE_RANK[previousState] > STATE_RANK.AI_INFERRED
    ? 'AI_INFERRED'
    : options.targetState === 'UNVERIFIED'
      ? 'UNVERIFIED'
      : finding.findingType === 'CONTRADICTION' &&
        previousState === 'CONTRADICTED' &&
        options.targetState === 'AI_INFERRED'
      ? 'AI_INFERRED'
      : STATE_RANK[previousState] > STATE_RANK[options.targetState]
      ? previousState
      : options.targetState;

  // (1) insert verification_results row
  store.insertVerificationResult({
    findingId: finding.id,
    ruleId: options.result.ruleId,
    inputSnapshot: options.inputSnapshot ?? {},
    outcome: options.result.outcome,
    previousState,
    resultingState,
    details: options.result.details,
    performedAt: clock().toISOString(),
  });

  // (2) update state only if outcome was PASS and transition is allowed (or demotion)
  const isStateChanged = previousState !== resultingState;
  const isQuarantineDemote = options.result.reason === 'SOURCE_UNAVAILABLE';

  if (isStateChanged) {
    store.updateFindingState(finding.id, resultingState);
  }

  // (3) append VERIFICATION_STATE_CHANGED audit event
  if (isStateChanged || isQuarantineDemote) {
    store.appendAuditEvent({
      caseId: finding.caseId,
      actorType: 'SYSTEM',
      actorId: 'system',
      entityType: 'FINDING',
      entityId: finding.id,
      action: 'VERIFICATION_STATE_CHANGED',
      metadata: {
        ruleId: options.result.ruleId,
        previousState,
        resultingState,
        outcome: options.result.outcome,
        reason: options.result.reason,
      },
      occurredAt: clock().toISOString(),
    });
  }

  const updatedFinding = store.getFindingView(finding.id)!;
  return { ok: true, value: updatedFinding };
}

export function runFindingRules(
  store: EngineStore,
  findingId: string,
  rules: FindingRule[] = [],
  clock: () => Date = () => new Date(),
): void {
  const finding = store.getFindingView(findingId);
  if (!finding) return;

  const ctx = store.getRuleContext(finding.caseId);

  // 1. citation_integrity.v1
  const citResult = citationIntegrityRule.evaluate(finding, ctx);
  if (citResult.details?.citations && Array.isArray(citResult.details.citations)) {
    for (const c of citResult.details.citations as Array<{
      citationId: string;
      status: 'VALID' | 'INVALID';
    }>) {
      store.updateCitationValidationStatus(c.citationId, c.status);
    }
  }

  if (citResult.outcome === 'PASS') {
    applyVerificationResult(
      store,
      {
        findingId,
        result: citResult,
        targetState: citationIntegrityRule.passState ?? 'AI_INFERRED',
      },
      clock,
    );
  } else {
    applyVerificationResult(
      store,
      {
        findingId,
        result: citResult,
        targetState: 'UNVERIFIED',
      },
      clock,
    );
    return;
  }

  // 2. provenance.v1
  const currentAfterCit = store.getFindingView(findingId);
  if (!currentAfterCit) return;

  const provResult = provenanceRule.evaluate(currentAfterCit, ctx);
  if (provResult.outcome === 'PASS') {
    store.insertVerificationResult({
      findingId,
      ruleId: provResult.ruleId,
      inputSnapshot: {},
      outcome: 'PASS',
      previousState: currentAfterCit.verificationState,
      resultingState: currentAfterCit.verificationState,
      details: provResult.details,
      performedAt: clock().toISOString(),
    });
  } else {
    applyVerificationResult(
      store,
      {
        findingId,
        result: provResult,
        targetState: 'UNVERIFIED',
      },
      clock,
    );
    return;
  }

  // 3. Applicable rules
  for (const rule of rules) {
    const current = store.getFindingView(findingId);
    if (!current) break;

    if (!rule.applies(current)) continue;

    const res = rule.evaluate(current, ctx);
    if (res.outcome === 'PASS' && rule.passState) {
      applyVerificationResult(
        store,
        {
          findingId,
          result: res,
          targetState: rule.passState,
        },
        clock,
      );
    } else {
      store.insertVerificationResult({
        findingId,
        ruleId: rule.id,
        inputSnapshot: {},
        outcome: res.outcome,
        previousState: current.verificationState,
        resultingState: current.verificationState,
        details: res.details,
        performedAt: clock().toISOString(),
      });
    }
  }
}

export function quarantineEvidence(
  store: EngineStore,
  evidenceId: string,
  clock: () => Date = () => new Date(),
): void {
  const findings = store.getFindingsByEvidenceId(evidenceId);
  const caseId = findings.length > 0 ? findings[0].caseId : undefined;

  store.appendAuditEvent({
    caseId: caseId ?? '',
    actorType: 'SYSTEM',
    actorId: 'system',
    entityType: 'EVIDENCE',
    entityId: evidenceId,
    action: 'EVIDENCE_QUARANTINED',
    metadata: { evidenceId },
    occurredAt: clock().toISOString(),
  });

  for (const finding of findings) {
    store.setSourceUnavailable(finding.id, true);

    for (const citation of finding.citations) {
      if (citation.evidenceId === evidenceId) {
        store.updateCitationValidationStatus(citation.id, 'INVALID');
      }
    }

    const demoteResult: RuleResult = {
      ruleId: 'quarantine',
      outcome: 'FAIL',
      reason: 'SOURCE_UNAVAILABLE',
      details: { evidenceId },
    };

    applyVerificationResult(
      store,
      {
        findingId: finding.id,
        result: demoteResult,
        targetState: 'UNVERIFIED',
        inputSnapshot: { evidenceId },
      },
      clock,
    );
  }

  // Cascade: any CONTRADICTION finding whose referenced claims are no longer VERIFIED falls back to AI_INFERRED
  if (caseId) {
    const caseFindings = store.getFindingsByCaseId(caseId);
    const contradictions = caseFindings.filter(
      (f) =>
        f.findingType === 'CONTRADICTION' &&
        f.verificationState === 'CONTRADICTED',
    );

    for (const contradiction of contradictions) {
      const payload = contradiction.structuredPayload as
        | { claimARef?: string; claimBRef?: string }
        | undefined;
      if (payload?.claimARef && payload?.claimBRef) {
        const claimA = caseFindings.find(
          (f) => f.displayId === payload.claimARef || f.id === payload.claimARef,
        );
        const claimB = caseFindings.find(
          (f) => f.displayId === payload.claimBRef || f.id === payload.claimBRef,
        );

        if (
          !claimA ||
          claimA.verificationState !== 'VERIFIED' ||
          !claimB ||
          claimB.verificationState !== 'VERIFIED'
        ) {
          applyVerificationResult(
            store,
            {
              findingId: contradiction.id,
              result: {
                ruleId: 'contradiction_cascade',
                outcome: 'FAIL',
                reason: 'REFERENCED_CLAIM_NOT_VERIFIED',
                details: {
                  claimARef: payload.claimARef,
                  claimBRef: payload.claimBRef,
                  claimAState: claimA?.verificationState,
                  claimBState: claimB?.verificationState,
                },
              },
              targetState: 'AI_INFERRED',
              inputSnapshot: { reason: 'cascade' },
            },
            clock,
          );
        }
      }
    }
  }
}
