"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Role } from "@/lib/types";

export type PromotableRole = Extract<Role, "fleet_manager" | "admin">;

export interface PromoteUserInput {
  email: string;
  role: PromotableRole;
  fleetId?: string | null;
}

/**
 * Mirrors `manage-user-role`'s Edge Function `reason` strings 1:1 (see
 * backend/supabase/functions/_shared/roles.ts), plus a catch-all `"error"`
 * for anything this Server Action itself can't classify (missing session,
 * network failure, an unexpected HTTP status/body shape) — so the UI can
 * show a specific, honest message for every case the backend documents,
 * without ever having to guess.
 */
export type PromoteUserErrorReason =
  | "cannot_modify_own_role"
  | "user_not_found"
  | "profile_not_ready"
  | "forbidden"
  | "fleet_id_required"
  | "invalid_request"
  | "error";

export type PromoteUserResult =
  | { status: "success"; targetId: string; role: PromotableRole; fleetId: string | null }
  | { status: "error"; reason: PromoteUserErrorReason };

const KNOWN_ERROR_REASONS = new Set<PromoteUserErrorReason>([
  "cannot_modify_own_role",
  "user_not_found",
  "profile_not_ready",
  "forbidden",
  "fleet_id_required",
  "invalid_request",
]);

/**
 * Server Action backing the Settings page's "promote user" form (real mode
 * only — see `components/settings/ManagerList.tsx`, which never calls this
 * in demo mode). Never touches the Supabase service-role key: it gets the
 * *caller's own* session-bound access token from `lib/supabase-server.ts`
 * (same cookie-based session middleware already refreshes) and forwards it
 * as a normal end-user `Authorization: Bearer` header to the
 * `manage-user-role` Edge Function, which does its own JWT verification and
 * authorization — this action is a thin server-to-server relay, not a
 * privileged client.
 */
export async function promoteUser(input: PromoteUserInput): Promise<PromoteUserResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { status: "error", reason: "error" };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { status: "error", reason: "forbidden" };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/manage-user-role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: input.email, role: input.role, fleet_id: input.fleetId ?? null }),
    });
  } catch {
    return { status: "error", reason: "error" };
  }

  const body = await response.json().catch(() => null);

  if (response.ok && body?.status === "success") {
    return {
      status: "success",
      targetId: body.targetId,
      role: body.role,
      fleetId: body.fleetId ?? null,
    };
  }

  const reason = body?.reason;
  if (typeof reason === "string" && KNOWN_ERROR_REASONS.has(reason as PromoteUserErrorReason)) {
    return { status: "error", reason: reason as PromoteUserErrorReason };
  }

  return { status: "error", reason: "error" };
}

export interface PromotableUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  fleetId: string | null;
}

export type ListPromotableUsersResult =
  | { status: "success"; users: PromotableUser[] }
  | { status: "error"; reason: "forbidden" | "error" };

/**
 * Server Action backing the Settings page's user picker (real mode only —
 * see `components/settings/ManagerList.tsx`). Same thin-relay shape as
 * `promoteUser`: forwards the caller's own session token to the
 * `list-promotable-users` Edge Function, which does its own JWT verification
 * and role scoping — never touches the Supabase service-role key here.
 */
export async function listPromotableUsers(): Promise<ListPromotableUsersResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { status: "error", reason: "error" };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { status: "error", reason: "forbidden" };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/list-promotable-users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return { status: "error", reason: "error" };
  }

  const body = await response.json().catch(() => null);

  if (response.ok && body?.status === "success" && Array.isArray(body.users)) {
    return { status: "success", users: body.users as PromotableUser[] };
  }

  return { status: "error", reason: body?.reason === "forbidden" ? "forbidden" : "error" };
}
