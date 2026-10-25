import { describe, expect, it, vi } from 'vitest';
import { evidenceRoutes } from './evidence';
import type { RouteDef } from '../types';

const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const CASE_ID = 'c0000000-0000-4000-8000-000000000001';

function createContext(failure?: 'artifact' | 'segments' | 'audit') {
  const calls: string[] = [];
  const evidenceId = 'e0000000-0000-4000-8000-000000000001';
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: { id: CASE_ID }, error: null }),
          }),
        }),
      }),
    }),
  };
  const admin = {
    from: (table: string) => ({
      insert: (value: unknown) => {
        calls.push(`insert:${table}`);
        if (table === 'evidence_items') {
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: evidenceId,
                  case_id: CASE_ID,
                  display_id: 'EV-101',
                  source_type: 'DOCUMENT',
                  sha256: 'a'.repeat(64),
                  size_bytes: 16,
                  processing_status: 'PROCESSED',
                },
                error: null,
              }),
            }),
          };
        }
        if (table === 'evidence_artifacts') {
          return {
            select: () => ({
              single: async () => failure === 'artifact'
                ? { data: null, error: { message: 'artifact write failed' } }
                : { data: { id: 'artifact-001' }, error: null },
            }),
          };
        }
        if (table === 'evidence_segments') {
          expect(Array.isArray(value)).toBe(true);
          return Promise.resolve({
            error: failure === 'segments' ? { message: 'segment write failed' } : null,
          });
        }
        if (table === 'audit_events') {
          return Promise.resolve({
            error: failure === 'audit' ? { message: 'audit write failed' } : null,
          });
        }
        throw new Error(`Unexpected insert into ${table}`);
      },
      delete: () => ({
        eq: async () => {
          calls.push('delete:evidence_items');
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async () => {
          calls.push('upload');
          return { error: null };
        },
        remove: async () => {
          calls.push('remove');
          return { error: null };
        },
      }),
    },
  };
  const route = evidenceRoutes.find(
    (entry) => entry.method === 'POST' && entry.pattern === '/cases/:id/evidence'
  ) as RouteDef;
  return {
    calls,
    invoke: () => route.handler({
      user: { id: USER_ID, accessToken: 'test-token' },
      db: db as never,
      admin: admin as never,
      params: { id: CASE_ID },
      req: new Request('http://localhost/api/cases/case/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'DOCUMENT',
          filename: 'evidence.txt',
          mimeType: 'text/plain',
          content: 'This is synthetic evidence text for segmentation.',
          isBase64: false,
        }),
      }),
    }),
  };
}

describe('Evidence upload persistence', () => {
  it.each(['artifact', 'segments', 'audit'] as const)(
    'rejects failed %s writes and removes partial database and storage records',
    async (failure) => {
      const context = createContext(failure);

      await expect(context.invoke()).rejects.toThrow(/failed/i);

      expect(context.calls).toContain('delete:evidence_items');
      expect(context.calls).toContain('remove');
    }
  );

  it('persists segments as one batch and reports success only after the audit write', async () => {
    const context = createContext();

    const result = await context.invoke();

    expect(result).toEqual(expect.objectContaining({
      displayId: 'EV-101',
    }));
    expect(context.calls.indexOf('insert:evidence_segments')).toBeLessThan(
      context.calls.indexOf('insert:audit_events')
    );
  });
});
