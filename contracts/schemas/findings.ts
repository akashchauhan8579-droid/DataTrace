import { z } from 'zod';
import type { Result } from '../result';
import { CandidateBasisSchema, EvidenceBasisSchema, VerificationStateSchema } from './enums';
import { CandidateCitationSchema, PersistedCitationSchema } from './citations';
import {
  LocalRefSchema,
  ClaimPayloadSchema, EntityPayloadSchema, EventPayloadSchema, RelationshipPayloadSchema,
  RequestPayloadSchema, ResponsePayloadSchema, FrictionPayloadSchema, DataCategoryPayloadSchema,
  ContradictionCandidatePayloadSchema, ContradictionPayloadSchema,
} from './payloads';

const CandidateBase = z.object({
  ref: LocalRefSchema.optional(),                            // batch-local label so one response can link its own items
  statement: z.string().min(1).max(1000),
  evidenceBasis: CandidateBasisSchema,
  candidateConfidence: z.number().min(0).max(1).optional(),  // the model's own number; never proof
  citations: z.array(CandidateCitationSchema).min(1).max(5),
}).strict();

const PersistedBase = z.object({
  id: z.string().uuid(), caseId: z.string().uuid(), displayId: z.string(),
  statement: z.string(), evidenceBasis: EvidenceBasisSchema,
  verificationState: VerificationStateSchema,
  sourceUnavailable: z.boolean(),
  candidateConfidence: z.number().min(0).max(1).optional(),
  humanConfirmedAt: z.string().datetime({ offset: true }).optional(),
  citations: z.array(PersistedCitationSchema),
}).strict();

// The nine variants are written out for each base (instead of the spec's generic `variants` helper)
// so that z.infer keeps precise types. Shape and strictness are identical to spec 10.4.
const CandidateUnion = z.discriminatedUnion('findingType', [
  CandidateBase.extend({ findingType: z.literal('CLAIM'),           structuredPayload: ClaimPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('ENTITY'),          structuredPayload: EntityPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('EVENT'),           structuredPayload: EventPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('RELATIONSHIP'),    structuredPayload: RelationshipPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('REQUEST'),         structuredPayload: RequestPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('RESPONSE'),        structuredPayload: ResponsePayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('FRICTION_SIGNAL'), structuredPayload: FrictionPayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('CONTRADICTION'),   structuredPayload: ContradictionCandidatePayloadSchema }),
  CandidateBase.extend({ findingType: z.literal('DATA_CATEGORY'),   structuredPayload: DataCategoryPayloadSchema }),
]);

// A CLAIM must be anchored in a quote: at least one citation carries quotedText.
export const CandidateFindingSchema = CandidateUnion.superRefine((c, ctx) => {
  if (c.findingType === 'CLAIM' && !c.citations.some(x => x.quotedText))
    ctx.addIssue({ code: 'custom', message: 'CLAIM requires a citation with quotedText' });
});

export const FindingSchema = z.discriminatedUnion('findingType', [
  PersistedBase.extend({ findingType: z.literal('CLAIM'),           structuredPayload: ClaimPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('ENTITY'),          structuredPayload: EntityPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('EVENT'),           structuredPayload: EventPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('RELATIONSHIP'),    structuredPayload: RelationshipPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('REQUEST'),         structuredPayload: RequestPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('RESPONSE'),        structuredPayload: ResponsePayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('FRICTION_SIGNAL'), structuredPayload: FrictionPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('CONTRADICTION'),   structuredPayload: ContradictionPayloadSchema }),
  PersistedBase.extend({ findingType: z.literal('DATA_CATEGORY'),   structuredPayload: DataCategoryPayloadSchema }),
]);

// The provider envelope is validated first; each candidate is then validated on its own (§11.1 step 8).
export const AnalysisEnvelopeSchema = z.object({ candidates: z.array(z.unknown()) }).strict();

export type Finding = z.infer<typeof FindingSchema>;
export type CandidateFinding = z.infer<typeof CandidateFindingSchema>;

const FINDING_TYPES: readonly string[] = [
  'CLAIM', 'ENTITY', 'EVENT', 'RELATIONSHIP', 'REQUEST',
  'RESPONSE', 'FRICTION_SIGNAL', 'CONTRADICTION', 'DATA_CATEGORY',
];

/** Never throws. UNKNOWN_TYPE when findingType is a string outside the nine values; otherwise SCHEMA. */
export function parseCandidate(raw: unknown): Result<CandidateFinding, 'SCHEMA' | 'UNKNOWN_TYPE'> {
  try {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const t = (raw as Record<string, unknown>).findingType;
      if (typeof t === 'string' && !FINDING_TYPES.includes(t)) {
        return { ok: false, reason: 'UNKNOWN_TYPE', detail: `findingType "${t.slice(0, 60)}" is not a known finding type` };
      }
    }
    const r = CandidateFindingSchema.safeParse(raw);
    if (r.success) return { ok: true, value: r.data };
    return { ok: false, reason: 'SCHEMA', detail: r.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 500) };
  } catch (e) {
    return { ok: false, reason: 'SCHEMA', detail: e instanceof Error ? e.message.slice(0, 500) : 'unexpected error' };
  }
}

/** Never throws. Returns the raw candidates array; each item is validated separately by parseCandidate. */
export function parseEnvelope(raw: unknown): Result<unknown[], 'ENVELOPE'> {
  try {
    const r = AnalysisEnvelopeSchema.safeParse(raw);
    if (r.success) return { ok: true, value: r.data.candidates };
    return { ok: false, reason: 'ENVELOPE', detail: r.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 500) };
  } catch (e) {
    return { ok: false, reason: 'ENVELOPE', detail: e instanceof Error ? e.message.slice(0, 500) : 'unexpected error' };
  }
}