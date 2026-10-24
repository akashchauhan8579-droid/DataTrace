import { z } from 'zod';

// Locators. PAGE is the P0 PDF locator; PAGE_PARAGRAPH is P1.
export const LocatorTypeSchema = z.enum(['PAGE', 'PAGE_PARAGRAPH', 'CHAR_RANGE', 'LINE_NUMBER', 'TIMESTAMP']);
export type LocatorType = z.infer<typeof LocatorTypeSchema>;

export const LocatorSchema = z.discriminatedUnion('locatorType', [
  z.object({ locatorType: z.literal('PAGE'),
             locator: z.object({ page: z.number().int().min(1) }).strict() }),
  z.object({ locatorType: z.literal('PAGE_PARAGRAPH'),
             locator: z.object({ page: z.number().int().min(1), paragraph: z.number().int().min(1) }).strict() }),
  z.object({ locatorType: z.literal('CHAR_RANGE'),
             locator: z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).strict()
                        .refine(l => l.end > l.start) }),
  z.object({ locatorType: z.literal('LINE_NUMBER'),
             locator: z.object({ line: z.number().int().min(1), endLine: z.number().int().min(1).optional() }).strict() }),
  z.object({ locatorType: z.literal('TIMESTAMP'),
             locator: z.object({ startSeconds: z.number().min(0), endSeconds: z.number().min(0) }).strict() }),
]);
export type Locator = z.infer<typeof LocatorSchema>;
