"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  listPromotableUsers,
  promoteUser,
  type PromotableRole,
  type PromotableUser,
  type PromoteUserErrorReason,
} from "@/app/(dashboard)/settings/actions";
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

  const [candidates, setCandidates] = useState<PromotableUser[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [candidateRoles, setCandidateRoles] = useState<Record<string, PromotableRole>>({});
  const [candidateFleetIds, setCandidateFleetIds] = useState<Record<string, string>>({});
  const [candidateSubmitting, setCandidateSubmitting] = useState<Record<string, boolean>>({});
  const [candidateErrors, setCandidateErrors] = useState<Record<string, string>>({});

  const demoMode = !isSupabaseConfigured();
  const canOfferAdmin = currentUserRole === "admin";
  const needsFleetIdInput = canOfferAdmin; // a fleet_manager caller's own fleet_id is forced server-side; only an admin caller ever needs to say which fleet.

  // Populates the "signed-up accounts" picker so an admin/fleet_manager can
  // browse and promote instead of typing an email blind. Demo mode keeps the
  // original local-state-only behavior — there is no real backend to ask.
  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    setCandidatesLoading(true);
    listPromotableUsers().then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setCandidates(result.users);
        setCandidatesError(null);
      } else {
        setCandidatesError("Couldn't load signed-up accounts.");
      }
      setCandidatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  const handlePromoteCandidate = async (candidate: PromotableUser) => {
    const candidateRole: PromotableRole = canOfferAdmin
      ? (candidateRoles[candidate.id] ?? "fleet_manager")
      : "fleet_manager";
    const candidateFleetId = candidateFleetIds[candidate.id] ?? "";

    if (canOfferAdmin && candidateRole === "fleet_manager" && !candidateFleetId.trim()) {
      setCandidateErrors((prev) => ({ ...prev, [candidate.id]: ERROR_MESSAGES.fleet_id_required }));
      return;
    }

    setCandidateSubmitting((prev) => ({ ...prev, [candidate.id]: true }));
    setCandidateErrors((prev) => ({ ...prev, [candidate.id]: "" }));

    try {
      const result = await promoteUser({
        email: candidate.email,
        role: candidateRole,
        fleetId: canOfferAdmin ? candidateFleetId.trim() || null : undefined,
      });

      if (result.status === "success") {
        setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
        if (result.role === "fleet_manager") {
          setManagers((prev) => [...prev, { id: result.targetId, email: candidate.email }]);
        }
        setSuccess(`${candidate.email} promoted to ${result.role === "admin" ? "admin" : "fleet manager"}.`);
      } else {
        setCandidateErrors((prev) => ({ ...prev, [candidate.id]: ERROR_MESSAGES[result.reason] }));
      }
    } finally {
      setCandidateSubmitting((prev) => ({ ...prev, [candidate.id]: false }));
    }
  };

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
      {!demoMode && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-mist">Signed-up accounts</h3>
          {candidatesLoading && <p className="text-xs text-mist">Loading accounts...</p>}
          {candidatesError && (
            <p role="alert" className="text-xs text-brake">
              {candidatesError}
            </p>
          )}
          {!candidatesLoading && !candidatesError && candidates.length === 0 && (
            <p className="text-xs text-mist">No accounts available to promote.</p>
          )}
          <ul className="flex flex-col gap-2">
            {candidates.map((c) => {
              const candidateRole = canOfferAdmin ? (candidateRoles[c.id] ?? "fleet_manager") : "fleet_manager";
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-end gap-2 rounded-btn border border-line bg-ink-3 p-2"
                >
                  <div className="flex flex-col text-sm text-fog">
                    <span>{c.fullName ?? c.email}</span>
                    <span className="text-xs text-mist">
                      {c.email} · {c.role}
                    </span>
                  </div>
                  {canOfferAdmin && (
                    <select
                      aria-label={`Role for ${c.email}`}
                      value={candidateRole}
                      onChange={(e) =>
                        setCandidateRoles((prev) => ({
                          ...prev,
                          [c.id]: e.target.value as PromotableRole,
                        }))
                      }
                      className="min-h-touch rounded-btn border border-line bg-ink-2 px-2 text-fog"
                    >
                      <option value="fleet_manager">Fleet manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  {canOfferAdmin && candidateRole === "fleet_manager" && (
                    <input
                      aria-label={`Fleet ID for ${c.email}`}
                      type="text"
                      value={candidateFleetIds[c.id] ?? ""}
                      onChange={(e) =>
                        setCandidateFleetIds((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder={currentUserFleetId ?? "fleet-id"}
                      className="min-h-touch rounded-btn border border-line bg-ink-2 px-3 text-fog"
                    />
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={candidateSubmitting[c.id]}
                    onClick={() => handlePromoteCandidate(c)}
                  >
                    {candidateSubmitting[c.id] ? "Promoting..." : "Promote"}
                  </Button>
                  {candidateErrors[c.id] && (
                    <p role="alert" className="w-full text-xs text-brake">
                      {candidateErrors[c.id]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
