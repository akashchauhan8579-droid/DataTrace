import { z } from 'zod';
import { RelationshipTypeSchema, FrictionSignalTypeSchema } from './enums';

export const PredicateSchema = z.enum([
  'holds_data', 'deletes_data', 'retains_data', 'shares_data_with',
  'acknowledges_request', 'extends_deadline', 'requires_identity_verification', 'provides_data',
]);

export const NormalizedClaimSchema = z.object({
  subject: z.string().min(1).max(200),
  predicate: PredicateSchema,
  object: z.string().min(1).max(300),
  polarity: z.enum(['AFFIRMS', 'DENIES']),
}).strict();

// A finding reference inside a payload: a batch-local ref ("e1") or an existing display ID ("FND-201"). Never a UUID.
export const LocalRefSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export const FindingDisplayIdSchema = z.string().regex(/^FND-\d+$/);
export const FindingRefSchema = z.union([FindingDisplayIdSchema, LocalRefSchema]);

export const ClaimPayloadSchema = z.object({
  normalizedClaim: NormalizedClaimSchema,
  speaker: z.enum(['ORGANIZATION', 'USER', 'THIRD_PARTY']).optional(),
  statedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export const EntityPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.enum(['CONTROLLER', 'PROCESSOR', 'DATA_SUBJECT', 'SYSTEM', 'OTHER']),
}).strict();

export const EventPayloadSchema = z.object({
  label: z.string().min(1).max(200),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  dateSource: z.enum(['HEADER', 'TEXT']).default('TEXT'),
  dateUncertain: z.boolean().optional(),
}).strict();

export const RelationshipPayloadSchema = z.object({
  relationshipType: RelationshipTypeSchema,
  fromRef: FindingRefSchema,
  toRef: FindingRefSchema,
}).strict();

export const RequestPayloadSchema = z.object({
  item: z.string().min(1).max(500),
  requestType: z.enum(['ACCESS', 'DELETION', 'CORRECTION', 'OPT_OUT', 'OTHER']).optional(),
}).strict();

export const ResponsePayloadSchema = z.object({
  addresses: z.array(FindingRefSchema),
  coverage: z.enum(['FULL', 'PARTIAL', 'DEFLECTED', 'UNCLEAR']),
}).strict();

export const FrictionPayloadSchema = z.object({
  signalType: FrictionSignalTypeSchema,
  relatedRefs: z.array(FindingRefSchema).default([]),
}).strict();

export const DataCategoryPayloadSchema = z.object({
  category: z.string().min(1).max(200),
}).strict();

// A model proposes a pair of existing claims. It cannot set the resolution.
export const ContradictionCandidatePayloadSchema = z.object({
  claimARef: FindingRefSchema,
  claimBRef: FindingRefSchema,
}).strict();

// Persisted: refs are rewritten to display IDs; `resolution` is written only by the engine or by user confirmation.
export const ContradictionPayloadSchema = ContradictionCandidatePayloadSchema.extend({
  claimARef: FindingDisplayIdSchema,
  claimBRef: FindingDisplayIdSchema,
  resolution: z.object({
    mode: z.enum(['MECHANICAL', 'USER_CONFIRMED']),
    confirmedBy: z.string().uuid().optional(),
    confirmedAt: z.string().datetime({ offset: true }).optional(),
  }).optional(),
}).strict();

export type NormalizedClaim = z.infer<typeof NormalizedClaimSchema>;
export type Predicate = z.infer<typeof PredicateSchema>;