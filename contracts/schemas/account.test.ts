import { describe, it, expect } from 'vitest';
import {
  AccountDeletionStateSchema,
  DeletionRequestBodySchema,
  DeletionStatusSchema,
  AccountExportSchema,
  CONFIRMATION_PHRASE,
  ACCOUNT_ERROR_CODES,
  type AccountExport,
} from './account';

describe('Account & Deletion Contracts (Spec v1.5.0)', () => {
  describe('AccountDeletionStateSchema', () => {
    it('accepts all 6 states in the D2 state machine', () => {
      const validStates = [
        'REQUESTED',
        'STORAGE_PURGED',
        'GMAIL_REVOKED',
        'DB_PURGED',
        'AUTH_DELETED',
        'COMPLETE',
      ];

      for (const s of validStates) {
        expect(AccountDeletionStateSchema.safeParse(s).success).toBe(true);
      }
    });

    it('rejects invalid or lowercase states', () => {
      expect(AccountDeletionStateSchema.safeParse('requested').success).toBe(false);
      expect(AccountDeletionStateSchema.safeParse('PENDING').success).toBe(false);
      expect(AccountDeletionStateSchema.safeParse('FAILED').success).toBe(false);
      expect(AccountDeletionStateSchema.safeParse('').success).toBe(false);
      expect(AccountDeletionStateSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('DeletionRequestBodySchema', () => {
    it('accepts valid deletion request body', () => {
      const result = DeletionRequestBodySchema.safeParse({
        password: 'secure-password-123',
        confirmationPhrase: CONFIRMATION_PHRASE,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty password or missing confirmation phrase', () => {
      expect(
        DeletionRequestBodySchema.safeParse({
          password: '',
          confirmationPhrase: CONFIRMATION_PHRASE,
        }).success
      ).toBe(false);

      expect(
        DeletionRequestBodySchema.safeParse({
          password: 'secure-password',
          confirmationPhrase: '',
        }).success
      ).toBe(false);
    });

    it('rejects unknown properties strictly', () => {
      expect(
        DeletionRequestBodySchema.safeParse({
          password: 'secure-password',
          confirmationPhrase: CONFIRMATION_PHRASE,
          extraField: 'should-fail',
        }).success
      ).toBe(false);
    });
  });

  describe('DeletionStatusSchema', () => {
    const validStatus = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      userId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      state: 'STORAGE_PURGED',
      subjectHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      attempts: 1,
      lastError: null,
      counts: { cases: 2, evidence_items: 5 },
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:01:00.000Z',
      completedAt: null,
    };

    it('accepts valid deletion status', () => {
      const result = DeletionStatusSchema.safeParse(validStatus);
      expect(result.success).toBe(true);
    });

    it('accepts status with nulled userId upon COMPLETE', () => {
      const completed = {
        ...validStatus,
        userId: null,
        state: 'COMPLETE',
        completedAt: '2026-10-30T00:02:00.000Z',
      };
      expect(DeletionStatusSchema.safeParse(completed).success).toBe(true);
    });

    it('rejects negative attempt count', () => {
      expect(
        DeletionStatusSchema.safeParse({
          ...validStatus,
          attempts: -1,
        }).success
      ).toBe(false);
    });

    it('rejects unknown properties strictly', () => {
      expect(
        DeletionStatusSchema.safeParse({
          ...validStatus,
          unexpected: 123,
        }).success
      ).toBe(false);
    });
  });

  describe('AccountExportSchema (D5)', () => {
    const validExport: AccountExport = {
      exportedAt: '2026-10-30T00:00:00.000Z',
      specVersion: '1.5.0',
      profile: {
        id: '11111111-1111-4111-a111-111111111111',
        email: 'user@example.com',
        createdAt: '2026-10-01T12:00:00.000Z',
      },
      cases: [
        {
          id: '22222222-2222-4222-a222-222222222222',
          displayId: 'CASE-101',
          title: 'Acme Data Deletion Inquiry',
          description: 'GDPR verification case',
          status: 'ACTIVE',
          createdAt: '2026-10-10T10:00:00.000Z',
          updatedAt: '2026-10-10T11:00:00.000Z',
        },
      ],
      evidence: [
        {
          id: '33333333-3333-4333-a333-333333333333',
          caseId: '22222222-2222-4222-a222-222222222222',
          displayId: 'EV-101',
          originalFilename: 'email-thread.eml',
          sha256: 'a'.repeat(64),
          sizeBytes: 15420,
          mimeType: 'message/rfc822',
          sourceType: 'EMAIL',
          ingestSource: 'GMAIL_IMPORT',
          externalRef: 'msg-abc-123',
          capturedAt: '2026-10-09T08:00:00.000Z',
          uploadedAt: '2026-10-10T10:05:00.000Z',
          processingStatus: 'PROCESSED',
          deletedAt: null,
        },
      ],
      segments: [
        {
          id: '44444444-4444-4444-a444-444444444444',
          evidenceId: '33333333-3333-4333-a333-333333333333',
          artifactId: '55555555-5555-4555-a555-555555555555',
          ordinal: 1,
          locatorType: 'LINE_NUMBER',
          locator: { line: 12 },
          segmentText: 'We confirm your personal data was deleted from all production systems.',
          createdAt: '2026-10-10T10:06:00.000Z',
        },
      ],
      findings: [
        {
          id: '66666666-6666-4666-a666-666666666666',
          caseId: '22222222-2222-4222-a222-222222222222',
          displayId: 'FND-201',
          findingType: 'CLAIM',
          statement: 'Acme claims erasure was executed on 9 Oct 2026',
          structuredPayload: {
            normalizedClaim: {
              subject: 'Acme Corp',
              predicate: 'erased',
              object: 'user personal data',
              polarity: 'AFFIRMS',
            },
          },
          evidenceBasis: 'DIRECT',
          verificationState: 'VERIFIED',
          candidateConfidence: 0.95,
          sourceUnavailable: false,
          createdAt: '2026-10-10T10:10:00.000Z',
          updatedAt: '2026-10-10T10:15:00.000Z',
        },
      ],
      citations: [
        {
          id: '77777777-7777-4777-a777-777777777777',
          caseId: '22222222-2222-4222-a222-222222222222',
          findingId: '66666666-6666-4666-a666-666666666666',
          evidenceId: '33333333-3333-4333-a333-333333333333',
          segmentId: '44444444-4444-4444-a444-444444444444',
          exactQuote: 'We confirm your personal data was deleted',
          createdSource: 'AI_EXTRACTOR',
          createdAt: '2026-10-10T10:10:00.000Z',
        },
      ],
      reports: [
        {
          id: '88888888-8888-4888-a888-888888888888',
          caseId: '22222222-2222-4222-a222-222222222222',
          framework: 'GDPR',
          lens: 'ARTICLE_17',
          version: 1,
          title: 'GDPR Art. 17 Compliance Assessment',
          content: { summary: 'Erasure verified against incoming notices' },
          validationState: 'VALID',
          createdAt: '2026-10-10T10:30:00.000Z',
          updatedAt: '2026-10-10T10:35:00.000Z',
        },
      ],
      audit: [
        {
          caseId: '22222222-2222-4222-a222-222222222222',
          chainHeadHash: 'b'.repeat(64),
          chainIntact: true,
          events: [
            {
              caseSeq: 1,
              rowHash: 'b'.repeat(64),
              prevHash: '0'.repeat(64),
              actorType: 'USER',
              actorId: '11111111-1111-4111-a111-111111111111',
              entityType: 'CASE',
              entityId: '22222222-2222-4222-a222-222222222222',
              action: 'CASE_CREATED',
              occurredAt: '2026-10-10T10:00:00.000Z',
              metadata: { title: 'Acme Data Deletion Inquiry' },
            },
          ],
        },
      ],
      gmail: {
        connected: true,
        googleEmail: 'user@example.com',
        status: 'ACTIVE',
      },
    };

    it('accepts complete valid account export', () => {
      const result = AccountExportSchema.safeParse(validExport);
      expect(result.success).toBe(true);
    });

    it('rejects export with wrong spec version', () => {
      expect(
        AccountExportSchema.safeParse({
          ...validExport,
          specVersion: '1.4.2',
        }).success
      ).toBe(false);
    });

    it('rejects evidence with invalid sha256 length', () => {
      const invalidSha = {
        ...validExport,
        evidence: [
          {
            ...validExport.evidence[0],
            sha256: 'too-short',
          },
        ],
      };
      expect(AccountExportSchema.safeParse(invalidSha).success).toBe(false);
    });

    it('rejects tokens or secrets if leaked into export', () => {
      const leakedGmail = {
        ...validExport,
        gmail: {
          ...validExport.gmail,
          refreshToken: 'secret-token-that-must-never-be-exported',
        },
      };
      expect(AccountExportSchema.safeParse(leakedGmail).success).toBe(false);
    });
  });

  describe('ACCOUNT_ERROR_CODES', () => {
    it('defines the 3 v1.5.0 error codes', () => {
      expect(ACCOUNT_ERROR_CODES.ACCOUNT_DELETION_PENDING).toBe('ACCOUNT_DELETION_PENDING');
      expect(ACCOUNT_ERROR_CODES.CONFIRMATION_MISMATCH).toBe('CONFIRMATION_MISMATCH');
      expect(ACCOUNT_ERROR_CODES.REAUTH_FAILED).toBe('REAUTH_FAILED');
    });
  });
});
