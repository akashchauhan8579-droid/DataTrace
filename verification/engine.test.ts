import { describe, it, expect } from 'vitest';
import { InMemoryEngineStore } from './engine.fake';
import {
  applyVerificationResult,
  runFindingRules,
  quarantineEvidence,
} from './engine';
import type {
  ArtifactView,
  EvidenceView,
  FindingRule,
  FindingView,
  SegmentView,
} from './types';

describe('verification engine', () => {
  const caseId = 'case-001';
  const evidenceId = 'ev-101';
  const segmentId = 'seg-1';
  const artifactId = 'art-1';
  const fixedTime = new Date('2026-10-21T00:00:00.000Z');
  const clock = () => fixedTime;

  function buildTestSetup() {
    const store = new InMemoryEngineStore();

    const evidence: EvidenceView = {
      id: evidenceId,
      caseId,
      displayId: 'EV-101',
      status: 'PROCESSED',
      deletedAt: null,
      sha256Stored: 'abc123storedhash',
      hashCheckPassed: true,
    };

    const artifact: ArtifactView = {
      id: artifactId,
      evidenceId,
      extractionMethod: 'PARSER',
    };

    const segment: SegmentView = {
      id: segmentId,
      evidenceId,
      ordinal: 1,
      locatorType: 'PAGE',
      locator: { page: 1 },
      text: 'Acme Corp retains customer account data for 30 days.',
      artifactId,
    };

    const finding: FindingView = {
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

    store.addEvidence(evidence);
    store.addArtifact(artifact);
    store.addSegment(segment);
    store.addFinding(finding);

    return { store, evidence, artifact, segment, finding };
  }

  it('promotes UNVERIFIED to AI_INFERRED when citations and provenance pass; writes in order: result, state, audit', () => {
    const { store } = buildTestSetup();

    runFindingRules(store, 'fnd-1', [], clock);

    const updated = store.getFindingView('fnd-1')!;
    expect(updated.verificationState).toBe('AI_INFERRED');
    expect(updated.citations[0].validationStatus).toBe('VALID');

    // Verify operation execution order in store: result, state, audit
    const opOrder = store.opLog;
    const resultIdx = opOrder.indexOf('insertVerificationResult');
    const stateIdx = opOrder.indexOf('updateFindingState');
    const auditIdx = opOrder.indexOf('appendAuditEvent');

    expect(resultIdx).toBeGreaterThanOrEqual(0);
    expect(stateIdx).toBeGreaterThan(resultIdx);
    expect(auditIdx).toBeGreaterThan(stateIdx);

    // Verify verification_results row
    expect(store.verificationResults).toHaveLength(2); // citation_integrity and provenance
    const citResultRow = store.verificationResults[0];
    expect(citResultRow.ruleId).toBe('citation_integrity.v1');
    expect(citResultRow.outcome).toBe('PASS');
    expect(citResultRow.previousState).toBe('UNVERIFIED');
    expect(citResultRow.resultingState).toBe('AI_INFERRED');
    expect(citResultRow.performedAt).toBe(fixedTime.toISOString());

    // Verify audit event
    const stateEvent = store.auditEvents.find(
      (e) => e.action === 'VERIFICATION_STATE_CHANGED',
    );
    expect(stateEvent).toBeDefined();
    expect(stateEvent?.entityId).toBe('fnd-1');
    expect(stateEvent?.metadata.previousState).toBe('UNVERIFIED');
    expect(stateEvent?.metadata.resultingState).toBe('AI_INFERRED');
  });

  it('Scenario 5: a fabricated quote gives an INVALID citation with QUOTE_NOT_FOUND and finding stays UNVERIFIED (persisted, not dropped)', () => {
    const { store, finding } = buildTestSetup();

    finding.citations[0].quotedText = 'We fabricated this quote entirely.';
    store.addFinding(finding);

    runFindingRules(store, 'fnd-1', [], clock);

    const updated = store.getFindingView('fnd-1')!;
    expect(updated).toBeDefined(); // Persisted, not dropped
    expect(updated.verificationState).toBe('UNVERIFIED');
    expect(updated.citations[0].validationStatus).toBe('INVALID');

    const resultRow = store.verificationResults.find(
      (r) => r.ruleId === 'citation_integrity.v1',
    );
    expect(resultRow?.outcome).toBe('FAIL');
    expect(resultRow?.resultingState).toBe('UNVERIFIED');
  });

  it('Scenario 6 / hash mismatch: HASH_MISMATCH; quarantineEvidence demotes citing findings with sourceUnavailable', () => {
    const { store, evidence } = buildTestSetup();

    // 1. First verify finding reaches AI_INFERRED
    runFindingRules(store, 'fnd-1', [], clock);
    expect(store.getFindingView('fnd-1')?.verificationState).toBe('AI_INFERRED');

    // 2. Hash check fails on evidence
    evidence.hashCheckPassed = false;
    store.addEvidence(evidence);

    // Run rules again -> citation integrity fails with HASH_MISMATCH
    runFindingRules(store, 'fnd-1', [], clock);
    expect(store.getFindingView('fnd-1')?.verificationState).toBe('UNVERIFIED');
    expect(store.getFindingView('fnd-1')?.citations[0].validationStatus).toBe('INVALID');

    // 3. Quarantine evidence
    quarantineEvidence(store, evidence.id, clock);

    const quarantinedFinding = store.getFindingView('fnd-1')!;
    expect(quarantinedFinding.verificationState).toBe('UNVERIFIED');
    expect(quarantinedFinding.sourceUnavailable).toBe(true);

    const quarantineAudit = store.auditEvents.find(
      (e) => e.action === 'EVIDENCE_QUARANTINED',
    );
    expect(quarantineAudit).toBeDefined();
    expect(quarantineAudit?.entityId).toBe(evidence.id);

    const stateChangeAudit = store.auditEvents.find(
      (e) =>
        e.action === 'VERIFICATION_STATE_CHANGED' &&
        e.metadata.reason === 'SOURCE_UNAVAILABLE',
    );
    expect(stateChangeAudit).toBeDefined();
  });

  it('T02: an INFERRED finding cannot go to VERIFIED (TRANSITION_NOT_ALLOWED, no rows written)', () => {
    const { store, finding } = buildTestSetup();

    finding.evidenceBasis = 'INFERRED';
    finding.verificationState = 'AI_INFERRED';
    store.addFinding(finding);

    const prevResultCount = store.verificationResults.length;
    const prevAuditCount = store.auditEvents.length;

    const res = applyVerificationResult(
      store,
      {
        findingId: 'fnd-1',
        result: { ruleId: 'claim_verification.v1', outcome: 'PASS' },
        targetState: 'VERIFIED',
      },
      clock,
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('TRANSITION_NOT_ALLOWED');
    }

    // No rows written
    expect(store.verificationResults).toHaveLength(prevResultCount);
    expect(store.auditEvents).toHaveLength(prevAuditCount);
    expect(store.getFindingView('fnd-1')?.verificationState).toBe('AI_INFERRED');
  });

  it('AI_VISION-only provenance caps a finding at AI_INFERRED', () => {
    const { store, artifact, finding } = buildTestSetup();
    store.addArtifact({ ...artifact, extractionMethod: 'AI_VISION' });
    finding.verificationState = 'AI_INFERRED';
    store.addFinding(finding);

    const result = applyVerificationResult(
      store,
      {
        findingId: finding.id,
        result: { ruleId: 'claim_verification.v1', outcome: 'PASS' },
        targetState: 'VERIFIED',
      },
      clock,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('TRANSITION_NOT_ALLOWED');
    expect(store.getFindingView(finding.id)?.verificationState).toBe('AI_INFERRED');
    expect(store.verificationResults).toHaveLength(0);
  });

  it('demotes a higher state to AI_INFERRED when all cited artifacts are AI_VISION', () => {
    const { store, artifact, finding } = buildTestSetup();
    store.addArtifact({ ...artifact, extractionMethod: 'AI_VISION' });
    finding.verificationState = 'VERIFIED';
    store.addFinding(finding);

    runFindingRules(store, finding.id, [], clock);

    expect(store.getFindingView(finding.id)?.verificationState).toBe('AI_INFERRED');
  });

  it('does not apply the AI_VISION cap when another cited artifact is parser-derived', () => {
    const { store, artifact, segment, finding } = buildTestSetup();
    const visionArtifactId = 'art-vision';
    const visionSegmentId = 'seg-vision';
    store.addArtifact({ ...artifact, id: visionArtifactId, extractionMethod: 'AI_VISION' });
    store.addSegment({ ...segment, id: visionSegmentId, artifactId: visionArtifactId });
    finding.verificationState = 'AI_INFERRED';
    finding.citations.push({
      ...finding.citations[0],
      id: 'cit-vision',
      segmentId: visionSegmentId,
      validationStatus: 'VALID',
    });
    store.addFinding(finding);

    const result = applyVerificationResult(
      store,
      {
        findingId: finding.id,
        result: { ruleId: 'claim_verification.v1', outcome: 'PASS' },
        targetState: 'VERIFIED',
      },
      clock,
    );

    expect(result.ok).toBe(true);
    expect(store.getFindingView(finding.id)?.verificationState).toBe('VERIFIED');
  });

  it('T22 (engine part): VERIFIED and CONTRADICTED can only be reached through applyVerificationResult with a PASS result', () => {
    const { store, finding } = buildTestSetup();
    finding.verificationState = 'AI_INFERRED';
    store.addFinding(finding);

    // Attempt to reach VERIFIED with FAIL result
    const failRes = applyVerificationResult(
      store,
      {
        findingId: 'fnd-1',
        result: { ruleId: 'claim_verification.v1', outcome: 'FAIL' },
        targetState: 'VERIFIED',
      },
      clock,
    );
    expect(failRes.ok).toBe(false);
    if (!failRes.ok) {
      expect(failRes.reason).toBe('TRANSITION_NOT_ALLOWED');
    }
    expect(store.getFindingView('fnd-1')?.verificationState).toBe('AI_INFERRED');

    // Attempt to reach CONTRADICTED on a CLAIM with PASS result
    const invalidTypeRes = applyVerificationResult(
      store,
      {
        findingId: 'fnd-1',
        result: { ruleId: 'contradiction_support.v1', outcome: 'PASS' },
        targetState: 'CONTRADICTED',
      },
      clock,
    );
    expect(invalidTypeRes.ok).toBe(false);
    if (!invalidTypeRes.ok) {
      expect(invalidTypeRes.reason).toBe('TRANSITION_NOT_ALLOWED');
    }

    // Success path for DIRECT claim with PASS result
    const passRes = applyVerificationResult(
      store,
      {
        findingId: 'fnd-1',
        result: { ruleId: 'claim_verification.v1', outcome: 'PASS' },
        targetState: 'VERIFIED',
      },
      clock,
    );
    expect(passRes.ok).toBe(true);
    expect(store.getFindingView('fnd-1')?.verificationState).toBe('VERIFIED');
  });

  it('a finding already VERIFIED stays VERIFIED when integrity passes again', () => {
    const { store, finding } = buildTestSetup();
    finding.verificationState = 'VERIFIED';
    store.addFinding(finding);

    runFindingRules(store, 'fnd-1', [], clock);

    const updated = store.getFindingView('fnd-1')!;
    expect(updated.verificationState).toBe('VERIFIED');
  });

  it('idempotency: running runFindingRules twice changes nothing the second time', () => {
    const { store } = buildTestSetup();

    runFindingRules(store, 'fnd-1', [], clock);
    const firstRunState = store.getFindingView('fnd-1')?.verificationState;
    const firstRunCitationStatus =
      store.getFindingView('fnd-1')?.citations[0].validationStatus;
    const firstRunResultsCount = store.verificationResults.length;
    const firstRunAuditCount = store.auditEvents.length;

    runFindingRules(store, 'fnd-1', [], clock);
    const secondRunState = store.getFindingView('fnd-1')?.verificationState;
    const secondRunCitationStatus =
      store.getFindingView('fnd-1')?.citations[0].validationStatus;

    expect(secondRunState).toBe(firstRunState);
    expect(secondRunCitationStatus).toBe(firstRunCitationStatus);
    // State did not change on second run, so no new state change audit events were added
    const secondRunAuditEvents = store.auditEvents.filter(
      (e) => e.action === 'VERIFICATION_STATE_CHANGED',
    );
    expect(secondRunAuditEvents).toHaveLength(1);
  });

  it('cascade in quarantineEvidence: a CONTRADICTION finding falls back to AI_INFERRED when its claim is demoted', () => {
    const { store, finding } = buildTestSetup();

    // 1. Add claim A (VERIFIED)
    finding.id = 'claim-a';
    finding.displayId = 'FND-101';
    finding.verificationState = 'VERIFIED';
    store.addFinding(finding);

    // 2. Add claim B (VERIFIED) from evidence 2
    const evidence2: EvidenceView = {
      id: 'ev-202',
      caseId,
      displayId: 'EV-202',
      status: 'PROCESSED',
      deletedAt: null,
      sha256Stored: 'hash2',
      hashCheckPassed: true,
    };
    store.addEvidence(evidence2);

    const claimB: FindingView = {
      id: 'claim-b',
      caseId,
      displayId: 'FND-102',
      findingType: 'CLAIM',
      evidenceBasis: 'DIRECT',
      verificationState: 'VERIFIED',
      sourceUnavailable: false,
      statement: 'Contradicting statement',
      structuredPayload: {},
      citations: [
        {
          id: 'cit-2',
          evidenceId: 'ev-202',
          segmentId: 'seg-2',
          quotedText: 'quote 2',
          locatorType: 'PAGE',
          locator: { page: 2 },
          validationStatus: 'VALID',
        },
      ],
    };
    store.addFinding(claimB);

    // 3. Add CONTRADICTION finding referencing claim-a and claim-b
    const contradictionFinding: FindingView = {
      id: 'contra-1',
      caseId,
      displayId: 'FND-301',
      findingType: 'CONTRADICTION',
      evidenceBasis: 'CONFLICTING',
      verificationState: 'CONTRADICTED',
      sourceUnavailable: false,
      statement: 'Claims A and B contradict',
      structuredPayload: {
        claimARef: 'FND-101',
        claimBRef: 'FND-102',
      },
      citations: [],
    };
    store.addFinding(contradictionFinding);

    // 4. Quarantine evidence 1 -> claim-a demotes to UNVERIFIED
    quarantineEvidence(store, evidenceId, clock);

    expect(store.getFindingView('claim-a')?.verificationState).toBe('UNVERIFIED');
    expect(store.getFindingView('claim-a')?.sourceUnavailable).toBe(true);

    // Contradiction cascade demotes contra-1 to AI_INFERRED
    const updatedContra = store.getFindingView('contra-1')!;
    expect(updatedContra.verificationState).toBe('AI_INFERRED');
  });
});
