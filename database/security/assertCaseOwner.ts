import type { SupabaseClient } from '@supabase/supabase-js';

export interface CaseOwnershipResult {
  id: string;
  displayId: string;
  title: string;
  ownerId: string;
}

export interface AssertCaseOwnerParams {
  db: SupabaseClient;
  caseId: string;
  userId: string;
}

export type AssertCaseOwnerOutcome =
  | { ok: true; caseRow: CaseOwnershipResult }
  | { ok: false; response: Response };

/**
 * assertCaseOwner — Spec §3.4, §7.5 & P1-0 Security Guard
 * 
 * First importer action:
 * Called before reading a connection or calling Gmail. Resolves to 404 NOT_FOUND
 * without revealing whether another user's case exists (no cross-tenant leakage).
 * Supports both named object arguments ({ db, caseId, userId }) and positional arguments (db, caseId, userId).
 */
export async function assertCaseOwner(
  params: AssertCaseOwnerParams
): Promise<AssertCaseOwnerOutcome>;
export async function assertCaseOwner(
  db: SupabaseClient,
  caseId: string,
  userId: string
): Promise<AssertCaseOwnerOutcome>;
export async function assertCaseOwner(
  arg1: AssertCaseOwnerParams | SupabaseClient,
  arg2?: string,
  arg3?: string
): Promise<AssertCaseOwnerOutcome> {
  let db: SupabaseClient;
  let caseId: string;
  let userId: string;

  if (arg2 !== undefined && arg3 !== undefined) {
    db = arg1 as SupabaseClient;
    caseId = arg2;
    userId = arg3;
  } else {
    const params = arg1 as AssertCaseOwnerParams;
    db = params.db;
    caseId = params.caseId;
    userId = params.userId;
  }

  const { data, error } = await db
    .from('cases')
    .select('id, display_id, title, owner_id')
    .eq('id', caseId)
    .eq('owner_id', userId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: `Case ${caseId} not found`,
          },
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  return {
    ok: true,
    caseRow: {
      id: data.id,
      displayId: data.display_id,
      title: data.title,
      ownerId: data.owner_id,
    },
  };
}
