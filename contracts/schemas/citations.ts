import { z } from 'zod';
import { LocatorTypeSchema } from './locators';

// A. AI-facing candidate citation: what a model returns. Human-readable identifiers only.
export const CandidateCitationSchema = z.object({
  evidenceDisplayId: z.string().regex(/^EV-\d+$/),         // "EV-101"
  segmentOrdinal: z.number().int().min(1),                  // the number shown to the model next to each segment
  locatorType: LocatorTypeSchema,
  locator: z.record(z.string(), z.unknown()),               // echoed from the segment header; checked by the Gateway (§11.8)
  quotedText: z.string().min(1).max(2000).optional(),
}).strict();
export type CandidateCitation = z.infer<typeof CandidateCitationSchema>;

// B. Persisted citation: what the database stores and the API returns. UUID foreign keys.
export const PersistedCitationSchema = z.object({
  id: z.string().uuid(),
  findingId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceDisplayId: z.string(),                            // joined at read time, for the UI
  segmentId: z.string().uuid().nullable(),                  // null only if the segment was removed with its source
  segmentOrdinal: z.number().int().nullable(),
  locatorType: LocatorTypeSchema,
  locator: z.record(z.string(), z.unknown()),               // copied from the stored segment, never from the model
  quotedText: z.string().nullable(),
  validationStatus: z.enum(['PENDING', 'VALID', 'INVALID']),
});
export type PersistedCitation = z.infer<typeof PersistedCitationSchema>;
