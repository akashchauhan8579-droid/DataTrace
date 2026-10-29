import { z } from 'zod';

/**
 * Account Deletion State Machine Enum (Spec v1.5.0 §15.5.1, D2).
 * REQUESTED > STORAGE_PURGED > GMAIL_REVOKED > DB_PURGED > AUTH_DELETED > COMPLETE
 */
export const AccountDeletionStateSchema = z.enum([
  'REQUESTED',
  'STORAGE_PURGED',
  'GMAIL_REVOKED',
  'DB_PURGED',
  'AUTH_DELETED',
  'COMPLETE',
]);
export type AccountDeletionState = z.infer<typeof AccountDeletionStateSchema>;

/**
 * Confirmation string required to initiate account destruction (D4).
 */
export const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT' as const;

/**
 * New error codes introduced in v1.5.0 (Spec §16, D8).
 */
export const ACCOUNT_ERROR_CODES = {
  ACCOUNT_DELETION_PENDING: 'ACCOUNT_DELETION_PENDING',
  CONFIRMATION_MISMATCH: 'CONFIRMATION_MISMATCH',
  REAUTH_FAILED: 'REAUTH_FAILED',
} as const;
export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[keyof typeof ACCOUNT_ERROR_CODES];

/**
 * Request payload for POST /api/account/deletion (D4).
 */
export const DeletionRequestBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmationPhrase: z.string().min(1, 'Confirmation phrase is required'),
}).strict();
export type DeletionRequestBody = z.infer<typeof DeletionRequestBodySchema>;

/**
 * Response schema representing status of an account deletion request (D2).
 */
export const DeletionStatusSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  state: AccountDeletionStateSchema,
  subjectHash: z.string(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
  counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
}).strict();
export type DeletionStatus = z.infer<typeof DeletionStatusSchema>;

// =============================================================================
// Account Data Export Schema (Spec v1.5.0 §15.5.1, D5)
// Server-built JSON: profile metadata, cases, evidence metadata, segments,
// findings, citations, reports, audit events + head hash, Gmail status/address.
// Strictly NEVER secrets, tokens, or raw binaries.
// =============================================================================

export const ExportProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  createdAt: z.string().nullable().optional(),
}).strict();
export type ExportProfile = z.infer<typeof ExportProfileSchema>;

export const ExportCaseSchema = z.object({
  id: z.string().uuid(),
  displayId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type ExportCase = z.infer<typeof ExportCaseSchema>;

export const ExportEvidenceSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  displayId: z.string(),
  originalFilename: z.string(),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string(),
  sourceType: z.string(),
  ingestSource: z.enum(['UPLOAD', 'GMAIL_IMPORT']),
  externalRef: z.string().nullable().optional(),
  capturedAt: z.string().nullable().optional(),
  uploadedAt: z.string(),
  processingStatus: z.string(),
  deletedAt: z.string().nullable().optional(),
}).strict();
export type ExportEvidence = z.infer<typeof ExportEvidenceSchema>;

export const ExportSegmentSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  artifactId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  locatorType: z.string(),
  locator: z.record(z.string(), z.unknown()),
  segmentText: z.string(),
  createdAt: z.string(),
}).strict();
export type ExportSegment = z.infer<typeof ExportSegmentSchema>;

export const ExportFindingSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  displayId: z.string(),
  findingType: z.string(),
  statement: z.string(),
  structuredPayload: z.record(z.string(), z.unknown()),
  evidenceBasis: z.string(),
  verificationState: z.string(),
  candidateConfidence: z.number().nullable().optional(),
  sourceUnavailable: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type ExportFinding = z.infer<typeof ExportFindingSchema>;

export const ExportCitationSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  findingId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  segmentId: z.string().uuid().nullable().optional(),
  exactQuote: z.string(),
  createdSource: z.string(),
  createdAt: z.string(),
}).strict();
export type ExportCitation = z.infer<typeof ExportCitationSchema>;

export const ExportReportSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  framework: z.string(),
  lens: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  content: z.record(z.string(), z.unknown()),
  validationState: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type ExportReport = z.infer<typeof ExportReportSchema>;

export const ExportAuditEventSchema = z.object({
  caseSeq: z.number().int().positive(),
  rowHash: z.string().length(64),
  prevHash: z.string().length(64),
  actorType: z.string(),
  actorId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  occurredAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
}).strict();
export type ExportAuditEvent = z.infer<typeof ExportAuditEventSchema>;

export const ExportCaseAuditSchema = z.object({
  caseId: z.string().uuid(),
  chainHeadHash: z.string().length(64).nullable(),
  chainIntact: z.boolean(),
  events: z.array(ExportAuditEventSchema),
}).strict();
export type ExportCaseAudit = z.infer<typeof ExportCaseAuditSchema>;

export const ExportGmailSchema = z.object({
  connected: z.boolean(),
  googleEmail: z.string().email().nullable().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED']).nullable().optional(),
}).strict();
export type ExportGmail = z.infer<typeof ExportGmailSchema>;

/**
 * Top-level Account Export JSON schema (Spec v1.5.0 §15.5.1, D5).
 */
export const AccountExportSchema = z.object({
  exportedAt: z.string().datetime(),
  specVersion: z.literal('1.5.0'),
  profile: ExportProfileSchema,
  cases: z.array(ExportCaseSchema),
  evidence: z.array(ExportEvidenceSchema),
  segments: z.array(ExportSegmentSchema),
  findings: z.array(ExportFindingSchema),
  citations: z.array(ExportCitationSchema),
  reports: z.array(ExportReportSchema),
  audit: z.array(ExportCaseAuditSchema),
  gmail: ExportGmailSchema,
}).strict();
export type AccountExport = z.infer<typeof AccountExportSchema>;
