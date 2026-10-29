import { z } from 'zod';

export const DispatchEmailInputSchema = z
  .object({
    recipientEmail: z.string().trim().max(254).email(),
    recipientName: z.string().trim().max(200).optional(),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => !/[\r\n]/.test(value), 'Subject must be a single line'),
    coverNote: z.string().max(2000).optional(),
    includeAuditSummary: z.boolean().default(true),
  })
  .strict();

export const DispatchEmailOutputSchema = z
  .object({
    dispatchId: z.string().uuid(),
    status: z.enum(['SENT', 'SIMULATED', 'FAILED']),
    dispatchedAt: z.string().datetime(),
    recipientEmail: z.string().email(),
    subject: z.string(),
    auditRowId: z.string().uuid(),
    mailtoUrl: z.string().optional(),
  })
  .strict();

export type DispatchEmailInput = z.infer<typeof DispatchEmailInputSchema>;
export type DispatchEmailOutput = z.infer<typeof DispatchEmailOutputSchema>;
