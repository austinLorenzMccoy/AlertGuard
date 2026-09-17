import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { demoSeed } from "@/lib/data/demo-seed";
import { createLiveDataSource } from "@/lib/supabase-client";
import type { AlertGuardDataSource } from "@/lib/data/data-source";

/**
 * Single place `app/**` pages call to get a data source. Falls back to the
 * in-memory demo seed when Supabase env vars aren't configured, so
 * `npm run dev` is browsable without a real backend (see README "Demo mode").
 */
export function getDataSource(): AlertGuardDataSource {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return createLiveDataSource();
  }
  return createFakeDataSource(demoSeed);
}
