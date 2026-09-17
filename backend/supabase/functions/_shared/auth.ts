// Shared caller-authorization helpers.
//
// PRD constraint (Section 13): "All Edge Functions validate the caller's JWT
// before acting, except internal function-to-function calls which use the
// service role and are never publicly invokable directly."
//
// Two call patterns exist in this backend:
//   1. Client -> Edge Function (e.g. mobile app calling redeem-reward): the
//      caller must present a valid Supabase-issued JWT in the Authorization
//      header. Verifying the JWT signature itself is delegated to the
//      Supabase client (`supabase.auth.getUser(token)`), which is a Deno/
//      network-bound operation and lives in the `index.ts` wiring layer, not
//      here. What lives here is the header-parsing and the internal-call
//      shared-secret check, both pure string logic.
//   2. Edge Function -> Edge Function (e.g. verify-session chaining into
//      calculate-reward): the caller is another Edge Function invoked with
//      the service-role key. We additionally require a shared secret header
//      (`x-internal-secret`) so that even a leaked anon/authenticated JWT
//      cannot be used to hit the "internal-only" surface of a function, and
//      so the function can distinguish "trusted internal call" from
//      "an authenticated end-user hit this endpoint directly".

export const INTERNAL_SECRET_HEADER = "x-internal-secret";

export interface HeaderLookup {
  get(name: string): string | null | undefined;
}

/** Normalizes any header-bag shape (plain object or Headers-like) into a lookup. */
export function toHeaderLookup(
  headers: Record<string, string | null | undefined> | HeaderLookup
): HeaderLookup {
  if (typeof (headers as HeaderLookup).get === "function") {
    return headers as HeaderLookup;
  }
  const record = headers as Record<string, string | null | undefined>;
  return {
    get(name: string) {
      const key = Object.keys(record).find(
        (k) => k.toLowerCase() === name.toLowerCase()
      );
      return key ? record[key] : undefined;
    },
  };
}

/**
 * Extracts the bearer token from an `Authorization: Bearer <token>` header.
 * Note: `authHeader.trim()` runs before the regex, so if the header is
 * "Bearer" followed only by whitespace, that trailing whitespace is already
 * gone by the time `\s+(.+)$` is evaluated and the match fails outright
 * (falling through to the `!match` branch below) — there is no reachable
 * case where the match succeeds with an empty/whitespace-only capture group.
 */
export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  return match[1].trim();
}

/**
 * True if this request carries the correct internal shared secret, meaning it
 * is a trusted function-to-function call and does not need end-user JWT
 * validation.
 */
export function isInternalCall(
  headers: Record<string, string | null | undefined> | HeaderLookup,
  expectedSecret: string | null | undefined
): boolean {
  if (!expectedSecret) return false;
  const lookup = toHeaderLookup(headers);
  const provided = lookup.get(INTERNAL_SECRET_HEADER);
  if (!provided) return false;
  return timingSafeEqual(provided, expectedSecret);
}

/** Constant-time-ish string comparison to avoid trivial timing side-channels. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface JwtVerifier {
  /** Resolves with the caller's user id if the token is valid, else null. */
  verify(token: string): Promise<{ userId: string } | null>;
}

export interface AuthorizationResult {
  authorized: boolean;
  isInternal: boolean;
  userId?: string;
  reason?: "missing_token" | "invalid_token" | "ok";
}

/**
 * Central authorization gate used by every Edge Function's index.ts:
 *   - internal shared-secret present & correct -> authorized as internal call
 *   - otherwise -> require & verify a bearer JWT
 */
export async function authorizeCaller(
  headers: Record<string, string | null | undefined> | HeaderLookup,
  deps: { internalSecret: string | null | undefined; jwtVerifier: JwtVerifier }
): Promise<AuthorizationResult> {
  if (isInternalCall(headers, deps.internalSecret)) {
    return { authorized: true, isInternal: true, reason: "ok" };
  }

  const lookup = toHeaderLookup(headers);
  const token = extractBearerToken(lookup.get("authorization"));
  if (!token) {
    return { authorized: false, isInternal: false, reason: "missing_token" };
  }

  const result = await deps.jwtVerifier.verify(token);
  if (!result) {
    return { authorized: false, isInternal: false, reason: "invalid_token" };
  }

  return {
    authorized: true,
    isInternal: false,
    userId: result.userId,
    reason: "ok",
  };
}
