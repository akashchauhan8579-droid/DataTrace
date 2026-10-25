import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailImportRequestSchema } from '../../../contracts/schemas/gmail';
import { parseEmail } from '../../ingestion';
import { encryptToken } from '../../integrations/tokenVault';
import * as gmailIntegration from '../../integrations/gmail';
import { GmailClientError } from '../../integrations/gmail';
import { gmailRoutes } from './gmail';

const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const CASE_ID = 'c0000000-0000-4000-8000-000000000001';
const IMPORT_PATH = '/cases/:id/evidence/gmail';

beforeEach(() => {
  vi.stubEnv('GMAIL_STATE_SECRET', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('GMAIL_TOKEN_ENC_KEY', Buffer.alloc(32, 2).toString('base64'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function makeContext(options: {
  ownsCase?: boolean;
  connected?: boolean;
  failArtifactInsert?: boolean;
} = {}) {
  const evidence = new Map<string, Record<string, unknown>>();
  const insertedItems: Record<string, unknown>[] = [];
  const insertedSegments: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];
  const storedPaths: string[] = [];
  const removedPaths: string[] = [];
  let artifactId = 0;
  let connectionDeleted = false;

  const connection = {
    status: 'ACTIVE',
    refresh_token_enc: encryptToken('mock-refresh-token'),
  };

  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => options.ownsCase === false
              ? { data: null, error: { message: 'not found' } }
              : { data: { id: CASE_ID, owner_id: USER_ID }, error: null },
          }),
        }),
      }),
    }),
  };

  const admin = {
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return query;
          },
          maybeSingle: async () => {
            if (table === 'gmail_connections') {
              return { data: options.connected === false ? null : connection, error: null };
            }
            if (table === 'evidence_items') {
              const row = Array.from(evidence.values()).find(
                item => item.case_id === filters.case_id && item.external_ref === filters.external_ref
              );
              return { data: row ?? null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
      insert: (value: Record<string, unknown>) => {
        if (table === 'evidence_items') {
          insertedItems.push(value);
          return {
            select: () => ({
              single: async () => {
                const row = {
                  ...value,
                  display_id: `E-${evidence.size + 1}`,
                  sha256: value.sha256,
                };
                evidence.set(String(value.external_ref), row);
                return { data: row, error: null };
              },
            }),
          };
        }
        if (table === 'evidence_artifacts') {
          return {
            select: () => ({
              single: async () => options.failArtifactInsert
                ? { data: null, error: { message: 'artifact write failed' } }
                : { data: { ...value, id: `artifact-${++artifactId}` }, error: null },
            }),
          };
        }
        if (table === 'audit_events') auditEvents.push(value);
        if (table === 'evidence_segments') insertedSegments.push(value);
        return Promise.resolve({ error: null });
      },
      upsert: async () => ({ error: null }),
      delete: () => ({
        eq: async (_column: string, id: string) => {
          if (table === 'gmail_connections' && id === USER_ID) connectionDeleted = true;
          if (table === 'evidence_items') {
            for (const [externalRef, row] of evidence) {
              if (row.id === id) evidence.delete(externalRef);
            }
          }
          return { error: null };
        },
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          storedPaths.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          removedPaths.push(...paths);
          return { error: null };
        },
      }),
    },
  };

  return {
    context: {
      req: new Request('http://localhost/api/cases/test/evidence/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: 'th_acme_erasure_01' }),
      }),
      params: { id: CASE_ID },
      user: { id: USER_ID, accessToken: 'test-token' },
      db,
      admin,
    },
    evidence,
    insertedItems,
    insertedSegments,
    auditEvents,
    storedPaths,
    removedPaths,
    connectionDeleted: () => connectionDeleted,
  };
}

async function invokeImport(context: ReturnType<typeof makeContext>['context']) {
  const importRoute = gmailRoutes.find(route => route.pattern === IMPORT_PATH);
  if (!importRoute) throw new Error('Gmail import route is not registered');
  return importRoute.handler(context as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('validates signed state before exchanging the OAuth code', async () => {
  const context = makeContext();
  context.context.req = new Request('http://localhost/api/gmail/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'synthetic-code', state: 'invalid-state' }),
  });
  const getClient = vi.spyOn(gmailIntegration, 'getGmailClient');
  const callbackRoute = gmailRoutes.find(route => route.pattern === '/gmail/callback');
  if (!callbackRoute) throw new Error('Gmail callback route is not registered');

  const response = await callbackRoute.handler(context.context as never) as Response;
  expect(response.status).toBe(400);
  expect(((await response.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
  expect(getClient).not.toHaveBeenCalled();
});

it('treats an invalid OAuth code as a failed connection attempt, not an expired connection', async () => {
  const context = makeContext();
  context.context.req = new Request('http://localhost/api/gmail/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'invalid-code',
      state: gmailIntegration.createSignedState(USER_ID),
    }),
  });
  const client = new gmailIntegration.MockGmailClient();
  vi.spyOn(client, 'exchangeCode').mockRejectedValue(new GmailClientError('AUTH_CODE_INVALID'));
  vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(client);
  const callbackRoute = gmailRoutes.find(route => route.pattern === '/gmail/callback');
  if (!callbackRoute) throw new Error('Gmail callback route is not registered');

  const response = await callbackRoute.handler(context.context as never) as Response;
  expect(response.status).toBe(400);
  expect(((await response.json()) as { error: { code: string } }).error.code)
    .toBe('GMAIL_AUTH_FAILED');
});

describe('Gmail import route', () => {
  it('rejects unknown import options so clients cannot override the server cap', () => {
    expect(GmailImportRequestSchema.safeParse({
      threadId: 'th_acme_erasure_01',
      maxMessages: 100,
    }).success).toBe(false);
  });

  it('imports ordinary email evidence, caps at ten, and returns existing rows as duplicates', async () => {
    const context = makeContext();
    const client = new gmailIntegration.MockGmailClient();
    const getAccessToken = vi.spyOn(client, 'refreshAccessToken');
    const getRawMessage = vi.spyOn(client, 'getRawMessage');
    vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(client);

    const result = await invokeImport(context.context) as {
      items: Array<{ duplicate: boolean; sha256: string }>;
      truncated: boolean;
    };

    expect(getAccessToken).toHaveBeenCalledWith('mock-refresh-token');
    expect(getRawMessage).toHaveBeenCalledWith('mock-gmail-access-token', 'msg_acme_001');
    expect(result.items).toHaveLength(3);
    expect(result.items.every(item => !item.duplicate)).toBe(true);
    expect(result.truncated).toBe(false);
    expect(context.insertedItems).toHaveLength(3);
    expect(context.auditEvents).toHaveLength(3);
    expect(context.auditEvents[0].metadata).toEqual(expect.objectContaining({
      ingestSource: 'GMAIL_IMPORT',
    }));
    expect(context.auditEvents[0].metadata).not.toHaveProperty('externalRef');
    expect(context.insertedItems[0]).toEqual(expect.objectContaining({
      source_type: 'EMAIL',
      mime_type: 'message/rfc822',
      ingest_source: 'GMAIL_IMPORT',
      original_filename: 'gmail-msg_acme.eml',
    }));
    const sourceBytes = await new gmailIntegration.MockGmailClient()
      .getRawMessage('mock-gmail-access-token', 'msg_acme_001');
    const equivalentUpload = await parseEmail(sourceBytes);
    expect(context.insertedSegments
      .filter(segment => segment.evidence_id === context.insertedItems[0].id)
      .map(segment => ({
      ordinal: segment.ordinal,
      locator_type: segment.locator_type,
      locator: segment.locator,
      segment_text: segment.segment_text,
      }))).toEqual(equivalentUpload.segments.map(segment => ({
      ordinal: segment.ordinal,
      locator_type: segment.locatorType,
      locator: segment.locator,
      segment_text: segment.segmentText,
    })));

    context.context.req = new Request('http://localhost/api/cases/test/evidence/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'th_acme_erasure_01' }),
    });
    const duplicateResult = await invokeImport(context.context) as {
      items: Array<{ duplicate: boolean }>;
    };
    expect(duplicateResult.items).toHaveLength(3);
    expect(duplicateResult.items.every(item => item.duplicate)).toBe(true);
    expect(context.insertedItems).toHaveLength(3);
  });

  it('uses thread order, limits imports to ten messages, and reports truncation', async () => {
    const context = makeContext();
    const client = new gmailIntegration.MockGmailClient();
    vi.spyOn(client, 'getThreadMessageIds').mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => `msg_${String(index).padStart(8, '0')}`)
    );
    const getRawMessage = vi.spyOn(client, 'getRawMessage');
    vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(client);

    const result = await invokeImport(context.context) as {
      items: Array<{ duplicate: boolean }>;
      truncated: boolean;
    };

    expect(result.items).toHaveLength(10);
    expect(result.truncated).toBe(true);
    expect(getRawMessage).toHaveBeenCalledTimes(10);
    expect(getRawMessage.mock.calls[0][1]).toBe('msg_00000000');
    expect(getRawMessage.mock.calls[9][1]).toBe('msg_00000009');
  });

  it('rejects oversized messages before storing evidence', async () => {
    vi.stubEnv('MAX_UPLOAD_MB', '0.000001');
    const context = makeContext();
    vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(new gmailIntegration.MockGmailClient());

    const response = await invokeImport(context.context) as Response;
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('GMAIL_MESSAGE_TOO_LARGE');
    expect(context.storedPaths).toHaveLength(0);
    expect(context.insertedItems).toHaveLength(0);
  });

  it('stops before Gmail access when the caller does not own the case', async () => {
    const context = makeContext({ ownsCase: false });
    const getClient = vi.spyOn(gmailIntegration, 'getGmailClient');

    const response = await invokeImport(context.context) as Response;
    expect(response.status).toBe(404);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('returns GMAIL_NOT_CONNECTED without contacting Google when no connection exists', async () => {
    const context = makeContext({ connected: false });
    const getClient = vi.spyOn(gmailIntegration, 'getGmailClient');

    const response = await invokeImport(context.context) as Response;
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('GMAIL_NOT_CONNECTED');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('maps expired grants to 409 and upstream failures to sanitized 502 responses', async () => {
    const context = makeContext();
    const client = new gmailIntegration.MockGmailClient();
    vi.spyOn(client, 'refreshAccessToken').mockRejectedValueOnce(new GmailClientError('AUTH_EXPIRED'));
    vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(client);

    const expiredResponse = await invokeImport(context.context) as Response;
    expect(expiredResponse.status).toBe(409);
    expect(((await expiredResponse.json()) as { error: { code: string } }).error.code).toBe('GMAIL_AUTH_EXPIRED');

    context.context.req = new Request('http://localhost/api/cases/test/evidence/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'th_acme_erasure_01' }),
    });
    vi.spyOn(client, 'refreshAccessToken').mockRejectedValueOnce(new GmailClientError('UPSTREAM'));
    const upstreamResponse = await invokeImport(context.context) as Response;
    expect(upstreamResponse.status).toBe(502);
    const error = (await upstreamResponse.json()) as { error: { code: string; message: string } };
    expect(error.error.code).toBe('GMAIL_UPSTREAM');
    expect(error.error.message).not.toContain('private provider detail');
  });

  it('cleans up stored evidence if an artifact write fails', async () => {
    const context = makeContext({ failArtifactInsert: true });
    vi.spyOn(gmailIntegration, 'getGmailClient').mockReturnValue(new gmailIntegration.MockGmailClient());

    await expect(invokeImport(context.context)).rejects.toThrow('Failed to insert imported evidence artifact');
    expect(context.evidence.size).toBe(0);
    expect(context.storedPaths).toHaveLength(1);
    expect(context.removedPaths).toEqual(context.storedPaths);
  });

  it('deletes the caller connection when disconnecting', async () => {
    const context = makeContext();
    const disconnectRoute = gmailRoutes.find(route => route.pattern === '/gmail/connection');
    if (!disconnectRoute) throw new Error('Gmail disconnect route is not registered');

    await expect(disconnectRoute.handler(context.context as never))
      .resolves.toEqual({ disconnected: true });
    expect(context.connectionDeleted()).toBe(true);
  });
});
