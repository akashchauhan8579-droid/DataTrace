import { describe, it, expect, vi } from 'vitest';
import { buildAccountExport } from './exportBuilder';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('buildAccountExport (Spec v1.5.0 D5)', () => {
  const userId = '11111111-1111-4111-a111-111111111111';
  const caseId = '22222222-2222-4222-a222-222222222222';
  const evidenceId = '33333333-3333-4333-a333-333333333333';
  const artifactId = '44444444-4444-4444-a444-444444444444';
  const segmentId = '55555555-5555-4555-a555-555555555555';
  const findingId = '66666666-6666-4666-a666-666666666666';
  const citationId = '77777777-7777-4777-a777-777777777777';
  const reportId = '88888888-8888-4888-a888-888888888888';

  function createMockSupabase(overrides: Record<string, unknown> = {}) {
    const tableData: Record<string, unknown> = {
      cases: [
        {
          id: caseId,
          owner_id: userId,
          display_id: 'CASE-101',
          title: 'Acme GDPR Deletion Inquiry',
          description: 'Right to erasure audit',
          status: 'ACTIVE',
          created_at: '2026-10-10T00:00:00.000Z',
          updated_at: '2026-10-10T01:00:00.000Z',
        },
      ],
      evidence_items: [
        {
          id: evidenceId,
          case_id: caseId,
          display_id: 'EV-101',
          original_filename: 'notice.eml',
          sha256: 'a'.repeat(64),
          size_bytes: 4096,
          mime_type: 'message/rfc822',
          source_type: 'EMAIL',
          ingest_source: 'GMAIL_IMPORT',
          external_ref: 'gmail_msg_001',
          captured_at: '2026-10-09T10:00:00.000Z',
          uploaded_at: '2026-10-10T00:05:00.000Z',
          processing_status: 'PROCESSED',
          deleted_at: null,
        },
      ],
      evidence_segments: [
        {
          id: segmentId,
          evidence_id: evidenceId,
          artifact_id: artifactId,
          ordinal: 1,
          locator_type: 'LINE_NUMBER',
          locator: { line: 15 },
          segment_text: 'All personal data has been erased.',
          created_at: '2026-10-10T00:06:00.000Z',
        },
      ],
      findings: [
        {
          id: findingId,
          case_id: caseId,
          display_id: 'FND-201',
          finding_type: 'CLAIM',
          statement: 'Acme acknowledges complete data erasure',
          structured_payload: {
            normalizedClaim: {
              subject: 'Acme',
              predicate: 'erased',
              object: 'data',
              polarity: 'AFFIRMS',
            },
          },
          evidence_basis: 'DIRECT',
          verification_state: 'VERIFIED',
          candidate_confidence: 0.98,
          source_unavailable: false,
          created_at: '2026-10-10T00:10:00.000Z',
          updated_at: '2026-10-10T00:15:00.000Z',
        },
      ],
      citations: [
        {
          id: citationId,
          case_id: caseId,
          finding_id: findingId,
          evidence_id: evidenceId,
          segment_id: segmentId,
          exact_quote: 'All personal data has been erased.',
          created_source: 'AI_EXTRACTOR',
          created_at: '2026-10-10T00:10:00.000Z',
        },
      ],
      case_reports: [
        {
          id: reportId,
          case_id: caseId,
          framework: 'GDPR',
          lens: 'ARTICLE_17',
          version: 1,
          title: 'Article 17 Erasure Report',
          content: { summary: 'Erasure verified' },
          validation_state: 'VALID',
          created_at: '2026-10-10T00:20:00.000Z',
          updated_at: '2026-10-10T00:25:00.000Z',
        },
      ],
      audit_events: [
        {
          case_seq: 1,
          row_hash: 'c'.repeat(64),
          prev_hash: '0'.repeat(64),
          actor_type: 'USER',
          actor_id: userId,
          entity_type: 'CASE',
          entity_id: caseId,
          action: 'CASE_CREATED',
          occurred_at: '2026-10-10T00:00:00.000Z',
          metadata: { note: 'Initial creation' },
        },
      ],
      gmail_connections: {
        google_email: 'investigator@acme.corp',
        status: 'ACTIVE',
      },
      ...overrides,
    };

    const mockAdmin = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: userId,
                email: 'user@acme.corp',
                created_at: '2026-10-01T00:00:00.000Z',
              },
            },
          }),
        },
      },
      from: vi.fn().mockImplementation((tableName: string) => {
        const queryBuilder: Record<string, unknown> = {};

        queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
        queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder);
        queryBuilder.in = vi.fn().mockReturnValue(queryBuilder);
        queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
        queryBuilder.maybeSingle = vi.fn().mockImplementation(async () => {
          return { data: tableData[tableName] ?? null, error: null };
        });

        queryBuilder.then = (
          onfulfilled: (res: { data: unknown; error: unknown }) => unknown
        ) => {
          const data = tableData[tableName] ?? [];
          return Promise.resolve(onfulfilled({ data, error: null }));
        };

        return queryBuilder;
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [{ intact: true, first_broken_case_seq: null }],
        error: null,
      }),
    } as unknown as SupabaseClient;

    return mockAdmin;
  }

  it('builds a complete, valid AccountExport JSON with no secrets', async () => {
    const mockClient = createMockSupabase();
    const result = await buildAccountExport(userId, mockClient);

    expect(result.specVersion).toBe('1.5.0');
    expect(result.profile.id).toBe(userId);
    expect(result.profile.email).toBe('user@acme.corp');

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].displayId).toBe('CASE-101');

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].displayId).toBe('EV-101');
    expect(result.evidence[0].sha256).toBe('a'.repeat(64));
    expect((result.evidence[0] as unknown as { storage_path?: string }).storage_path).toBeUndefined();

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].segmentText).toBe('All personal data has been erased.');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].displayId).toBe('FND-201');

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].exactQuote).toBe('All personal data has been erased.');

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].framework).toBe('GDPR');

    expect(result.audit).toHaveLength(1);
    expect(result.audit[0].chainHeadHash).toBe('c'.repeat(64));
    expect(result.audit[0].chainIntact).toBe(true);

    expect(result.gmail.connected).toBe(true);
    expect(result.gmail.googleEmail).toBe('investigator@acme.corp');
    expect((result.gmail as unknown as { refresh_token_enc?: string }).refresh_token_enc).toBeUndefined();
  });

  it('handles empty account state (0 cases, no Gmail) safely', async () => {
    const mockClient = createMockSupabase({
      cases: [],
      evidence_items: [],
      evidence_segments: [],
      findings: [],
      citations: [],
      case_reports: [],
      audit_events: [],
      gmail_connections: null,
    });

    const result = await buildAccountExport(userId, mockClient);

    expect(result.specVersion).toBe('1.5.0');
    expect(result.profile.id).toBe(userId);
    expect(result.cases).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.segments).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(result.reports).toEqual([]);
    expect(result.audit).toEqual([]);
    expect(result.gmail.connected).toBe(false);
    expect(result.gmail.googleEmail).toBeNull();
  });

  it('fails if database query for cases encounters an error', async () => {
    const mockClient = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
        },
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(buildAccountExport(userId, mockClient)).rejects.toThrow(
      'Failed to fetch cases for account export: Database connection failed'
    );
  });
});
