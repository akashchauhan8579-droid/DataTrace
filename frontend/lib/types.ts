// All TypeScript types derived from real backend route handlers.
// Do NOT add fields not present in the actual API responses.

// ─── Cases ────────────────────────────────────────────────────────────────────
export type CaseStatus = 'ACTIVE' | 'ARCHIVED' | 'CLOSED';

export interface Case {
  id: string;
  displayId: string;
  title: string;
  description: string | null | undefined;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────
export type SourceType = 'EMAIL' | 'DOCUMENT' | 'SCREENSHOT' | 'MANUAL_LOG';
export type ProcessingStatus = 'PENDING' | 'PROCESSED' | 'FAILED' | 'QUARANTINED';

export interface EvidenceItem {
  id: string;
  display_id: string;
  source_type: SourceType;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  sha256: string;
  captured_at: string | null;
  uploaded_at: string;
  processing_status: ProcessingStatus;
  deleted_at: string | null;
}

export interface EvidenceArtifact {
  id: string;
  evidence_id: string;
  artifact_type: string;
  extraction_method: string;
  version: string;
  raw_content: string;
  created_by_process: string;
}

export interface EvidenceSegment {
  id: string;
  evidence_id: string;
  artifact_id: string;
  ordinal: number;
  locator_type: string;
  locator: Record<string, unknown>;
  segment_text: string;
}

export interface EvidenceDetail {
  item: EvidenceItem;
  artifacts: EvidenceArtifact[];
  segments: EvidenceSegment[];
}

export interface UploadEvidenceInput {
  sourceType: SourceType;
  filename: string;
  mimeType: string;
  content: string; // base64 or raw string
  isBase64: boolean;
}

export interface DownloadResult {
  url: string;
  expiresAt: string;
}

// ─── Findings ─────────────────────────────────────────────────────────────────
export type EvidenceBasis = 'DIRECT' | 'OBSERVED' | 'INFERRED' | 'CONFLICTING';
export type VerificationState =
  | 'UNVERIFIED'
  | 'AI_INFERRED'
  | 'CORROBORATED'
  | 'VERIFIED'
  | 'CONTRADICTED';

export type FindingType =
  | 'CLAIM'
  | 'ENTITY'
  | 'EVENT'
  | 'RELATIONSHIP'
  | 'REQUEST'
  | 'RESPONSE'
  | 'FRICTION_SIGNAL'
  | 'CONTRADICTION'
  | 'DATA_CATEGORY';

export interface Citation {
  id: string;
  evidence_id: string;
  segment_id: string;
  locator_type: string;
  locator: Record<string, unknown>;
  quoted_text: string | null;
  validation_status: string;
}

export interface Finding {
  id: string;
  display_id: string;
  finding_type: FindingType;
  statement: string;
  structured_payload: Record<string, unknown>;
  evidence_basis: EvidenceBasis;
  verification_state: VerificationState;
  candidate_confidence: number | null;
  source_unavailable: boolean;
  human_confirmed_at: string | null;
  citations: Citation[];
}

// ─── Analysis ─────────────────────────────────────────────────────────────────
export type AnalysisRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AnalysisTask {
  id: string;
  task_type: string;
  status: TaskStatus;
  provider: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  retry_count: number;
  failure_reason: string | null;
  created_at: string;
}

export interface AnalysisRunProgress {
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
}

export interface AnalysisRun {
  id: string;
  caseId: string;
  status: AnalysisRunStatus;
  startedAt: string;
  completedAt: string | null;
  progress: AnalysisRunProgress;
  tasks: AnalysisTask[];
}

// ─── Matrix ───────────────────────────────────────────────────────────────────
export type MatrixStatus =
  | 'ANSWERED'
  | 'PARTIAL'
  | 'UNANSWERED'
  | 'DEFLECTED'
  | 'UNCLEAR';

export interface MatrixLink {
  requestId: string;
  responseId: string;
  status: MatrixStatus;
  rationale: string;
  citations: string[];
}

export interface MatrixResult {
  links: MatrixLink[];
  unansweredRequests: string[];
}

export interface MatrixResponse {
  caseId: string;
  summary: {
    totalRequests: number;
    totalResponses: number;
    linksCount: number;
    unansweredCount: number;
  };
  matrix: MatrixResult;
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export type ReportLens = 'EVIDENCE' | 'FINDINGS' | 'COMPLAINT';
export type ReportStatus = 'DRAFT' | 'VALIDATED' | 'EXPORTED';
export type ValidationStatus = 'PENDING' | 'PASSED' | 'FAILED';

export interface ReportBlock {
  id?: string;
  kind: 'heading' | 'assertion' | 'notice' | 'user_note';
  text?: string;
  findingIds?: string[];
  notes?: string;
}

export interface ReportContent {
  lens?: string;
  framework?: string;
  blocks: ReportBlock[];
}

export interface Report {
  id: string;
  case_id: string;
  active_lens: ReportLens;
  status: ReportStatus;
  content: ReportContent;
  validation_status: ValidationStatus;
  edited_after_draft?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidationDetails {
  status: 'VALIDATED' | 'FAILED';
  failingBlockIds: string[];
  editedAssertionCount: number;
}

// ─── Audit ────────────────────────────────────────────────────────────────────
export interface AuditEvent {
  id?: string;
  seq?: number;
  case_seq?: number;
  case_id?: string;
  actor_type: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  occurred_at?: string;
  previous_event_id?: string | null;
  prev_hash?: string | null;
  row_hash?: string | null;
  chain_hash?: string | null;
}

// ─── API Error Envelope ───────────────────────────────────────────────────────
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiResponseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}
