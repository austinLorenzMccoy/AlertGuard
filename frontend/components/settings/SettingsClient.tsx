"use client";

import { FleetProfileForm } from "@/components/settings/FleetProfileForm";
import { ManagerList, type Manager } from "@/components/settings/ManagerList";
import {
  NotificationPrefs,
  type NotificationPrefsState,
} from "@/components/settings/NotificationPrefs";
import type { Role } from "@/lib/types";

export interface SettingsClientProps {
  initialFleetName: string;
  initialLogoUrl: string;
  initialManagers: Manager[];
  initialNotificationPrefs: NotificationPrefsState;
  currentUserRole: Role;
  currentUserFleetId: string | null;
}

/**
 * Settings screen (PRD Section 8.8). Composes the three settings panels.
 * Fleet-profile save and notification-prefs are local-state-only in this
 * build (no backend wired) — see README for what a real persistence layer
 * would hook into. The manager list's "promote user" invite, however, calls
 * a real Server Action in real mode (see `app/(dashboard)/settings/actions.ts`
 * and `ManagerList`'s own doc comment) — demo mode keeps the original
 * local-state-only behavior unchanged.
 */
export function SettingsClient({
  initialFleetName,
  initialLogoUrl,
  initialManagers,
  initialNotificationPrefs,
  currentUserRole,
  currentUserFleetId,
}: SettingsClientProps) {
  return (
    <div className="flex flex-col gap-6">
      <FleetProfileForm
        initialName={initialFleetName}
        initialLogoUrl={initialLogoUrl}
        onSave={() => {}}
      />
      <ManagerList
        initialManagers={initialManagers}
        currentUserRole={currentUserRole}
        currentUserFleetId={currentUserFleetId}
      />
      <NotificationPrefs initialPrefs={initialNotificationPrefs} />
    </div>
  );
}
