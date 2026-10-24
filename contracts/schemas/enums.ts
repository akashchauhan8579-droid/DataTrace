import { z } from 'zod';

export const EvidenceBasisSchema = z.enum([
  'DIRECT',       // stated or shown in the evidence
  'OBSERVED',     // computed by code from structured data (headers, hashes). Never claimed by a model.
  'INFERRED',     // reasoned by a model; must be qualified in the UI
  'CONFLICTING',  // evidence points conflict
]);
export type EvidenceBasis = z.infer<typeof EvidenceBasisSchema>;

// What a model may claim. OBSERVED is assigned only by DataTrace code (parser-derived findings).
export const CandidateBasisSchema = z.enum(['DIRECT', 'INFERRED', 'CONFLICTING']);
export type CandidateBasis = z.infer<typeof CandidateBasisSchema>;

export const VerificationStateSchema = z.enum([
  'UNVERIFIED', 'AI_INFERRED', 'CORROBORATED', 'VERIFIED', 'CONTRADICTED',
]);
export type VerificationState = z.infer<typeof VerificationStateSchema>;

export const FindingTypeSchema = z.enum([
  'CLAIM', 'ENTITY', 'EVENT', 'RELATIONSHIP', 'REQUEST', 'RESPONSE',
  'FRICTION_SIGNAL', 'CONTRADICTION', 'DATA_CATEGORY',
]);
export type FindingType = z.infer<typeof FindingTypeSchema>;

export const RelationshipTypeSchema = z.enum([
  'SENT_TO', 'SENT_BY', 'REQUESTED_FROM', 'RESPONDED_TO', 'ABOUT', 'RELATES_TO',
  'PROCESSES', 'CONTAINS', 'CONTRADICTS', 'FOLLOWED_BY', 'ASSOCIATED_WITH',
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const FrictionSignalTypeSchema = z.enum([
  'UNANSWERED_REQUEST', 'MISSING_INFORMATION', 'REPEATED_REDIRECTION', 'GENERIC_RESPONSE',
  'REPEATED_REQUEST_FOR_PROVIDED_INFORMATION', 'CONTRADICTORY_INSTRUCTION',
  'UNCLEAR_NEXT_STEP', 'POSSIBLE_DELAY',
]);
export type FrictionSignalType = z.infer<typeof FrictionSignalTypeSchema>;

export const RequestResponseStatusSchema = z.enum([
  'ANSWERED', 'PARTIAL', 'UNANSWERED', 'DEFLECTED', 'UNCLEAR',
]);
export type RequestResponseStatus = z.infer<typeof RequestResponseStatusSchema>;
