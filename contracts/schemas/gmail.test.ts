import { describe, it, expect } from 'vitest';
import {
  IngestSourceSchema,
  GmailIdSchema,
  GmailStatusSchema,
  GmailCallbackRequestSchema,
  GmailThreadSummarySchema,
  GmailThreadListSchema,
  GmailImportRequestSchema,
  GmailImportResultSchema,
} from './gmail';

describe('Gmail contracts and schemas', () => {
  describe('IngestSourceSchema', () => {
    it('accepts UPLOAD and GMAIL_IMPORT', () => {
      expect(IngestSourceSchema.safeParse('UPLOAD').success).toBe(true);
      expect(IngestSourceSchema.safeParse('GMAIL_IMPORT').success).toBe(true);
    });

    it('rejects invalid sources', () => {
      expect(IngestSourceSchema.safeParse('IMAP').success).toBe(false);
      expect(IngestSourceSchema.safeParse('upload').success).toBe(false);
      expect(IngestSourceSchema.safeParse('').success).toBe(false);
      expect(IngestSourceSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('GmailIdSchema', () => {
    it('accepts valid Gmail thread and message IDs', () => {
      expect(GmailIdSchema.safeParse('18e0012ab34cd56e').success).toBe(true);
      expect(GmailIdSchema.safeParse('abc_123-XYZ').success).toBe(true);
      expect(GmailIdSchema.safeParse('a'.repeat(64)).success).toBe(true);
    });

    it('rejects empty strings and strings exceeding 64 chars', () => {
      expect(GmailIdSchema.safeParse('').success).toBe(false);
      expect(GmailIdSchema.safeParse('a'.repeat(65)).success).toBe(false);
    });

    it('rejects IDs with invalid characters', () => {
      expect(GmailIdSchema.safeParse('msg 123').success).toBe(false);
      expect(GmailIdSchema.safeParse('msg/123').success).toBe(false);
      expect(GmailIdSchema.safeParse('msg:123').success).toBe(false);
      expect(GmailIdSchema.safeParse('msg?id=1').success).toBe(false);
      expect(GmailIdSchema.safeParse('msg@domain').success).toBe(false);
      expect(GmailIdSchema.safeParse('msg#header').success).toBe(false);
    });
  });

  describe('Strict unknown-key rejection', () => {
    it('rejects unknown keys in GmailStatusSchema', () => {
      expect(
        GmailStatusSchema.safeParse({
          connected: false,
          unknownKey: 'rejected',
        }).success
      ).toBe(false);

      expect(
        GmailStatusSchema.safeParse({
          connected: true,
          googleEmail: 'test@example.com',
          status: 'ACTIVE',
          refreshToken: 'secret',
        }).success
      ).toBe(false);
    });

    it('rejects unknown keys in GmailCallbackRequestSchema', () => {
      expect(
        GmailCallbackRequestSchema.safeParse({
          code: 'valid-auth-code',
          state: 'valid-state',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        }).success
      ).toBe(false);
    });

    it('rejects unknown keys in GmailThreadSummarySchema', () => {
      expect(
        GmailThreadSummarySchema.safeParse({
          threadId: '18e0012ab34cd56e',
          subject: 'Confidential Report',
          from: 'sender@example.com',
          snippet: 'Please find attached...',
          messageCount: 2,
          lastMessageAt: new Date().toISOString(),
          rawContent: 'leaked bytes',
        }).success
      ).toBe(false);
    });

    it('rejects unknown keys in GmailThreadListSchema', () => {
      expect(
        GmailThreadListSchema.safeParse({
          threads: [],
          extraMeta: true,
        }).success
      ).toBe(false);
    });

    it('rejects unknown keys in GmailImportRequestSchema', () => {
      expect(
        GmailImportRequestSchema.safeParse({
          threadId: '18e0012ab34cd56e',
          caseId: '11111111-1111-1111-1111-111111111111',
        }).success
      ).toBe(false);
    });

    it('rejects unknown keys in GmailImportResultSchema and never accepts external_ref in items', () => {
      const validItem = {
        id: '11111111-1111-1111-1111-111111111111',
        displayId: 'EV-001',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        duplicate: false,
      };

      expect(
        GmailImportResultSchema.safeParse({
          items: [validItem],
          truncated: false,
          unexpected: true,
        }).success
      ).toBe(false);

      // Crucial security contract: external_ref MUST NOT be accepted in evidence output
      expect(
        GmailImportResultSchema.safeParse({
          items: [
            {
              ...validItem,
              external_ref: '18e0012ab34cd56e',
            },
          ],
          truncated: false,
        }).success
      ).toBe(false);
    });
  });

  describe('Page-size limits on GmailThreadListSchema', () => {
    const makeSummary = (id: string) => ({
      threadId: id,
      subject: 'Subject',
      from: 'sender@test.com',
      snippet: 'Snippet',
      messageCount: 1,
      lastMessageAt: '2026-10-25T00:00:00.000Z',
    });

    it('accepts 0 to 10 threads', () => {
      const tenThreads = Array.from({ length: 10 }, (_, i) => makeSummary(`id${i}`));
      expect(GmailThreadListSchema.safeParse({ threads: tenThreads }).success).toBe(true);

      const emptyList = { threads: [] };
      expect(GmailThreadListSchema.safeParse(emptyList).success).toBe(true);
    });

    it('rejects thread lists with more than 10 threads', () => {
      const elevenThreads = Array.from({ length: 11 }, (_, i) => makeSummary(`id${i}`));
      const result = GmailThreadListSchema.safeParse({ threads: elevenThreads });
      expect(result.success).toBe(false);
    });
  });

  describe('Result shape validation', () => {
    const validItem = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      displayId: 'EV-GMAIL-01',
      sha256: 'a'.repeat(64),
      duplicate: false,
    };

    it('accepts valid result structure', () => {
      const valid = {
        items: [validItem, { ...validItem, id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', duplicate: true }],
        truncated: false,
      };
      expect(GmailImportResultSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects non-uuid id', () => {
      const invalid = {
        items: [{ ...validItem, id: 'not-a-uuid' }],
        truncated: false,
      };
      expect(GmailImportResultSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects sha256 that is not exactly 64 characters', () => {
      const tooShort = {
        items: [{ ...validItem, sha256: 'a'.repeat(63) }],
        truncated: false,
      };
      const tooLong = {
        items: [{ ...validItem, sha256: 'a'.repeat(65) }],
        truncated: false,
      };
      expect(GmailImportResultSchema.safeParse(tooShort).success).toBe(false);
      expect(GmailImportResultSchema.safeParse(tooLong).success).toBe(false);
    });

    it('rejects missing duplicate flag or truncated flag', () => {
      const { duplicate, ...missingDuplicate } = validItem;
      expect(
        GmailImportResultSchema.safeParse({
          items: [missingDuplicate],
          truncated: false,
        }).success
      ).toBe(false);

      expect(
        GmailImportResultSchema.safeParse({
          items: [validItem],
        }).success
      ).toBe(false);
    });
  });

  describe('GmailCallbackRequestSchema length constraints', () => {
    it('accepts valid code and state', () => {
      expect(
        GmailCallbackRequestSchema.safeParse({
          code: 'auth_code_123',
          state: 'state_nonce_signature',
        }).success
      ).toBe(true);
    });

    it('enforces min and max lengths', () => {
      expect(GmailCallbackRequestSchema.safeParse({ code: '', state: 's' }).success).toBe(false);
      expect(GmailCallbackRequestSchema.safeParse({ code: 'c', state: '' }).success).toBe(false);
      expect(GmailCallbackRequestSchema.safeParse({ code: 'c'.repeat(2049), state: 's' }).success).toBe(false);
      expect(GmailCallbackRequestSchema.safeParse({ code: 'c', state: 's'.repeat(1025) }).success).toBe(false);
    });
  });
});
