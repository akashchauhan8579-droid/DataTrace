import type {
  ArtifactView,
  CitationView,
  EvidenceView,
  FindingView,
  RuleContext,
  SegmentView,
  VerificationState,
} from './types';
import type { AuditEventInput, EngineStore, VerificationResultRow } from './engine';

export class InMemoryEngineStore implements EngineStore {
  readonly findings = new Map<string, FindingView>();
  readonly evidence = new Map<string, EvidenceView>();
  readonly segments = new Map<string, SegmentView>();
  readonly artifacts = new Map<string, ArtifactView>();
  readonly citations = new Map<string, CitationView>();
  readonly verificationResults: VerificationResultRow[] = [];
  readonly auditEvents: AuditEventInput[] = [];
  readonly opLog: string[] = [];

  addEvidence(e: EvidenceView): void {
    this.evidence.set(e.id, { ...e });
  }

  addArtifact(a: ArtifactView): void {
    this.artifacts.set(a.id, { ...a });
  }

  addSegment(s: SegmentView): void {
    this.segments.set(s.id, { ...s });
  }

  addCitation(c: CitationView): void {
    this.citations.set(c.id, { ...c });
  }

  addFinding(f: FindingView): void {
    this.findings.set(f.id, {
      ...f,
      citations: f.citations.map((c) => ({ ...c })),
    });
    for (const c of f.citations) {
      this.citations.set(c.id, { ...c });
    }
  }

  getFindingView(id: string): FindingView | undefined {
    const f = this.findings.get(id);
    if (!f) return undefined;
    return {
      ...f,
      citations: f.citations.map((c) => {
        const stored = this.citations.get(c.id);
        return stored ? { ...stored } : { ...c };
      }),
    };
  }

  getFindingsByCaseId(caseId: string): FindingView[] {
    const result: FindingView[] = [];
    for (const f of this.findings.values()) {
      if (f.caseId === caseId) {
        result.push(this.getFindingView(f.id)!);
      }
    }
    return result;
  }

  getFindingsByEvidenceId(evidenceId: string): FindingView[] {
    const result: FindingView[] = [];
    for (const f of this.findings.values()) {
      const citesEvidence = f.citations.some((c) => c.evidenceId === evidenceId);
      if (citesEvidence) {
        result.push(this.getFindingView(f.id)!);
      }
    }
    return result;
  }

  getRuleContext(_caseId: string): RuleContext {
    return {
      getEvidence: (id: string) => this.evidence.get(id),
      getSegment: (id: string) => this.segments.get(id),
      getArtifact: (id: string) => this.artifacts.get(id),
    };
  }

  insertVerificationResult(row: VerificationResultRow): void {
    this.opLog.push('insertVerificationResult');
    this.verificationResults.push({ ...row });
  }

  updateFindingState(id: string, state: VerificationState): void {
    this.opLog.push('updateFindingState');
    const f = this.findings.get(id);
    if (f) {
      f.verificationState = state;
    }
  }

  setSourceUnavailable(id: string, unavailable: boolean): void {
    this.opLog.push('setSourceUnavailable');
    const f = this.findings.get(id);
    if (f) {
      f.sourceUnavailable = unavailable;
    }
  }

  updateCitationValidationStatus(
    citationId: string,
    status: 'PENDING' | 'VALID' | 'INVALID',
  ): void {
    this.opLog.push('updateCitationValidationStatus');
    const citation = this.citations.get(citationId);
    if (citation) {
      citation.validationStatus = status;
    }
    for (const f of this.findings.values()) {
      for (const c of f.citations) {
        if (c.id === citationId) {
          c.validationStatus = status;
        }
      }
    }
  }

  appendAuditEvent(event: AuditEventInput): void {
    this.opLog.push('appendAuditEvent');
    this.auditEvents.push({ ...event });
  }
}
