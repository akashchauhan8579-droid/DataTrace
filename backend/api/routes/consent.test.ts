import { describe, it, expect, vi, beforeEach } from 'vitest';
import { route } from '../router';
import { analysisRoutes } from './analysis';

describe('AI Consent & Gated Analysis API (§15.2 Invariant)', () => {
  const testCaseId = 'c0000000-0000-4000-8000-000000000001';
  const ownerUserId = 'u0000000-0000-4000-8000-000000000001';
  const otherUserId = 'u0000000-0000-4000-8000-000000000002';

  // In-memory mock store for consent and cases
  let consentsStore: Array<{
    id: string;
    case_id: string;
    user_id: string;
    policy_version: string;
    provider: string;
    scope: any;
    granted_at: string;
    revoked_at: string | null;
  }> = [];

  let auditEvents: any[] = [];
  let tasksStore: any[] = [];
  let runsStore: any[] = [];

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1, val1) => ({
              eq: vi.fn().mockImplementation((col2, val2) => ({
                single: vi.fn().mockImplementation(async () => {
                  if (val1 === testCaseId && val2 === ownerUserId) {
                    return { data: { id: testCaseId, display_id: 'CASE-01', title: 'Test Case', owner_id: ownerUserId }, error: null };
                  }
                  return { data: null, error: { message: 'Not found' } };
                }),
              })),
            })),
          }),
        };
      }

      if (table === 'ai_consents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col, caseId) => ({
              is: vi.fn().mockImplementation((_col2, nullVal) => ({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockImplementation(async () => {
                      const active = consentsStore.find(
                        (c) => c.case_id === caseId && c.revoked_at === nullVal
                      );
                      return { data: active || null, error: null };
                    }),
                  }),
                }),
              })),
            })),
          }),
        };
      }

      if (table === 'evidence_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({
                data: [
                  { id: 'ev-1', display_id: 'EV-101', processing_status: 'PROCESSED', deleted_at: null },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      return {};
    }),
  } as any;

  const mockAdmin = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'ai_consents') {
        return {
          insert: vi.fn().mockImplementation((row: any) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const inserted = { id: 'consent-uuid-1', ...row };
                consentsStore.push(inserted);
                return { data: inserted, error: null };
              }),
            }),
          })),
          update: vi.fn().mockImplementation((patch: any) => ({
            eq: vi.fn().mockImplementation((_col, caseId) => ({
              is: vi.fn().mockImplementation(async () => {
                for (const c of consentsStore) {
                  if (c.case_id === caseId && c.revoked_at === null) {
                    Object.assign(c, patch);
                  }
                }
                return { error: null };
              }),
            })),
          })),
        };
      }

      if (table === 'audit_events') {
        return {
          insert: vi.fn().mockImplementation(async (event) => {
            auditEvents.push(event);
            return { error: null };
          }),
        };
      }

      if (table === 'analysis_runs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: runsStore,
                error: null,
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((row: any) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const run = { id: 'run-uuid-1', ...row };
                runsStore.push(run);
                return { data: run, error: null };
              }),
            }),
          })),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === 'analysis_tasks') {
        return {
          insert: vi.fn().mockImplementation((rows: any[]) => ({
            select: vi.fn().mockImplementation(async () => {
              const inserted = rows.map((r, i) => ({ id: `task-uuid-${i}`, ...r }));
              tasksStore.push(...inserted);
              return { data: inserted, error: null };
            }),
          })),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }

      return {};
    }),
  } as any;

  beforeEach(() => {
    consentsStore = [];
    auditEvents = [];
    tasksStore = [];
    runsStore = [];
  });

  it('GET /cases/:id/consent returns consented: false when no consent granted', async () => {
    const routeDef = analysisRoutes.find((r) => r.method === 'GET' && r.pattern === '/cases/:id/consent')!;
    const res = await routeDef.handler({
      user: { id: ownerUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req: new Request('http://localhost/api/cases/' + testCaseId + '/consent'),
    } as any);

    expect(res).toEqual({ consented: false });
  });

  it('POST /cases/:id/runs fails with 403 CONSENT_REQUIRED when AI consent has not been granted', async () => {
    const routeDef = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/runs')!;
    const req = new Request('http://localhost/api/cases/' + testCaseId + '/runs', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = (await routeDef.handler({
      user: { id: ownerUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req,
    } as any)) as Response;

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CONSENT_REQUIRED');
    expect(body.error.message).toContain('NO_CONSENT');
  });

  it('POST /cases/:id/consent grants consent and records audit event', async () => {
    const routeDef = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/consent')!;
    const res = (await routeDef.handler({
      user: { id: ownerUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req: new Request('http://localhost/api/cases/' + testCaseId + '/consent', { method: 'POST' }),
    } as any)) as any;

    expect(res.success).toBe(true);
    expect(res.consented).toBe(true);
    expect(res.policyVersion).toBe('1.0');

    expect(consentsStore).toHaveLength(1);
    expect(consentsStore[0].scope).toEqual({ mode: 'MINIMIZE' });

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].action).toBe('AI_CONSENT_GRANTED');
  });

  it('POST /cases/:id/runs succeeds and queues tasks after consent is granted', async () => {
    // Grant consent
    consentsStore.push({
      id: 'consent-1',
      case_id: testCaseId,
      user_id: ownerUserId,
      policy_version: '1.0',
      provider: 'mock',
      scope: { mode: 'MINIMIZE' },
      granted_at: new Date().toISOString(),
      revoked_at: null,
    });

    const routeDef = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/runs')!;
    const req = new Request('http://localhost/api/cases/' + testCaseId + '/runs', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = (await routeDef.handler({
      user: { id: ownerUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req,
    } as any)) as any;

    expect(res.runId).toBeDefined();
    expect(res.taskCount).toBeGreaterThan(0);
    expect(tasksStore.length).toBeGreaterThan(0);
    // Tasks are queued with minimization mode
    expect(tasksStore[0].minimization_metadata).toEqual({ mode: 'MINIMIZE', evidenceCount: 1 });
  });

  it('DELETE /cases/:id/consent revokes consent and records AI_CONSENT_REVOKED', async () => {
    // Active consent exists
    consentsStore.push({
      id: 'consent-1',
      case_id: testCaseId,
      user_id: ownerUserId,
      policy_version: '1.0',
      provider: 'mock',
      scope: { mode: 'MINIMIZE' },
      granted_at: new Date().toISOString(),
      revoked_at: null,
    });

    const routeDef = analysisRoutes.find((r) => r.method === 'DELETE' && r.pattern === '/cases/:id/consent')!;
    const res = (await routeDef.handler({
      user: { id: ownerUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req: new Request('http://localhost/api/cases/' + testCaseId + '/consent', { method: 'DELETE' }),
    } as any)) as any;

    expect(res.success).toBe(true);
    expect(res.consented).toBe(false);
    expect(res.revoked).toBe(true);
    expect(consentsStore[0].revoked_at).not.toBeNull();

    expect(auditEvents.some((e) => e.action === 'AI_CONSENT_REVOKED')).toBe(true);
  });

  it('assertCaseOwner blocks non-owners with 404 NOT_FOUND on consent endpoints', async () => {
    const routeDef = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/consent')!;
    const res = (await routeDef.handler({
      user: { id: otherUserId },
      db: mockDb,
      admin: mockAdmin,
      params: { id: testCaseId },
      req: new Request('http://localhost/api/cases/' + testCaseId + '/consent', { method: 'POST' }),
    } as any)) as Response;

    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
