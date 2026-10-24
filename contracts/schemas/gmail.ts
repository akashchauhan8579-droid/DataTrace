import { z } from 'zod';

export const IngestSourceSchema = z.enum(['UPLOAD', 'GMAIL_IMPORT']);
export type IngestSource = z.infer<typeof IngestSourceSchema>;

export const GmailIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const GmailStatusSchema = z.object({
  connected: z.boolean(),
  googleEmail: z.string().email().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED']).optional(),
}).strict();
export type GmailStatus = z.infer<typeof GmailStatusSchema>;

export const GmailCallbackRequestSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(1024),
}).strict();
export type GmailCallbackRequest = z.infer<typeof GmailCallbackRequestSchema>;

export const GmailThreadSummarySchema = z.object({
  threadId: GmailIdSchema,
  subject: z.string().max(300),
  from: z.string().max(300),
  snippet: z.string().max(300),
  messageCount: z.number().int().min(1),
  lastMessageAt: z.string().datetime(),
}).strict();
export type GmailThreadSummary = z.infer<typeof GmailThreadSummarySchema>;

export const GmailThreadListSchema = z.object({
  threads: z.array(GmailThreadSummarySchema).max(10),
  nextPageToken: z.string().max(512).optional(),
}).strict();
export type GmailThreadList = z.infer<typeof GmailThreadListSchema>;

export const GmailImportRequestSchema = z.object({
  threadId: GmailIdSchema,
}).strict();
export type GmailImportRequest = z.infer<typeof GmailImportRequestSchema>;

export const GmailImportResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      displayId: z.string(),
      sha256: z.string().length(64),
      duplicate: z.boolean(),
    }).strict()
  ),
  truncated: z.boolean(),
}).strict();
export type GmailImportResult = z.infer<typeof GmailImportResultSchema>;
