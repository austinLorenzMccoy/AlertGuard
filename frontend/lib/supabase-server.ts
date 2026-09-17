import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * The shape of the two operations `@supabase/ssr` needs from a cookie store:
 * read every cookie, and (optionally) write updated ones back. This is a
 * strict subset of `next/headers`' `cookies()` return value, kept as our own
 * interface so the client-construction logic below can be unit-tested with a
 * plain object instead of a real Next.js request context (`next/headers`
 * only works inside an actual request — see `createServerSupabaseClient`
 * below, which is the one place that touches it).
 */
export interface ServerCookieStore {
  getAll(): { name: string; value: string }[];
  set?(name: string, value: string, options: Record<string, unknown>): void;
}

/**
 * Builds the `getAll`/`setAll` cookie adapter `@supabase/ssr` needs, given
 * our own `ServerCookieStore` interface. Split out from
 * `buildServerSupabaseClient` so both the "cookies write successfully"
 * (Route Handler) and "cookie write throws" (Server Component) branches are
 * directly unit-testable, without having to coax supabase-js's internals
 * into calling `setAll`.
 *
 * Server Components (unlike Server Actions, Route Handlers and Middleware)
 * are not allowed to write cookies — Next.js throws if you try. Per the
 * standard `@supabase/ssr` Next.js pattern, that write attempt is swallowed:
 * middleware is responsible for actually refreshing the session cookie, so a
 * failed write from within a Server Component render is safe to ignore.
 */
export function buildCookieAdapter(cookieStore: ServerCookieStore): CookieMethodsServer {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set?.(name, value, options);
        });
      } catch {
        // Called from a Server Component render, which can't write cookies.
        // Safe to ignore — middleware.ts refreshes the session cookie.
      }
    },
  };
}

/**
 * Pure, injectable client-construction logic: given a cookie store and the
 * Supabase project credentials, returns a session-aware Supabase client.
 */
export function buildServerSupabaseClient(
  cookieStore: ServerCookieStore,
  url: string,
  anonKey: string,
): SupabaseClient {
  return createServerClient(url, anonKey, { cookies: buildCookieAdapter(cookieStore) });
}

/**
 * Wiring-only: pulls the request's cookie jar from `next/headers` and the
 * Supabase project credentials from env, then delegates to
 * `buildServerSupabaseClient` for the actual client construction. This is
 * the function `app/**` Server Components / Route Handlers should call to
 * get a session-bound Supabase client.
 *
 * `next/headers`' `cookies()` is synchronous on the Next.js version pinned
 * in package.json (14.2.x) — this stays a plain function, not `async`, to
 * match. If Next.js is upgraded to a version where `cookies()` becomes
 * async, only this one line needs an `await`.
 *
 * Throws if the Supabase env vars aren't configured — callers (see
 * `lib/auth/fleet-context.ts`) only reach this in non-demo mode, where the
 * vars are guaranteed present.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "See README.md for required env vars.",
    );
  }

  const cookieStore = cookies();
  return buildServerSupabaseClient(cookieStore, url, anonKey);
}
