import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { demoSeed } from "@/lib/data/demo-seed";
import { createLiveDataSource, createSupabaseDataSource } from "@/lib/supabase-client";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { AlertGuardDataSource } from "@/lib/data/data-source";

function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * Bare-anon-key data source: no session attached, so Row Level Security
 * policies that key off `auth.uid()` see no user and return zero rows for
 * everything. Falls back to the in-memory demo seed when Supabase env vars
 * aren't configured, so `npm run dev` is browsable without a real backend
 * (see README "Demo mode"). Kept for any call site that genuinely has no
 * request/session context; `app/**` Server Components should use
 * `getServerDataSource()` below instead, so RLS-authorized queries work.
 */
export function getDataSource(): AlertGuardDataSource {
  if (isDemoMode()) {
    return createFakeDataSource(demoSeed);
  }
  return createLiveDataSource();
}

/**
 * Single place `app/(dashboard)/**` Server Components call to get a data
 * source. Same demo-mode fallback as `getDataSource()`, but in real mode
 * builds the `AlertGuardDataSource` from the *session-bound* server client
 * (`lib/supabase-server.ts`) instead of the bare anon-key client, so
 * RLS-authorized queries actually return the signed-in fleet manager's rows
 * instead of silently empty results.
 */
export function getServerDataSource(): AlertGuardDataSource {
  if (isDemoMode()) {
    return createFakeDataSource(demoSeed);
  }
  return createSupabaseDataSource(createServerSupabaseClient());
}
