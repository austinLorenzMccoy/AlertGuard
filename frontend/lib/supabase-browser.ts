import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client, paired with `lib/supabase-server.ts`'s
 * `createServerSupabaseClient`. Used only from client components (currently
 * just `components/login/LoginClient.tsx`, to kick off
 * `signInWithOAuth`) — it persists the session to cookies (not
 * localStorage), so the server client above can read the same session.
 *
 * Throws if the Supabase env vars aren't configured, matching
 * `lib/supabase-client.ts`'s `createRawSupabaseClient` — callers only reach
 * this when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are
 * set (see `LoginClient`'s demo-mode check).
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "See README.md for required env vars.",
    );
  }

  return createBrowserClient(url, anonKey);
}
