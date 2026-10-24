import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser Supabase client — used for AUTH ONLY.
// Never query database tables or storage from frontend directly.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
