import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * OAuth callback Route Handler (PRD Section 8.1). Supabase redirects here
 * with `?code=...` after Google sign-in; this exchanges the code for a
 * session (writing the session cookie, since Route Handlers — unlike Server
 * Components — are allowed to write cookies) and sends the visitor on to
 * `/overview`. `app/(dashboard)/layout.tsx` does the real role check from
 * there and bounces non-fleet-managers to `/download`.
 *
 * MANUAL SETUP STEP (cannot be done from code): this route's full URL —
 * `https://<your-domain>/auth/callback` in production, and
 * `http://localhost:3000/auth/callback` for local dev — must be added to
 * Supabase's dashboard under Authentication -> URL Configuration ->
 * Redirect URLs. This is DIFFERENT from the Google Cloud Console OAuth
 * client's redirect URI, which should already correctly point at Supabase's
 * own `https://<project-ref>.supabase.co/auth/v1/callback` — do not change
 * that one; it's not this app's callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  return NextResponse.redirect(`${origin}/overview`);
}
