import { z } from 'zod';
import { FindingDisplayIdSchema } from './payloads';

// What the model may produce. 'user_note' (or any other kind) is not in this union, so it fails validation:
// the restriction is enforced by schema, not by prompt wording.
export const AIHeadingBlockSchema = z.object({
  kind: z.literal('heading'), text: z.string().min(1).max(200),
}).strict();
export const AIAssertionBlockSchema = z.object({
  kind: z.literal('assertion'), text: z.string().min(1).max(1500),
  findingDisplayIds: z.array(FindingDisplayIdSchema).min(1),      // display IDs, never UUIDs
}).strict();
export const AIReportDraftSchema = z.object({
  blocks: z.array(z.discriminatedUnion('kind', [AIHeadingBlockSchema, AIAssertionBlockSchema])).min(1).max(60),
}).strict();

// What is persisted and edited (the Gateway assigns ids and resolves display IDs to UUIDs).
const BlockId = z.string().min(1).max(40);
export const HeadingBlockSchema = z.object({ kind: z.literal('heading'), id: BlockId, text: z.string() }).strict();
export const AssertionBlockSchema = z.object({
  kind: z.literal('assertion'), id: BlockId, text: z.string(),
  findingIds: z.array(z.string().uuid()).min(1),                  // grounded by construction
  origin: z.enum(['AI', 'USER']),                                 // set by the server
  editedAfterDraft: z.boolean(),                                  // set by the server when text differs from the AI draft
}).strict();
export const UserNoteBlockSchema = z.object({
  kind: z.literal('user_note'), id: BlockId, text: z.string(),
  authorId: z.string().uuid(),                                    // stamped by the server; only humans create these
}).strict();
export const ReportBlockSchema = z.discriminatedUnion('kind', [HeadingBlockSchema, AssertionBlockSchema, UserNoteBlockSchema]);

export const CaseReportContentSchema = z.object({
  lens: z.enum(['EVIDENCE', 'FINDINGS', 'COMPLAINT']),
  framework: z.string().optional(),                               // e.g. 'GDPR', 'CCPA'
  blocks: z.array(ReportBlockSchema),
});

export type AIReportDraft = z.infer<typeof AIReportDraftSchema>;
export type ReportBlock = z.infer<typeof ReportBlockSchema>;
export type CaseReportContent = z.infer<typeof CaseReportContentSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type AssertionBlock = z.infer<typeof AssertionBlockSchema>;
export type UserNoteBlock = z.infer<typeof UserNoteBlockSchema>;