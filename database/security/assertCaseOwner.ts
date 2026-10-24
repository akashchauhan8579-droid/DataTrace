import type { SupabaseClient } from '@supabase/supabase-js';

export interface CaseOwnershipResult {
  id: string;
  displayId: string;
  title: string;
  ownerId: string;
}

/**
 * assertCaseOwner — Spec §3.4 & §7.5
 * Called first in every handler that takes a case or an object inside a case.
 * Resolves to 404 NOT_FOUND response when the caller does not own the case,
 * ensuring no existence leakage across case boundaries.
 */
export async function assertCaseOwner(
  db: SupabaseClient,
  caseId: string,
  userId: string
): Promise<{ ok: true; caseRow: CaseOwnershipResult } | { ok: false; response: Response }> {
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
