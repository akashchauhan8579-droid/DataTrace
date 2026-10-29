import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the import under test
// ---------------------------------------------------------------------------

vi.mock('../api/client', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('../integrations/tokenVault', () => ({
  decryptToken: vi.fn(),
}));

// We mock `fetch` globally so we can control Google's revocation response.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Import helpers (after mocks)
// ---------------------------------------------------------------------------
import { revokeGmailConnection } from './gmailRevoke';
import { decryptToken } from '../integrations/tokenVault';

// ---------------------------------------------------------------------------
// DB chain helpers
// ---------------------------------------------------------------------------

type DbResult = { data: unknown; error: { message: string } | null };

/**
 * Returns a chainable mock that resolves to `result` when awaited.
 * Supports .select().eq().maybeSingle() and .delete().eq() patterns.
 */
function makeChain(result: DbResult) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return chain;
}

/** Builds a Supabase client mock whose `from()` calls return the supplied results in order. */
function makeClient(responses: DbResult[]): SupabaseClient {
  const queue = [...responses];
  return {
    from: vi.fn().mockImplementation(() => {
      const result = queue.shift() ?? { data: null, error: null };
      return makeChain(result);
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('revokeGmailConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetch resolves with 200 OK
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  // ─── 1. Happy path: row exists, token decrypts, Google revoke succeeds ───

  it('revokes token at Google and deletes the DB row when connection exists', async () => {
    vi.mocked(decryptToken).mockReturnValue('plaintext-refresh-token');

    const client = makeClient([
      // fetch connection row
      { data: { refresh_token_enc: 'enc:tok:en' }, error: null },
      // delete row
      { data: null, error: null },
    ]);

    const result = await revokeGmailConnection('user-abc', client);

    expect(result).toEqual({ revoked: true, googleRevokeAttempted: true });

    // Google revoke endpoint was called with correct body
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.method).toBe('POST');
    expect(init.body).toContain('token=plaintext-refresh-token');

    // DB delete was called
    const fromCalls = (client.from as ReturnType<typeof vi.fn>).mock.calls;
    expect(fromCalls).toHaveLength(2);
    expect(fromCalls[0][0]).toBe('gmail_connections');
    expect(fromCalls[1][0]).toBe('gmail_connections');
  });

  // ─── 2. No connection row → skip Google call, delete is still called (idempotent) ─

  it('returns revoked without attempting Google revoke when no connection row exists', async () => {
    const client = makeClient([
      { data: null, error: null }, // maybeSingle() returns null → no row
      { data: null, error: null }, // delete call
    ]);

    const result = await revokeGmailConnection('user-noconn', client);

    expect(result).toEqual({ revoked: true, googleRevokeAttempted: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decryptToken).not.toHaveBeenCalled();
  });

  // ─── 3. Google revoke fails → swallowed; DB row still deleted ─────────────

  it('swallows Google revocation errors and still deletes the DB row', async () => {
    vi.mocked(decryptToken).mockReturnValue('plaintext-refresh-token');
    fetchMock.mockRejectedValue(new Error('network failure'));

    const client = makeClient([
      { data: { refresh_token_enc: 'enc:tok:en' }, error: null },
      { data: null, error: null },
    ]);

    const result = await revokeGmailConnection('user-gfail', client);

    // attempt was made (even though it threw), row still deleted
    expect(result).toEqual({ revoked: true, googleRevokeAttempted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ─── 4. Google returns non-200 → swallowed; DB row still deleted ──────────

  it('treats a non-200 Google response as best-effort and still deletes the DB row', async () => {
    vi.mocked(decryptToken).mockReturnValue('plaintext-refresh-token');
    // Google returns 400 (token already revoked) — our code doesn't check status,
    // it just awaits fetch and moves on.
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));

    const client = makeClient([
      { data: { refresh_token_enc: 'enc:tok:en' }, error: null },
      { data: null, error: null },
    ]);

    const result = await revokeGmailConnection('user-g400', client);

    expect(result).toEqual({ revoked: true, googleRevokeAttempted: true });
  });

  // ─── 5. decryptToken throws → swallowed; Google still attempted; row deleted ─

  it('swallows decryptToken errors and marks attempt as true, row still deleted', async () => {
    vi.mocked(decryptToken).mockImplementation(() => {
      throw new Error('AES auth tag mismatch');
    });

    const client = makeClient([
      { data: { refresh_token_enc: 'corrupted:enc:token' }, error: null },
      { data: null, error: null },
    ]);

    const result = await revokeGmailConnection('user-badenc', client);

    // decrypt failed, so fetch was never called; but attempt flag is set because we tried
    expect(result.revoked).toBe(true);
    expect(result.googleRevokeAttempted).toBe(true);
    // fetch was NOT called because decryptToken threw before it
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ─── 6. DB fetch error → throws ───────────────────────────────────────────

  it('throws when the DB fetch for connection fails', async () => {
    // maybeSingle resolves to error
    const errChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      }),
    };
    const client = {
      from: vi.fn().mockReturnValue(errChain),
    } as unknown as SupabaseClient;

    await expect(revokeGmailConnection('user-dberr', client)).rejects.toThrow(
      'Failed to read Gmail connection for revocation: connection refused'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ─── 7. DB delete error → throws ──────────────────────────────────────────

  it('throws when the DB delete of the connection row fails', async () => {
    vi.mocked(decryptToken).mockReturnValue('tok');

    // fetch succeeds for connection, then delete fails
    const fetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { refresh_token_enc: 'enc:t:ok' }, error: null }),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB write failed' } }),
    };

    let callCount = 0;
    const client = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? fetchChain : deleteChain;
      }),
    } as unknown as SupabaseClient;

    await expect(revokeGmailConnection('user-deldberr', client)).rejects.toThrow(
      'Failed to delete Gmail connection row: DB write failed'
    );
  });

  // ─── 8. Uses getAdminClient() when no client is passed ───────────────────

  it('falls back to getAdminClient() when no client argument is provided', async () => {
    const { getAdminClient } = await import('../api/client');

    const adminClient = makeClient([
      { data: null, error: null }, // no connection row
      { data: null, error: null }, // delete
    ]);
    vi.mocked(getAdminClient).mockReturnValue(adminClient);

    const result = await revokeGmailConnection('user-default');

    expect(getAdminClient).toHaveBeenCalledTimes(1);
    expect(result.revoked).toBe(true);
  });
});
