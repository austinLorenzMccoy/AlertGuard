"use client";

import { useState, type FormEvent } from "react";
import { promoteUser, type PromotableRole, type PromoteUserErrorReason } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/Button";
import { isValidEmail } from "@/lib/logic/format";
import type { Role } from "@/lib/types";

export interface Manager {
  id: string;
  email: string;
}

export interface ManagerListProps {
  initialManagers: Manager[];
  /** The signed-in fleet manager/admin's own role — gates whether "Admin" is even offered as an option. */
  currentUserRole: Role;
  /** The signed-in caller's own fleet_id (unused directly today — the backend forces a fleet_manager caller's own fleet_id server-side — kept for display/future use). */
  currentUserFleetId: string | null;
}

/**
 * True when this build is wired to a real Supabase project (same check used
 * throughout this frontend — see `lib/data/get-data-source.ts` and
 * `components/login/LoginClient.tsx` — mirrored here because this is a
 * client component and can only see `NEXT_PUBLIC_*` env vars).
 */
function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

const ERROR_MESSAGES: Record<PromoteUserErrorReason, string> = {
  user_not_found:
    "This person needs to sign in to AlertGuard at least once before they can be promoted.",
  cannot_modify_own_role: "You cannot change your own role.",
  forbidden: "You don't have permission to assign that role.",
  fleet_id_required: "Enter a fleet ID for this fleet manager.",
  profile_not_ready: "This account isn't fully set up yet. Try again shortly.",
  invalid_request: "Enter a valid email and role.",
  error: "Something went wrong. Please try again.",
};

/** Manager account list + invite/promote (PRD Section 8.8). */
export function ManagerList({ initialManagers, currentUserRole, currentUserFleetId }: ManagerListProps) {
  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PromotableRole>("fleet_manager");
  const [fleetId, setFleetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const demoMode = !isSupabaseConfigured();
  const canOfferAdmin = currentUserRole === "admin";
  const needsFleetIdInput = canOfferAdmin; // a fleet_manager caller's own fleet_id is forced server-side; only an admin caller ever needs to say which fleet.

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleDemoInvite = () => {
    setManagers((prev) => [...prev, { id: `pending-${prev.length}-${email}`, email }]);
    setEmail("");
  };

  const handleRealInvite = async () => {
    if (canOfferAdmin && role === "fleet_manager" && !fleetId.trim()) {
      setError(ERROR_MESSAGES.fleet_id_required);
      return;
    }

    setSubmitting(true);
    try {
      const result = await promoteUser({
        email,
        role,
        fleetId: needsFleetIdInput ? fleetId.trim() || null : undefined,
      });

      if (result.status === "success") {
        setManagers((prev) => [...prev, { id: result.targetId, email }]);
        setSuccess(`${email} promoted to ${result.role === "admin" ? "admin" : "fleet manager"}.`);
        setEmail("");
        setFleetId("");
      } else {
        setError(ERROR_MESSAGES[result.reason]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (demoMode) {
      handleDemoInvite();
      return;
    }

    void handleRealInvite();
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-ink-2 p-4">
      <h2 className="font-display text-lg text-fog">Manager accounts</h2>
      <ul className="flex flex-col gap-1">
        {managers.map((m) => (
          <li key={m.id} className="text-sm text-fog">
            {m.email}
          </li>
        ))}
        {managers.length === 0 && <li className="text-sm text-mist">No managers yet.</li>}
      </ul>
      <form onSubmit={handleInvite} noValidate className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="invite-email">
          Invite manager
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@fleet.com"
            className="min-h-touch rounded-btn border border-line bg-ink-3 px-3 text-fog"
          />
        </label>
        {!demoMode && (
          <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="invite-role">
            Role
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as PromotableRole)}
              className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
            >
              <option value="fleet_manager">Fleet manager</option>
              {canOfferAdmin && <option value="admin">Admin</option>}
            </select>
          </label>
        )}
        {!demoMode && needsFleetIdInput && (
          <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="invite-fleet-id">
            Fleet ID{role === "fleet_manager" ? "" : " (optional)"}
            <input
              id="invite-fleet-id"
              type="text"
              value={fleetId}
              onChange={(e) => setFleetId(e.target.value)}
              placeholder={currentUserFleetId ?? "fleet-id"}
              className="min-h-touch rounded-btn border border-line bg-ink-3 px-3 text-fog"
            />
          </label>
        )}
        <Button type="submit" variant="secondary" disabled={submitting}>
          {submitting ? "Sending..." : "Send invite"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-brake">
          {error}
        </p>
      )}
      {success && <p className="text-xs text-fog">{success}</p>}
    </div>
  );
}
