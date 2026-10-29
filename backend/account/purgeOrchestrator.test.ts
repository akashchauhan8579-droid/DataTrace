import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../api/client', () => ({ getAdminClient: vi.fn() }));
vi.mock('./storagePurger', () => ({ purgeUserStorage: vi.fn() }));
vi.mock('./gmailRevoke', () => ({ revokeGmailConnection: vi.fn() }));

import { orchestratePurge, computeSubjectHash } from './purgeOrchestrator';
import { purgeUserStorage } from './storagePurger';
import { revokeGmailConnection } from './gmailRevoke';

// ---------------------------------------------------------------------------
// Constants / fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUBJECT_HASH = 'deadbeef'.repeat(8); // 64-char hex
const BASE_TIME = '2026-01-01T00:00:00.000Z';

const RECEIPT_KEY_B64 = Buffer.alloc(32).toString('base64'); // 32 zero-bytes, base64

const BASE_ROW: {
  id: string;
  user_id: string | null;
  state: string;
  subject_hash: string;
  attempts: number;
  last_error: string | null;
  counts: Record<string, number>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
} = {
  id: 'req-0000-0000-0000-000000000001',
  user_id: USER_ID,
  state: 'REQUESTED',
  subject_hash: SUBJECT_HASH,
  attempts: 0,
  last_error: null,
  counts: {},
  created_at: BASE_TIME,
  updated_at: BASE_TIME,
  completed_at: null,
};

// ---------------------------------------------------------------------------
// DB chain helpers
// ---------------------------------------------------------------------------

type Resolved = { data: unknown; error: { message: string } | null };

/**
 * Creates a chainable mock that resolves to `result`.
 * Handles both `.select().eq().neq().maybeSingle()` and
 * `.update().eq().select().single()` style chains.
 */
function chain(result: Resolved) {
  const p = Promise.resolve(result);
  const c: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return c;
}

/**
 * Builds a client mock where each `from(table)` call returns the next
 * result from `responses`. Falls back to `{ data: null, error: null }`.
 *
 * Also exposes `rpc` and `auth.admin.deleteUser` as vi.fn()s.
 */
function makeClient(
  responses: Resolved[],
  rpcResult: Resolved = { data: {}, error: null },
  deleteUserResult: { error: null | { message: string } } = { error: null }
): SupabaseClient & { _rpc: ReturnType<typeof vi.fn>; _deleteUser: ReturnType<typeof vi.fn>; _from: ReturnType<typeof vi.fn> } {
  const queue = [...responses];
  const fromMock = vi.fn().mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    return chain(result);
  });
  const rpcMock = vi.fn().mockResolvedValue(rpcResult);
  const deleteUserMock = vi.fn().mockResolvedValue(deleteUserResult);

  return {
    from: fromMock,
    rpc: rpcMock,
    auth: { admin: { deleteUser: deleteUserMock } },
    _rpc: rpcMock,
    _deleteUser: deleteUserMock,
    _from: fromMock,
  } as unknown as SupabaseClient & { _rpc: ReturnType<typeof vi.fn>; _deleteUser: ReturnType<typeof vi.fn>; _from: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a row at the given state. */
function rowAt(state: string, extra: Partial<typeof BASE_ROW> = {}) {
  return { ...BASE_ROW, state, attempts: 1, ...extra };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeSubjectHash', () => {
  it('returns a 64-char hex string deterministically', () => {
    process.env.ERASURE_RECEIPT_KEY = RECEIPT_KEY_B64;
    const h1 = computeSubjectHash(USER_ID);
    const h2 = computeSubjectHash(USER_ID);
    expect(h1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(h1)).toBe(true);
    expect(h1).toBe(h2);
  });

  it('throws when ERASURE_RECEIPT_KEY is not set', () => {
    delete process.env.ERASURE_RECEIPT_KEY;
    expect(() => computeSubjectHash(USER_ID)).toThrow('ERASURE_RECEIPT_KEY');
    process.env.ERASURE_RECEIPT_KEY = RECEIPT_KEY_B64; // restore
  });
});

// ---------------------------------------------------------------------------

describe('orchestratePurge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ERASURE_RECEIPT_KEY = RECEIPT_KEY_B64;
    vi.mocked(purgeUserStorage).mockResolvedValue({
      success: true,
      casesPurged: 1,
      objectsDeleted: 3,
      caseIds: ['case-1'],
    });
    vi.mocked(revokeGmailConnection).mockResolvedValue({
      revoked: true,
      googleRevokeAttempted: true,
    });
  });

  // ─── 1. COMPLETE row returned immediately ────────────────────────────────

  it('returns immediately when an active-but-COMPLETE row is found', async () => {
    const completeRow = rowAt('COMPLETE', { user_id: null as unknown as string, completed_at: BASE_TIME });
    const client = makeClient([
      { data: null, error: null },           // neq('COMPLETE') → nothing active
      { data: completeRow, error: null },    // eq('COMPLETE') → found
    ]);

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('COMPLETE');
    expect(purgeUserStorage).not.toHaveBeenCalled();
    expect(revokeGmailConnection).not.toHaveBeenCalled();
    expect(client._rpc).not.toHaveBeenCalled();
  });

  // ─── 2. Full happy path: REQUESTED → COMPLETE ───────────────────────────

  it('runs all 5 transitions and returns COMPLETE on a fresh request', async () => {
    const reqRow = { ...BASE_ROW, state: 'REQUESTED', attempts: 0 };
    const bumpedRow = { ...reqRow, attempts: 1 };
    const storagePurgedRow = rowAt('STORAGE_PURGED');
    const gmailRevokedRow = rowAt('GMAIL_REVOKED');
    const dbPurgedRow = rowAt('DB_PURGED', { counts: { cases: 2 } });
    const authDeletedRow = rowAt('AUTH_DELETED');
    const completeRow = rowAt('COMPLETE', { user_id: null as unknown as string, completed_at: BASE_TIME });

    const dbCounts = { cases: 2, audit_events: 10 };

    const client = makeClient(
      [
        // load: active found
        { data: reqRow, error: null },
        // bump attempts
        { data: bumpedRow, error: null },
        // advanceState → STORAGE_PURGED
        { data: storagePurgedRow, error: null },
        // advanceState → GMAIL_REVOKED
        { data: gmailRevokedRow, error: null },
        // drainRunningAnalysis: cases query
        { data: [], error: null },
        // advanceState → DB_PURGED
        { data: dbPurgedRow, error: null },
        // advanceState → AUTH_DELETED
        { data: authDeletedRow, error: null },
        // erasure_receipts insert
        { data: null, error: null },
        // advanceState → COMPLETE (nullUserId)
        { data: completeRow, error: null },
      ],
      { data: dbCounts, error: null } // rpc result
    );

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('COMPLETE');
    expect(result.userId).toBeNull();
    expect(purgeUserStorage).toHaveBeenCalledOnce();
    expect(revokeGmailConnection).toHaveBeenCalledOnce();
    expect(client._rpc).toHaveBeenCalledWith('purge_user_account', { p_user: USER_ID });
    expect(client._deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  // ─── 3. Resume from STORAGE_PURGED ──────────────────────────────────────

  it('resumes from STORAGE_PURGED, skipping purgeUserStorage', async () => {
    const existingRow = rowAt('STORAGE_PURGED', { attempts: 1 });
    const bumpedRow = rowAt('STORAGE_PURGED', { attempts: 2 });
    const gmailRevokedRow = rowAt('GMAIL_REVOKED');
    const dbPurgedRow = rowAt('DB_PURGED', { counts: { cases: 1 } });
    const authDeletedRow = rowAt('AUTH_DELETED');
    const completeRow = rowAt('COMPLETE', { user_id: null as unknown as string, completed_at: BASE_TIME });

    const client = makeClient([
      { data: existingRow, error: null },    // load active
      { data: bumpedRow, error: null },      // bump attempts
      { data: gmailRevokedRow, error: null },// advanceState GMAIL_REVOKED
      { data: [], error: null },             // drain: cases
      { data: dbPurgedRow, error: null },    // advanceState DB_PURGED
      { data: authDeletedRow, error: null }, // advanceState AUTH_DELETED
      { data: null, error: null },           // receipt insert
      { data: completeRow, error: null },    // advanceState COMPLETE
    ]);

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('COMPLETE');
    expect(purgeUserStorage).not.toHaveBeenCalled();
    expect(revokeGmailConnection).toHaveBeenCalledOnce();
  });

  // ─── 4. Resume from GMAIL_REVOKED ───────────────────────────────────────

  it('resumes from GMAIL_REVOKED, skipping storage and gmail steps', async () => {
    const existingRow = rowAt('GMAIL_REVOKED');
    const bumpedRow = rowAt('GMAIL_REVOKED', { attempts: 2 });
    const dbPurgedRow = rowAt('DB_PURGED', { counts: { cases: 0 } });
    const authDeletedRow = rowAt('AUTH_DELETED');
    const completeRow = rowAt('COMPLETE', { user_id: null as unknown as string, completed_at: BASE_TIME });

    const client = makeClient([
      { data: existingRow, error: null },
      { data: bumpedRow, error: null },
      { data: [], error: null },             // drain: cases
      { data: dbPurgedRow, error: null },
      { data: authDeletedRow, error: null },
      { data: null, error: null },           // receipt
      { data: completeRow, error: null },
    ]);

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('COMPLETE');
    expect(purgeUserStorage).not.toHaveBeenCalled();
    expect(revokeGmailConnection).not.toHaveBeenCalled();
    expect(client._rpc).toHaveBeenCalledOnce();
  });

  // ─── 5. Time-budget exhausted before STORAGE step → returns REQUESTED ───

  it('stops before STORAGE_PURGED when timeBudgetMs is 0', async () => {
    const reqRow = { ...BASE_ROW };
    const bumpedRow = { ...BASE_ROW, attempts: 1 };

    const client = makeClient([
      { data: reqRow, error: null },    // load
      { data: bumpedRow, error: null }, // bump
    ]);

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 0 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('REQUESTED');
    expect(purgeUserStorage).not.toHaveBeenCalled();
  });

  // ─── 6. purgeUserStorage throws → last_error recorded, state unchanged ──

  it('records last_error and rethrows when purgeUserStorage fails', async () => {
    vi.mocked(purgeUserStorage).mockRejectedValue(new Error('storage boom'));

    const reqRow = { ...BASE_ROW };
    const bumpedRow = { ...BASE_ROW, attempts: 1 };
    // error update call
    const errorUpdated = { ...bumpedRow, last_error: 'storage boom' };

    const client = makeClient([
      { data: reqRow, error: null },       // load
      { data: bumpedRow, error: null },    // bump
      { data: errorUpdated, error: null }, // error recording update
    ]);

    await expect(
      orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient)
    ).rejects.toThrow('storage boom');

    // The error-recording update was called
    const updateCalls = (client._from as ReturnType<typeof vi.fn>).mock.calls;
    // At least one call to 'account_deletion_requests' for error recording
    expect(updateCalls.some((c: string[]) => c[0] === 'account_deletion_requests')).toBe(true);
  });

  // ─── 7. purge_user_account RPC fails → rethrows ─────────────────────────

  it('rethrows when the purge_user_account RPC returns an error', async () => {
    const existingRow = rowAt('GMAIL_REVOKED');
    const bumpedRow = rowAt('GMAIL_REVOKED', { attempts: 2 });

    const client = makeClient(
      [
        { data: existingRow, error: null },
        { data: bumpedRow, error: null },
        { data: [], error: null },            // drain: cases
        { data: null, error: null },          // error recording
      ],
      { data: null, error: { message: 'permission denied' } } // rpc error
    );

    await expect(
      orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient)
    ).rejects.toThrow('purge_user_account RPC failed: permission denied');
  });

  // ─── 8. auth.admin.deleteUser fails → rethrows ──────────────────────────

  it('rethrows when auth.admin.deleteUser returns an error', async () => {
    const existingRow = rowAt('DB_PURGED', { counts: { cases: 1 } });
    const bumpedRow = rowAt('DB_PURGED', { counts: { cases: 1 }, attempts: 2 });

    const client = makeClient(
      [
        { data: existingRow, error: null },
        { data: bumpedRow, error: null },
        { data: null, error: null },  // error recording
      ],
      { data: {}, error: null },
      { error: { message: 'user not found' } }
    );

    await expect(
      orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient)
    ).rejects.toThrow('auth.admin.deleteUser failed: user not found');
  });

  // ─── 9. erasure_receipts insert fails → rethrows ────────────────────────

  it('rethrows when the erasure receipt insert fails', async () => {
    const existingRow = rowAt('AUTH_DELETED');
    const bumpedRow = rowAt('AUTH_DELETED', { attempts: 2 });

    const client = makeClient([
      { data: existingRow, error: null },
      { data: bumpedRow, error: null },
      { data: null, error: { message: 'unique violation' } }, // receipt insert fails
      { data: null, error: null },                             // error recording
    ]);

    await expect(
      orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient)
    ).rejects.toThrow('Failed to write erasure receipt: unique violation');
  });

  it('always finishes the receipt after AUTH_DELETED even with no budget left', async () => {
    const existingRow = rowAt('AUTH_DELETED');
    const bumpedRow = rowAt('AUTH_DELETED', { attempts: 2 });
    const completeRow = rowAt('COMPLETE', {
      user_id: null as unknown as string,
      completed_at: BASE_TIME,
    });

    const client = makeClient([
      { data: existingRow, error: null },
      { data: bumpedRow, error: null },
      { data: null, error: null },        // receipt insert
      { data: completeRow, error: null }, // advance COMPLETE
    ]);

    const result = await orchestratePurge(
      USER_ID,
      SUBJECT_HASH,
      { timeBudgetMs: 0 },
      client as unknown as SupabaseClient
    );

    expect(result.state).toBe('COMPLETE');
    expect(client._deleteUser).not.toHaveBeenCalled();
  });

  // ─── 10. No existing row and no complete → creates REQUESTED ────────────

  it('creates a new REQUESTED row when neither active nor complete rows exist', async () => {
    const freshRow = { ...BASE_ROW };
    const bumpedRow = { ...BASE_ROW, attempts: 1 };
    const storagePurgedRow = rowAt('STORAGE_PURGED');
    const gmailRevokedRow = rowAt('GMAIL_REVOKED');
    const dbPurgedRow = rowAt('DB_PURGED', { counts: {} });
    const authDeletedRow = rowAt('AUTH_DELETED');
    const completeRow = rowAt('COMPLETE', { user_id: null as unknown as string, completed_at: BASE_TIME });

    const client = makeClient([
      { data: null, error: null },           // active query → nothing
      { data: null, error: null },           // complete query → nothing
      { data: freshRow, error: null },       // insert new row
      { data: bumpedRow, error: null },      // bump attempts
      { data: storagePurgedRow, error: null },
      { data: gmailRevokedRow, error: null },
      { data: [], error: null },             // drain
      { data: dbPurgedRow, error: null },
      { data: authDeletedRow, error: null },
      { data: null, error: null },           // receipt
      { data: completeRow, error: null },
    ]);

    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 60_000 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('COMPLETE');
    expect(purgeUserStorage).toHaveBeenCalledOnce();
  });

  // ─── 11. DB_PURGED → AUTH_DELETED budget check ──────────────────────────

  it('stops at DB_PURGED when budget is exhausted before AUTH_DELETED step', async () => {
    const existingRow = rowAt('DB_PURGED', { counts: { cases: 0 } });
    const bumpedRow = rowAt('DB_PURGED', { counts: { cases: 0 }, attempts: 2 });

    const client = makeClient([
      { data: existingRow, error: null },
      { data: bumpedRow, error: null },
    ]);

    // budget = 0 → hasBudget() is false immediately
    const result = await orchestratePurge(USER_ID, SUBJECT_HASH, { timeBudgetMs: 0 }, client as unknown as SupabaseClient);

    expect(result.state).toBe('DB_PURGED');
    expect(client._deleteUser).not.toHaveBeenCalled();
  });

  // ─── 12. ERASURE_RECEIPT_KEY not set → throws from computeSubjectHash ───

  it('computeSubjectHash throws when ERASURE_RECEIPT_KEY env var is absent', () => {
    const orig = process.env.ERASURE_RECEIPT_KEY;
    delete process.env.ERASURE_RECEIPT_KEY;
    expect(() => computeSubjectHash(USER_ID)).toThrow('ERASURE_RECEIPT_KEY');
    process.env.ERASURE_RECEIPT_KEY = orig;
  });
});
