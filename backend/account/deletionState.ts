import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns true when the user has an active (non-COMPLETE) account deletion
 * request, which freezes every mutating API route (D3).
 *
 * If the helper function is missing from a database that has not yet applied
 * migration 008a, the check fails open so normal writes keep working. Any other
 * database error fails closed: the deletion state is unknown, so writes are
 * blocked rather than risking data being recreated mid-purge.
 */
export async function isDeletionPending(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await admin.rpc('is_deletion_pending', {
    p_user_id: userId,
  });

  if (error) {
    const missingFunction =
      error.code === 'PGRST202' || /function .* does not exist/i.test(error.message);
    if (missingFunction) {
      console.warn(
        '[Account] is_deletion_pending() is unavailable; apply migration 008a. Allowing write.'
      );
      return false;
    }
    console.error('[Account] Deletion-pending check failed; blocking write:', error.message);
    return true;
  }

  return data === true;
}
