import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Builds a minimal Supabase StorageFileApi mock. */
function makeStorageMock(overrides: {
  listResponses?: Array<{ data: unknown[] | null; error: { message: string } | null }>;
  removeError?: { message: string } | null;
}) {
  // listResponses is consumed in order each time .list() is called.
  const listQueue = [...(overrides.listResponses ?? [])];

  const storageBucket = {
    list: vi.fn().mockImplementation(() => {
      if (listQueue.length === 0) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve(listQueue.shift());
    }),
    remove: vi.fn().mockResolvedValue({ error: overrides.removeError ?? null }),
  };

  return {
    from: vi.fn().mockReturnValue(storageBucket),
    _bucket: storageBucket,
  };
}

/**
 * Makes a file-like storage item (has id + metadata).
 * IMPORTANT: `name` must be just the *basename* of the file — the segment
 * after the prefix passed to `.list()`.  The full path is reconstructed
 * inside `listAllFilesUnderPrefix` as `${prefix}/${item.name}`.
 */
function fileItem(name: string) {
  return { name, id: `id-${name}`, metadata: { size: 1024 } };
}

/** Makes a folder-like storage item (no id, no metadata). */
function folderItem(name: string) {
  return { name, id: null, metadata: null };
}

/** Builds a Supabase DB query chain mock that returns a fixed result. */
function makeDbSelect(result: { data: unknown[] | null; error: { message: string } | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  // Make the chain itself thenable so `await admin.from(...).select(...).eq(...)` resolves.
  const promise = Promise.resolve(result);
  Object.assign(chain, {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  });
  return chain;
}

// ---------------------------------------------------------------------------
// Import the module under test AFTER setting up mocks
// ---------------------------------------------------------------------------
vi.mock('../api/client', () => ({
  getAdminClient: vi.fn(),
}));

import { purgeUserStorage } from './storagePurger';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('purgeUserStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 1. Happy path: 2 cases, known paths + crawled paths merged, all deleted ─

  it('deletes all objects across 2 cases and verifies empty prefix', async () => {
    const case1 = 'aaaaaaaa-0000-0000-0000-000000000001';
    const case2 = 'aaaaaaaa-0000-0000-0000-000000000002';

    // Full canonical paths
    const pathC1 = `cases/${case1}/evidence/e1/original`;
    const pathC2 = `cases/${case2}/evidence/e2/original`;

    // DB: cases query → 2 rows
    const casesResult = { data: [{ id: case1 }, { id: case2 }], error: null };
    // DB: evidence_items — known storage_path matches what the crawl will find
    const evidenceCase1 = { data: [{ storage_path: pathC1 }], error: null };
    const evidenceCase2 = { data: [{ storage_path: pathC2 }], error: null };

    let evidenceCalls = 0;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect(casesResult);
      // first evidence_items call → case1, second → case2
      evidenceCalls++;
      return evidenceCalls === 1 ? makeDbSelect(evidenceCase1) : makeDbSelect(evidenceCase2);
    });

    // listAllFilesUnderPrefix calls list(prefix, {limit:100, offset:0}).
    // item.name must be the LEAF segment; full path = `${prefix}/${item.name}`.
    // case1 prefix = `cases/${case1}`, so leaf for pathC1 is `evidence/e1/original`.
    // case2 prefix = `cases/${case2}`, so leaf for pathC2 is `evidence/e2/original`.
    const leafC1 = 'evidence/e1/original';
    const leafC2 = 'evidence/e2/original';

    // Each phase (crawl, verify) makes exactly 1 list() call per case because
    // data.length(1) < limit(100) stops pagination immediately.
    const listResponses = [
      { data: [fileItem(leafC1)], error: null }, // crawl case1
      { data: [], error: null },                  // verify case1: empty
      { data: [fileItem(leafC2)], error: null }, // crawl case2
      { data: [], error: null },                  // verify case2: empty
    ];

    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-123', client);

    expect(result.success).toBe(true);
    expect(result.casesPurged).toBe(2);
    expect(result.caseIds).toEqual([case1, case2]);
    // Each case contributes 1 unique path (known == crawled, deduped to 1)
    expect(result.objectsDeleted).toBe(2);
    // remove called once per case
    expect(storageMock._bucket.remove).toHaveBeenCalledTimes(2);
    expect(storageMock._bucket.remove).toHaveBeenCalledWith([pathC1]);
    expect(storageMock._bucket.remove).toHaveBeenCalledWith([pathC2]);
  });

  // ─── 2. Idempotent: 0 cases → safe no-op ────────────────────────────────

  it('returns success with zeros when user has no cases', async () => {
    const fromMock = vi.fn().mockReturnValue(makeDbSelect({ data: [], error: null }));
    const storageMock = makeStorageMock({});

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-no-cases', client);

    expect(result).toEqual({
      success: true,
      casesPurged: 0,
      objectsDeleted: 0,
      caseIds: [],
    });
    expect(storageMock._bucket.list).not.toHaveBeenCalled();
    expect(storageMock._bucket.remove).not.toHaveBeenCalled();
  });

  // ─── 3. Already-empty prefix is safe (list returns empty, no remove call) ─

  it('is a no-op when prefix is already empty and known paths list is empty', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000003';

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      // evidence_items → no known paths
      return makeDbSelect({ data: [], error: null });
    });

    // list returns empty on first call (prefix already empty) and again on verify
    const listResponses = [
      { data: [], error: null }, // list scan → empty
      { data: [], error: null }, // verify → empty
    ];
    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-empty', client);

    expect(result.success).toBe(true);
    expect(result.casesPurged).toBe(1);
    expect(result.objectsDeleted).toBe(0);
    expect(storageMock._bucket.remove).not.toHaveBeenCalled();
  });

  // ─── 4. Throws on DB query error (cases) ────────────────────────────────

  it('throws when the cases DB query fails', async () => {
    const fromMock = vi
      .fn()
      .mockReturnValue(makeDbSelect({ data: null, error: { message: 'connection timeout' } }));
    const storageMock = makeStorageMock({});

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    await expect(purgeUserStorage('user-dberr', client)).rejects.toThrow(
      'Failed to query user cases for storage purge: connection timeout'
    );
    expect(storageMock._bucket.remove).not.toHaveBeenCalled();
  });

  // ─── 5. Throws on storage remove error ──────────────────────────────────

  it('throws when storage.remove returns an error', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000004';

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      return makeDbSelect({ data: [{ storage_path: `cases/${caseId}/evidence/e1/original` }], error: null });
    });

    const listResponses = [
      { data: [fileItem(`cases/${caseId}/evidence/e1/original`)], error: null },
      { data: [], error: null }, // pagination ends
    ];
    const storageMock = makeStorageMock({
      listResponses,
      removeError: { message: 'permission denied' },
    });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    await expect(purgeUserStorage('user-removeerr', client)).rejects.toThrow(
      `Failed to remove storage objects under cases/${caseId}: permission denied`
    );
  });

  // ─── 6. Throws if prefix not empty after purge ───────────────────────────

  it('throws when the prefix is still non-empty after deletion', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000005';
    // leaf name returned by list() under `cases/${caseId}`
    const leaf = 'evidence/e1/original';
    const fullPath = `cases/${caseId}/${leaf}`;

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      return makeDbSelect({ data: [{ storage_path: fullPath }], error: null });
    });

    // data.length(1) < limit(100) → pagination stops after 1 call each phase.
    const listResponses = [
      { data: [fileItem(leaf)], error: null }, // crawl: 1 file found
      { data: [fileItem(leaf)], error: null }, // verify: still there → should throw
    ];
    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    await expect(purgeUserStorage('user-leaked', client)).rejects.toThrow(
      /is not empty after purge/
    );
  });

  // ─── 7. Deduplicates known paths and crawled paths correctly ─────────────

  it('counts each unique object only once when known paths and crawled paths overlap', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000006';
    // sharedPath appears in BOTH known paths (DB) and crawl results
    const sharedPath = `cases/${caseId}/evidence/e1/original`;
    // extraPath is in DB known paths only (already deleted from storage)
    const extraPath = `cases/${caseId}/evidence/e1/thumbnail`;
    // leaf basenames as returned by list() under `cases/${caseId}`
    const sharedLeaf = 'evidence/e1/original';

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      // known paths include both sharedPath and extraPath
      return makeDbSelect({
        data: [{ storage_path: sharedPath }, { storage_path: extraPath }],
        error: null,
      });
    });

    const listResponses = [
      // crawl returns only sharedLeaf (extraPath already gone from storage)
      { data: [fileItem(sharedLeaf)], error: null },
      { data: [], error: null }, // pagination done
      // verify: empty after delete
      { data: [], error: null },
    ];
    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-dedup', client);

    // sharedPath + extraPath deduped → 2 unique paths sent to remove
    expect(result.objectsDeleted).toBe(2);
    const removedPaths: string[] = storageMock._bucket.remove.mock.calls[0][0];
    expect(removedPaths).toHaveLength(2);
    expect(removedPaths).toContain(sharedPath);
    expect(removedPaths).toContain(extraPath);
  });

  // ─── 8. Batching: sends multiple remove() calls when objects exceed batchSize ─

  it('splits deletions into batches when objectsDeleted > batchSize', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000007';
    const batchSize = 2;
    // fileItem names must be leaf segments (relative to the case prefix)
    const files = ['fa', 'fb', 'fc'].map((n) => fileItem(n));

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      return makeDbSelect({ data: [], error: null }); // no known paths
    });

    const listResponses = [
      { data: files, error: null }, // crawl: 3 files (3 < 100, pagination stops)
      { data: [], error: null },    // verify: empty
    ];
    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-batch', client, { batchSize });

    expect(result.objectsDeleted).toBe(3);
    // ceil(3 / 2) = 2 batches
    expect(storageMock._bucket.remove).toHaveBeenCalledTimes(2);
    expect(storageMock._bucket.remove.mock.calls[0][0]).toHaveLength(2);
    expect(storageMock._bucket.remove.mock.calls[1][0]).toHaveLength(1);
  });

  // ─── 9. Storage list "not found" is treated as empty, not an error ────────

  it('treats a storage list "not found" error as an empty prefix (idempotent)', async () => {
    const caseId = 'aaaaaaaa-0000-0000-0000-000000000008';

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'cases') return makeDbSelect({ data: [{ id: caseId }], error: null });
      return makeDbSelect({ data: [], error: null });
    });

    const listResponses = [
      // first list call returns a "not found" error
      { data: null, error: { message: 'object not found' } },
      // verify also returns not-found
      { data: null, error: { message: '404 not found' } },
    ];
    const storageMock = makeStorageMock({ listResponses });

    const client = {
      from: fromMock,
      storage: storageMock,
    } as unknown as SupabaseClient;

    const result = await purgeUserStorage('user-notfound', client);

    expect(result.success).toBe(true);
    expect(result.objectsDeleted).toBe(0);
    expect(storageMock._bucket.remove).not.toHaveBeenCalled();
  });
});
