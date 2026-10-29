import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken } from '../integrations/tokenVault';
import { getAdminClient } from '../api/client';

/** Google's token revocation endpoint (RFC 7009). */
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GmailRevokeResult {
  /** Whether the gmail_connections row was deleted from the DB. Always true on success. */
  revoked: boolean;
  /**
   * Whether a revocation request was sent to Google's OAuth endpoint.
   * False when there was no connection row, the token could not be decrypted,
   * or the Google call threw (best-effort: DB row is still deleted).
   */
  googleRevokeAttempted: boolean;
}

/**
 * Revokes the user's Gmail connection:
 *  1. Reads the gmail_connections row for the user.
 *  2. Decrypts the refresh token and POSTs it to Google's revocation endpoint (best-effort).
 *     Any error from Google is silently swallowed — the account purge must not stall
 *     because an OAuth token was already expired or Google is unavailable.
 *  3. Deletes the gmail_connections row unconditionally.
 *
 * Idempotent: if no row exists, returns { revoked: true, googleRevokeAttempted: false }.
 *
 * @param userId - Target user UUID.
 * @param client - Privileged Supabase client (defaults to getAdminClient()).
 */
export async function revokeGmailConnection(
  userId: string,
  client?: SupabaseClient
): Promise<GmailRevokeResult> {
  const admin = client ?? getAdminClient();

  // 1. Fetch connection row (select only what we need; never expose refresh_token_enc elsewhere)
  const { data: conn, error: fetchError } = await admin
    .from('gmail_connections')
    .select('refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to read Gmail connection for revocation: ${fetchError.message}`);
  }

  let googleRevokeAttempted = false;

  if (conn?.refresh_token_enc) {
    // 2. Decrypt and attempt Google revocation (best-effort — never throw)
    try {
      const refreshToken = decryptToken(conn.refresh_token_enc);
      const body = new URLSearchParams({ token: refreshToken });
      await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      googleRevokeAttempted = true;
    } catch {
      // Best-effort: swallow Google-side errors (expired token, network failure, etc.)
      // The DB row is still deleted below to ensure local data is always purged.
      googleRevokeAttempted = true; // attempt was made even if it failed
    }
  }

  // 3. Delete the row unconditionally (idempotent — no error if already gone)
  const { error: deleteError } = await admin
    .from('gmail_connections')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`Failed to delete Gmail connection row: ${deleteError.message}`);
  }

  return { revoked: true, googleRevokeAttempted };
}
