import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '../api/client';

export interface StoragePurgeOptions {
  bucket?: string;
  batchSize?: number;
}

export interface StoragePurgeResult {
  success: boolean;
  casesPurged: number;
  objectsDeleted: number;
  caseIds: string[];
}

const DEFAULT_BUCKET = 'evidence';
const DEFAULT_BATCH_SIZE = 50;

/**
 * Recursively lists all file object paths under a given folder prefix in Supabase Storage.
 */
async function listAllFilesUnderPrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const filePaths: string[] = [];
  const queue: string[] = [prefix];

  while (queue.length > 0) {
    const currentPrefix = queue.shift()!;
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(currentPrefix, { limit, offset });

      if (error) {
        // If the folder does not exist at all, list returns error or empty; treat not found as empty
        if (error.message.includes('not found') || error.message.includes('404')) {
          hasMore = false;
          break;
        }
        throw new Error(`Storage list error under prefix "${currentPrefix}": ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of data) {
        const itemPath = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;
        // In Supabase Storage, subdirectories either have id: null or metadata: null
        if (!item.id || !item.metadata) {
          queue.push(itemPath);
        } else {
          filePaths.push(itemPath);
        }
      }

      if (data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  }

  return filePaths;
}

/**
 * Purges every storage object under cases/{case_id}/ for all cases owned by the given user.
 * Deletions are executed in batches, and the prefix emptiness is verified afterwards.
 * Operation is strictly idempotent: re-running on an already-purged user is a safe no-op.
 *
 * @param userId - Target user ID (UUID)
 * @param client - Privileged Supabase client (defaults to getAdminClient())
 * @param options - Configuration for bucket name and deletion batch size
 */
export async function purgeUserStorage(
  userId: string,
  client?: SupabaseClient,
  options: StoragePurgeOptions = {}
): Promise<StoragePurgeResult> {
  const admin = client || getAdminClient();
  const bucket = options.bucket || DEFAULT_BUCKET;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

  // 1. Fetch all cases owned by the user
  const { data: casesData, error: casesError } = await admin
    .from('cases')
    .select('id')
    .eq('owner_id', userId);

  if (casesError) {
    throw new Error(`Failed to query user cases for storage purge: ${casesError.message}`);
  }

  const cases = casesData || [];
  const caseIds = cases.map((c) => c.id);

  if (caseIds.length === 0) {
    return {
      success: true,
      casesPurged: 0,
      objectsDeleted: 0,
      caseIds: [],
    };
  }

  let totalDeleted = 0;

  // 2. Purge each case prefix
  for (const caseId of caseIds) {
    const casePrefix = `cases/${caseId}`;

    // Get any known storage paths recorded in evidence_items for this case
    let knownPaths: string[] = [];
    try {
      const { data: evidenceRows } = await admin
        .from('evidence_items')
        .select('storage_path')
        .eq('case_id', caseId);

      if (evidenceRows) {
        knownPaths = evidenceRows
          .map((r) => r.storage_path)
          .filter((p): p is string => Boolean(p));
      }
    } catch {
      // Best-effort: if DB query fails, directory crawl still discovers files
    }

    // Crawl storage bucket under the case prefix
    const discoveredPaths = await listAllFilesUnderPrefix(admin, bucket, casePrefix);

    // Merge and deduplicate paths
    const allPathsToDelete = Array.from(new Set([...knownPaths, ...discoveredPaths]));

    // Delete in batches
    for (let i = 0; i < allPathsToDelete.length; i += batchSize) {
      const batch = allPathsToDelete.slice(i, i + batchSize);
      if (batch.length > 0) {
        const { error: removeError } = await admin.storage
          .from(bucket)
          .remove(batch);

        if (removeError) {
          throw new Error(
            `Failed to remove storage objects under ${casePrefix}: ${removeError.message}`
          );
        }
        totalDeleted += batch.length;
      }
    }

    // 3. Verify the prefix is empty
    const remaining = await listAllFilesUnderPrefix(admin, bucket, casePrefix);
    if (remaining.length > 0) {
      throw new Error(
        `Storage prefix "${casePrefix}" is not empty after purge: ${remaining.length} objects remaining (${remaining.join(', ')})`
      );
    }
  }

  return {
    success: true,
    casesPurged: caseIds.length,
    objectsDeleted: totalDeleted,
    caseIds,
  };
}
