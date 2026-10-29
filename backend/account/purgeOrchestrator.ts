import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '../api/client';
import { purgeUserStorage } from './storagePurger';
import { revokeGmailConnection } from './gmailRevoke';
import type { AccountDeletionState, DeletionStatus } from '../../contracts/schemas/account.ts';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Milliseconds to wait between drain-checks for in-flight RUNNING analysis runs (D3). */
const DRAIN_POLL_INTERVAL_MS = 2_000;

/** Maximum total drain-wait before DB_PURGE proceeds anyway (safety ceiling). */
const DRAIN_CEILING_MS = 30_000;

/** Environment variable name holding the 32-byte base64 key used for HMAC receipts (D6). */
const RECEIPT_KEY_ENV = 'ERASURE_RECEIPT_KEY';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  /**
   * Wall-clock budget for this invocation in milliseconds.
   * The orchestrator stops advancing states once the budget would be exceeded
   * and returns the current DeletionStatus for the caller to resume later.
   */
  timeBudgetMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** HMAC-SHA256 of the raw userId string, keyed with ERASURE_RECEIPT_KEY (D6). */
function computeSubjectHash(userId: string): string {
  const key = process.env[RECEIPT_KEY_ENV];
  if (!key) {
    throw new Error(`${RECEIPT_KEY_ENV} environment variable is not set`);
  }
  return createHmac('sha256', Buffer.from(key, 'base64'))
    .update(userId)
    .digest('hex');
}

/** Converts a raw DB row object to the DeletionStatus contract shape. */
function rowToStatus(row: Record<string, unknown>): DeletionStatus {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    state: row.state as AccountDeletionState,
    subjectHash: row.subject_hash as string,
    attempts: row.attempts as number,
    lastError: (row.last_error as string | null) ?? null,
    counts: (row.counts as Record<string, number>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

/**
 * Persists a state advance and returns the updated row as DeletionStatus.
 * Throws if the DB update fails.
 */
async function advanceState(
  admin: SupabaseClient,
  id: string,
  newState: AccountDeletionState,
  extra: Partial<{
    counts: Record<string, number>;
    lastError: string | null;
    completedAt: string;
    nullUserId: boolean;
  }> = {}
): Promise<DeletionStatus> {
  const patch: Record<string, unknown> = {
    state: newState,
    updated_at: new Date().toISOString(),
    last_error: extra.lastError ?? null,
  };
  if (extra.counts !== undefined) patch.counts = extra.counts;
  if (extra.completedAt !== undefined) patch.completed_at = extra.completedAt;
  if (extra.nullUserId === true) patch.user_id = null;

  const { data, error } = await admin
    .from('account_deletion_requests')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to advance deletion state to ${newState}: ${error?.message}`);
  }
  return rowToStatus(data as Record<string, unknown>);
}

/**
 * Waits for any RUNNING analysis runs tied to the user's cases to drain.
 * Cancels remaining runs/tasks when the ceiling or budget is exceeded (D3).
 */
async function drainRunningAnalysis(
  admin: SupabaseClient,
  userId: string,
  budgetEndMs: number
): Promise<void> {
  const drainEnd = Math.min(Date.now() + DRAIN_CEILING_MS, budgetEndMs);

  // Resolve the user's case IDs once
  const { data: casesData } = await admin.from('cases').select('id').eq('owner_id', userId);
  const caseIds = (casesData ?? []).map((c: { id: string }) => c.id);
  if (caseIds.length === 0) return;

  // Poll until RUNNING runs are gone or we hit the ceiling
  while (Date.now() < drainEnd) {
    const { data: runningRuns } = await admin
      .from('analysis_runs')
      .select('id')
      .eq('status', 'RUNNING')
      .in('case_id', caseIds);

    if (!runningRuns || runningRuns.length === 0) return;

    await new Promise<void>((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
  }

  // Ceiling reached — cancel remaining RUNNING runs and their tasks.
  // Clear the worker lease so analysis_tasks_lease_consistent stays satisfied.
  await admin
    .from('analysis_runs')
    .update({ status: 'CANCELLED', completed_at: new Date().toISOString() })
    .eq('status', 'RUNNING')
    .in('case_id', caseIds);

  const { data: runRows } = await admin
    .from('analysis_runs')
    .select('id')
    .in('case_id', caseIds);

  const runIds = (runRows ?? []).map((r: { id: string }) => r.id);
  if (runIds.length > 0) {
    await admin
      .from('analysis_tasks')
      .update({
        status: 'CANCELLED',
        claimed_at: null,
        claim_token: null,
        failure_reason: 'Account deletion in progress',
      })
      .in('status', ['QUEUED', 'RUNNING'])
      .in('run_id', runIds);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Idempotent, resumable account deletion state machine (D2, D3, D6).
 *
 * Flow per invocation:
 *   1. Load (or create) the account_deletion_requests row.
 *   2. Increment attempts before running any step.
 *   3. Execute only outstanding state transitions that fit in `timeBudgetMs`.
 *   4. Persist each state advance before proceeding to the next step.
 *   5. On error: record last_error on the row, leave state unchanged, rethrow.
 *
 * Guarantees:
 *   - Re-running at any state is safe; already-completed steps are skipped.
 *   - COMPLETE rows are returned immediately without re-running any step.
 *   - auth.admin.deleteUser runs at AUTH_DELETED → COMPLETE transition.
 *   - The erasure_receipts row is written and user_id is nulled only at COMPLETE (D6).
 *
 * @param userId      - Target user UUID (still valid at call time).
 * @param subjectHash - HMAC-SHA256 of userId; computed once at request creation via computeSubjectHash().
 * @param options     - `timeBudgetMs`: wall-clock limit for this invocation.
 * @param client      - Privileged Supabase client (defaults to getAdminClient()).
 */
export async function orchestratePurge(
  userId: string,
  subjectHash: string,
  options: OrchestratorOptions,
  client?: SupabaseClient
): Promise<DeletionStatus> {
  const admin = client ?? getAdminClient();
  const budgetEndMs = Date.now() + options.timeBudgetMs;

  /** True when there is at least `reserveMs` of budget remaining. */
  const hasBudget = (reserveMs = 500) => Date.now() + reserveMs < budgetEndMs;

  // ── 1. Load or create the deletion request row ──────────────────────────
  let status: DeletionStatus;

  {
    // First check for an active (non-COMPLETE) request
    const { data: existing, error: fetchError } = await admin
      .from('account_deletion_requests')
      .select('*')
      .eq('subject_hash', subjectHash)
      .neq('state', 'COMPLETE')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to load deletion request: ${fetchError.message}`);
    }

    if (existing) {
      status = rowToStatus(existing as Record<string, unknown>);
    } else {
      // Check for an already-COMPLETE record (user_id already nulled)
      const { data: completed } = await admin
        .from('account_deletion_requests')
        .select('*')
        .eq('subject_hash', subjectHash)
        .eq('state', 'COMPLETE')
        .maybeSingle();

      if (completed) {
        return rowToStatus(completed as Record<string, unknown>);
      }

      // Create a fresh REQUESTED row
      const { data: created, error: createError } = await admin
        .from('account_deletion_requests')
        .insert({
          user_id: userId,
          state: 'REQUESTED',
          subject_hash: subjectHash,
          attempts: 0,
          counts: {},
        })
        .select()
        .single();

      if (createError || !created) {
        throw new Error(`Failed to create deletion request: ${createError?.message}`);
      }
      status = rowToStatus(created as Record<string, unknown>);
    }
  }

  // Fast-path: already complete
  if (status.state === 'COMPLETE') return status;

  // ── 2. Increment attempts counter ────────────────────────────────────────
  {
    const { data: bumped, error: bumpError } = await admin
      .from('account_deletion_requests')
      .update({
        attempts: status.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', status.id)
      .select()
      .single();

    if (bumpError || !bumped) {
      throw new Error(`Failed to increment attempts: ${bumpError?.message}`);
    }
    status = rowToStatus(bumped as Record<string, unknown>);
  }

  // ── 3. Execute outstanding transitions within the time budget ────────────
  try {
    // ── REQUESTED → STORAGE_PURGED ─────────────────────────────────────────
    if (status.state === 'REQUESTED') {
      if (!hasBudget()) return status;
      await purgeUserStorage(userId, admin);
      status = await advanceState(admin, status.id, 'STORAGE_PURGED');
    }

    // ── STORAGE_PURGED → GMAIL_REVOKED ─────────────────────────────────────
    if (status.state === 'STORAGE_PURGED') {
      if (!hasBudget()) return status;
      await revokeGmailConnection(userId, admin);
      status = await advanceState(admin, status.id, 'GMAIL_REVOKED');
    }

    // ── GMAIL_REVOKED → DB_PURGED ──────────────────────────────────────────
    if (status.state === 'GMAIL_REVOKED') {
      if (!hasBudget()) return status;

      // D3: drain or cancel in-flight analysis runs before destroying DB rows
      await drainRunningAnalysis(admin, userId, budgetEndMs);

      // D1: the only authorised pathway for deleting audit rows
      const { data: counts, error: purgeError } = await admin.rpc('purge_user_account', {
        p_user: userId,
      });

      if (purgeError) {
        throw new Error(`purge_user_account RPC failed: ${purgeError.message}`);
      }

      status = await advanceState(admin, status.id, 'DB_PURGED', {
        counts: counts as Record<string, number>,
      });
    }

    // ── DB_PURGED → AUTH_DELETED ───────────────────────────────────────────
    if (status.state === 'DB_PURGED') {
      if (!hasBudget()) return status;

      // All user data is destroyed; safe to remove the auth identity
      const { error: authError } = await admin.auth.admin.deleteUser(userId);
      if (authError) {
        throw new Error(`auth.admin.deleteUser failed: ${authError.message}`);
      }
      status = await advanceState(admin, status.id, 'AUTH_DELETED');
    }

    // ── AUTH_DELETED → COMPLETE ────────────────────────────────────────────
    if (status.state === 'AUTH_DELETED') {
      // Do NOT gate this final transition on the time budget. The auth identity
      // has already been deleted, so the client can no longer re-authenticate
      // to resume. The receipt insert + state update are quick and must always
      // run once AUTH_DELETED is reached.
      const erasedAt = new Date().toISOString();

      // D6: write anonymised erasure receipt (HMAC only, zero PII)
      const { error: receiptError } = await admin.from('erasure_receipts').insert({
        subject_hash: subjectHash,
        counts: status.counts,
        erased_at: erasedAt,
      });

      if (receiptError) {
        throw new Error(`Failed to write erasure receipt: ${receiptError.message}`);
      }

      // D6: null user_id on the request row, mark COMPLETE
      status = await advanceState(admin, status.id, 'COMPLETE', {
        completedAt: erasedAt,
        nullUserId: true,
      });
    }
  } catch (err) {
    // Surface the error on the request row for operator visibility
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('account_deletion_requests')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('id', status.id);

    throw err;
  }

  return status;
}

// ---------------------------------------------------------------------------
// Re-export helpers consumed by the route layer
// ---------------------------------------------------------------------------
export { computeSubjectHash };
