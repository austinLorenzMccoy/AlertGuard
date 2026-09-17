import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getMiddlewareRedirect } from "@/lib/auth/middleware-logic";

/**
 * Standard `@supabase/ssr` Next.js middleware pattern: refreshes the auth
 * session cookie on every request (`getUser()` triggers a token refresh if
 * the access token is stale) and copies the refreshed cookies onto the
 * response, so sessions don't silently expire between visits. Also gates
 * unauthenticated visitors out of the dashboard routes (PRD Section 8.1) —
 * see `lib/auth/middleware-logic.ts` for the actual redirect decision, kept
 * pure and unit-tested there rather than in this wiring.
 *
 * In demo mode (no Supabase env vars configured) this middleware treats
 * every request as authenticated — no user is ever unauthenticated w.r.t.
 * the demo data source, and there is no real Supabase project to call.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = getMiddlewareRedirect(!!user, request.nextUrl.pathname);
  if (redirectTo) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = redirectTo;
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, image optimization files,
     * favicon, and other public files with an extension — the standard
     * Next.js middleware matcher pattern. This still covers all the
     * dashboard routes plus every other app route (needed so the session
     * cookie keeps refreshing while browsing public pages like /login too).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
