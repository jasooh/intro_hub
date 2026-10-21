import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client with no user session, for data anyone can see (RLS "anon").
 * Cached functions (src/lib/public-data.ts) use it because they can't read cookies.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
