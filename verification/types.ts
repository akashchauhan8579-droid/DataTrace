import type {
  FindingType,
  EvidenceBasis,
  VerificationState,
  LocatorType,
} from '../contracts';

export type { FindingType, EvidenceBasis, VerificationState, LocatorType };

export type RuleOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface RuleResult {
  ruleId: string;
  outcome: RuleOutcome;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface CitationView {
  id: string;
  evidenceId: string;
  segmentId: string | null;
  quotedText: string | null;
  locatorType: LocatorType | string;
  locator: Record<string, unknown>;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID';
}

export interface FindingView {
  id: string;
  caseId: string;
  displayId: string;
  findingType: FindingType;
  evidenceBasis: EvidenceBasis;
  verificationState: VerificationState;
  sourceUnavailable: boolean;
  statement: string;
  structuredPayload: unknown;
  citations: CitationView[];
}

export interface EvidenceView {
  id: string;
  caseId: string;
  displayId: string;
  status: string;
  deletedAt: string | null;
  sha256Stored: string;
  hashCheckPassed: boolean;
  headerText?: string;
}

export interface SegmentView {
  id: string;
  evidenceId: string;
  ordinal: number;
  locatorType: LocatorType | string;
  locator: Record<string, unknown>;
  text: string;
  artifactId: string;
}

export interface ArtifactView {
  id: string;
  evidenceId: string;
  extractionMethod: 'PARSER' | 'MANUAL' | 'AI_VISION';
}

export interface RuleContext {
  getEvidence(id: string): EvidenceView | undefined;
  getSegment(id: string): SegmentView | undefined;
  getArtifact(id: string): ArtifactView | undefined;
}

export interface FindingRule {
  id: string;
  applies(f: FindingView): boolean;
  evaluate(f: FindingView, ctx: RuleContext): RuleResult;
  passState: VerificationState | null;
}
