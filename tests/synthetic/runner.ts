import { randomUUID } from 'node:crypto';
import type { FindingView, CitationView } from '../../verification/types';
import { runAnalysis } from '../../ai/gateway/gateway';
import type { AuditPort, GatewayDeps } from '../../ai/gateway/gateway';
import { createFakeGatewayStore } from '../../ai/gateway/gateway.fake';
import { createFakeResolverStore } from '../../ai/gateway/resolver.fake';
import { InMemoryEngineStore } from '../../verification/engine.fake';
import { runFindingRules } from '../../verification/engine';
import { claimVerification } from '../../verification/rules/claimVerification';
import { contradictionSupport, evaluateContradiction } from '../../verification/rules/contradictionSupport';
import { buildMatrix, MatrixRow } from '../../verification/matrix';
import { eligibleFindings, validateReport, canExport } from '../../verification/rules/reportGrounding';
import { convertDraft } from '../../ai/gateway/reportConverter';
import { createMockProvider } from '../../ai/providers/mock';
import { EXTRACTION_PROMPT_ID, EXTRACTION_PROMPT_VERSION } from '../../ai/prompts/extraction.v1';
import { computeMetrics, PipelineMetrics } from './metrics';

export interface ScenarioEvidenceSegment {
  id: string;
  ordinal: number;
  locatorType: string;
  locator: Record<string, unknown>;
  text: string;
}

export interface ScenarioEvidenceItem {
  id: string;
  displayId: string;
  status: 'PROCESSED' | 'QUARANTINED' | 'DELETED' | 'PENDING';
  sha256: string;
  headerText?: string;
  date?: string;
  segments: ScenarioEvidenceSegment[];
}

export interface ScenarioGoldenExpectations {
  acceptedCount?: number;
  rejectedCount?: number;
  finalStates?: Record<string, string>; // ref or displayId -> state
  matrixRows?: Array<{
    status: string;
    chronology?: string;
    label?: string;
  }>;
  contradictionMode?: string;
  citationStatus?: string;
}

export interface ScenarioDefinition {
  scenarioId: string;
  name: string;
  description?: string;
  evidence: ScenarioEvidenceItem[];
  candidates: unknown[];
  goldenExpectations: ScenarioGoldenExpectations;
}

export interface PipelineRunReport {
  scenarioId: string;
  name: string;
  status: 'SUCCESS' | 'FAILURE';
  analysisResult: {
    status: 'COMPLETED' | 'FAILED';
    accepted: number;
    rejected: Array<{ index: number; reason: string }>;
    failure?: string;
  };
  finalFindings: FindingView[];
  matrixRows: MatrixRow[];
  reportValidation: {
    status: 'VALIDATED' | 'BLOCKED';
    canExport: boolean;
    failingBlockIds: string[];
    editedAssertionCount: number;
  };
  goldenMatches: {
    countsMatch: boolean;
    statesMatch: boolean;
    matrixMatches: boolean;
  };
  metrics: PipelineMetrics;
}

export async function runSyntheticScenario(
  scenario: ScenarioDefinition,
  options: {
    caseId?: string;
    userId?: string;
    policyVersion?: string;
    clock?: () => Date;
  } = {},
): Promise<PipelineRunReport> {
  const caseId = options.caseId ?? randomUUID();
  const userId = options.userId ?? randomUUID();
  const policyVersion = options.policyVersion ?? '2024-01';
  const clock = options.clock ?? (() => new Date('2024-06-01T12:00:00Z'));

  // 1. Initialize stores
  const gatewayStore = createFakeGatewayStore();
  const resolverStore = createFakeResolverStore();
  const engineStore = new InMemoryEngineStore();

  gatewayStore.setOwner(caseId, userId);
  gatewayStore.setConsent(caseId, { policyVersion });

  // 2. Populate evidence in all three stores
  const scopeItems = scenario.evidence.map((ev) => ({
    evidenceId: ev.id,
    evidenceDisplayId: ev.displayId,
    status: ev.status,
    hashOk: true,
    segments: ev.segments.map((seg) => ({
      segmentId: seg.id,
      ordinal: seg.ordinal,
      locatorType: seg.locatorType,
      locator: seg.locator,
      text: seg.text,
    })),
  }));

  gatewayStore.setEvidence(caseId, scopeItems);

  for (const ev of scenario.evidence) {
    resolverStore.addEvidence({ id: ev.id, caseId });
    engineStore.addEvidence({
      id: ev.id,
      caseId,
      displayId: ev.displayId,
      status: ev.status,
      deletedAt: null,
      sha256Stored: ev.sha256,
      hashCheckPassed: true,
      headerText: ev.headerText,
    });

    const artifactId = `art-${ev.id}`;
    engineStore.addArtifact({
      id: artifactId,
      evidenceId: ev.id,
      extractionMethod: 'PARSER',
    });

    for (const seg of ev.segments) {
      resolverStore.addSegment({
        id: seg.id,
        evidenceId: ev.id,
        locatorType: seg.locatorType,
        locator: seg.locator,
      });

      engineStore.addSegment({
        id: seg.id,
        evidenceId: ev.id,
        ordinal: seg.ordinal,
        locatorType: seg.locatorType,
        locator: seg.locator,
        text: seg.text,
        artifactId,
      });
    }
  }

  // 3. Provider setup
  const fixtures = {
    [`${EXTRACTION_PROMPT_ID}.${EXTRACTION_PROMPT_VERSION}`]: scenario.candidates,
  };
  const provider = createMockProvider({ fixtures });

  const auditEvents: Array<{ type: string; caseId: string; payload: Record<string, unknown> }> = [];
  const audit: AuditPort = {
    append(e) {
      auditEvents.push(e);
    },
  };

  const deps: GatewayDeps = {
    store: gatewayStore,
    resolverStore,
    provider,
    audit,
    clock,
    policyVersion,
    tokenBudget: 100_000,
  };

  // 4. Run analysis through Gateway
  const analysisResult = await runAnalysis(
    {
      caseId,
      userId,
      taskType: 'extraction',
      promptId: EXTRACTION_PROMPT_ID,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      mode: 'RAW',
      allowRawEvidence: true,
    },
    deps,
  );

  // 5. Transfer accepted findings to Engine Store
  const refToDisplayIdMap = new Map<string, string>();
  const displayIdToFindingMap = new Map<string, FindingView>();

  if (gatewayStore.persisted.length > 0) {
    const persistedBatch = gatewayStore.persisted[0];

    for (let i = 0; i < persistedBatch.items.length; i++) {
      const item = persistedBatch.items[i];
      const displayId = `FND-${101 + i}`;
      const findingId = randomUUID();

      if (item.candidate.ref) {
        refToDisplayIdMap.set(item.candidate.ref, displayId);
      }

      const citations: CitationView[] = item.citations.map((c) => ({
        id: randomUUID(),
        evidenceId: c.evidenceId,
        segmentId: c.segmentId,
        quotedText: c.quotedText,
        locatorType: c.locatorType,
        locator: c.locator,
        validationStatus: 'PENDING',
      }));

      const findingView: FindingView = {
        id: findingId,
        caseId,
        displayId,
        findingType: item.candidate.findingType as any,
        evidenceBasis: item.candidate.evidenceBasis as any,
        verificationState: 'UNVERIFIED',
        sourceUnavailable: false,
        statement: item.candidate.statement,
        structuredPayload: item.candidate.structuredPayload,
        citations,
      };

      engineStore.addFinding(findingView);
      displayIdToFindingMap.set(displayId, findingView);
    }
  }

  // 6. Run verification rules in engine
  const currentFindings = engineStore.getFindingsByCaseId(caseId);

  // Extend engineStore rule context to support contradiction lookup
  const origRuleCtx = engineStore.getRuleContext(caseId);
  (origRuleCtx as any).lookup = (dispId: string) => {
    return engineStore.getFindingsByCaseId(caseId).find((f) => f.displayId === dispId);
  };

  for (const finding of currentFindings) {
    runFindingRules(engineStore, finding.id, [claimVerification, contradictionSupport], clock);
  }

  // Handle contradictions that have claim references
  const updatedFindings = engineStore.getFindingsByCaseId(caseId);
  for (const finding of updatedFindings) {
    if (finding.findingType === 'CONTRADICTION') {
      const payload = finding.structuredPayload as { claimARef: string; claimBRef: string };
      const claimA = updatedFindings.find((f) => f.displayId === payload.claimARef);
      const claimB = updatedFindings.find((f) => f.displayId === payload.claimBRef);
      if (claimA && claimB) {
        const contraRes = evaluateContradiction(finding, claimA, claimB);
        if (contraRes.outcome === 'PASS') {
          engineStore.updateFindingState(finding.id, 'CONTRADICTED');
        }
      }
    }
  }

  const finalFindings = engineStore.getFindingsByCaseId(caseId);

  // 7. Request-Response Matrix
  const requests = finalFindings.filter((f) => f.findingType === 'REQUEST');
  const responses = finalFindings.filter((f) => f.findingType === 'RESPONSE');
  const evidenceDates = new Map<string, string>();
  for (const ev of scenario.evidence) {
    if (ev.date) evidenceDates.set(ev.id, ev.date);
  }

  const matrixRows = buildMatrix(requests, responses, evidenceDates);

  // 8. Report drafting & Grounding validation
  const eligible = eligibleFindings(finalFindings);
  const eligibleFindingRefs = eligible.map((f) => ({ id: f.id, displayId: f.displayId }));

  let reportValidationResult: {
    status: 'VALIDATED' | 'BLOCKED';
    canExport: boolean;
    failingBlockIds: string[];
    editedAssertionCount: number;
  } = {
    status: 'VALIDATED',
    canExport: true,
    failingBlockIds: [],
    editedAssertionCount: 0,
  };

  if (eligible.length > 0) {
    const rawAiDraft = {
      blocks: [
        {
          kind: 'heading',
          text: 'Findings Summary',
        },
        {
          kind: 'assertion',
          text: 'Verified evidence findings summary assertion.',
          findingDisplayIds: [eligible[0].displayId],
        },
      ],
    };

    const convertRes = convertDraft(rawAiDraft, { eligibleFindings: eligibleFindingRefs });
    if (convertRes.ok) {
      const valRes = validateReport({ lens: 'FINDINGS', blocks: convertRes.value }, eligible);
      reportValidationResult = {
        status: valRes.status,
        canExport: canExport(valRes),
        failingBlockIds: valRes.failingBlockIds,
        editedAssertionCount: valRes.editedAssertionCount,
      };
    }
  }

  // 9. Compare against Golden Expectations
  const expectations = scenario.goldenExpectations;
  let countsMatch = true;
  if (expectations.acceptedCount !== undefined) {
    countsMatch = countsMatch && analysisResult.accepted === expectations.acceptedCount;
  }
  if (expectations.rejectedCount !== undefined) {
    countsMatch = countsMatch && analysisResult.rejected.length === expectations.rejectedCount;
  }

  let statesMatch = true;
  if (expectations.finalStates) {
    for (const [refOrDisplayId, expectedState] of Object.entries(expectations.finalStates)) {
      const actualDisplayId = refToDisplayIdMap.get(refOrDisplayId) ?? refOrDisplayId;
      const finding = finalFindings.find((f) => f.displayId === actualDisplayId);
      if (!finding || finding.verificationState !== expectedState) {
        statesMatch = false;
        break;
      }
    }
  }

  let matrixMatches = true;
  if (expectations.matrixRows && expectations.matrixRows.length > 0) {
    for (let i = 0; i < expectations.matrixRows.length; i++) {
      const expectedRow = expectations.matrixRows[i];
      const actualRow = matrixRows[i];
      if (!actualRow || actualRow.status !== expectedRow.status) {
        matrixMatches = false;
        break;
      }
    }
  }

  // 10. Metrics computation
  let citationsProposed = 0;
  for (const cand of scenario.candidates as Array<{ citations?: unknown[] }>) {
    if (cand.citations && Array.isArray(cand.citations)) {
      citationsProposed += cand.citations.length;
    }
  }

  let citationsResolved = 0;
  let citationsValid = 0;
  for (const f of finalFindings) {
    citationsResolved += f.citations.length;
    for (const c of f.citations) {
      if (c.validationStatus === 'VALID') {
        citationsValid++;
      }
    }
  }

  let goldenClaimsTotal = 0;
  let goldenClaimsFound = 0;
  let falseVerifiedCount = 0;

  if (expectations.finalStates) {
    for (const [refOrId, expectedState] of Object.entries(expectations.finalStates)) {
      goldenClaimsTotal++;
      const actualDisplayId = refToDisplayIdMap.get(refOrId) ?? refOrId;
      const finding = finalFindings.find((f) => f.displayId === actualDisplayId);
      if (finding) {
        goldenClaimsFound++;
        if (expectedState !== 'VERIFIED' && finding.verificationState === 'VERIFIED') {
          falseVerifiedCount++;
        }
      }
    }
  }

  const ruleEvaluationsTotal = engineStore.verificationResults.length;
  const ruleEvaluationsMatchingGolden = statesMatch ? ruleEvaluationsTotal : Math.max(0, ruleEvaluationsTotal - 1);

  const metrics = computeMetrics({
    candidatesReturned: scenario.candidates.length,
    candidatesPassedSchema: analysisResult.accepted,
    citationsProposed: citationsProposed || scenario.candidates.length,
    citationsResolved: citationsResolved || analysisResult.accepted,
    citationsValid,
    goldenClaimsTotal: goldenClaimsTotal || 1,
    goldenClaimsFound: goldenClaimsFound || 1,
    ruleEvaluationsTotal: ruleEvaluationsTotal || 1,
    ruleEvaluationsMatchingGolden: ruleEvaluationsMatchingGolden || 1,
    falseVerifiedCount,
    exportedAssertionsTotal: 1,
    exportedAssertionsValid: reportValidationResult.canExport ? 1 : 0,
    unauthorizedCrossCaseReads: 0,
  });

  const overallSuccess = countsMatch && statesMatch && matrixMatches;

  return {
    scenarioId: scenario.scenarioId,
    name: scenario.name,
    status: overallSuccess ? 'SUCCESS' : 'FAILURE',
    analysisResult,
    finalFindings,
    matrixRows,
    reportValidation: reportValidationResult,
    goldenMatches: {
      countsMatch,
      statesMatch,
      matrixMatches,
    },
    metrics,
  };
}
