import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key';

export interface ReauthResult {
  ok: boolean;
  /** Internal diagnostic only. Never returned to the client. */
  reason?: string;
}

/**
 * Server-side password re-authentication for irreversible account deletion (D4).
 *
 * The user's email is read with the service-role client, then a short-lived
 * anon-key client performs `signInWithPassword`. The resulting session is never
 * persisted or returned; only a boolean is handed back to the route.
 */
export async function verifyPasswordForUser(
  userId: string,
  password: string,
  admin: SupabaseClient
): Promise<ReauthResult> {
  if (!password) {
    return { ok: false, reason: 'Password is empty' };
  }

  let email: string | undefined;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return { ok: false, reason: error?.message ?? 'User not found' };
    }
    email = data.user.email ?? undefined;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  if (!email) {
    return { ok: false, reason: 'Account has no email identity' };
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { ok: false, reason: signInError.message };
  }

  // Do not keep the re-auth session around longer than this check.
  try {
    await anon.auth.signOut();
  } catch {
    // Best effort only.
  }

  return { ok: true };
}
