"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { isValidEmail } from "@/lib/logic/format";

export interface Manager {
  id: string;
  email: string;
}

export interface ManagerListProps {
  initialManagers: Manager[];
}

/** Manager account list + invite (PRD Section 8.8). */
export function ManagerList({ initialManagers }: ManagerListProps) {
  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setManagers((prev) => [...prev, { id: `pending-${prev.length}-${email}`, email }]);
    setEmail("");
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
        <Button type="submit" variant="secondary">
          Send invite
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-brake">
          {error}
        </p>
      )}
    </div>
  );
}
