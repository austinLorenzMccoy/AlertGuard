"use client";

import { FleetProfileForm } from "@/components/settings/FleetProfileForm";
import { ManagerList, type Manager } from "@/components/settings/ManagerList";
import {
  NotificationPrefs,
  type NotificationPrefsState,
} from "@/components/settings/NotificationPrefs";

export interface SettingsClientProps {
  initialFleetName: string;
  initialLogoUrl: string;
  initialManagers: Manager[];
  initialNotificationPrefs: NotificationPrefsState;
}

/**
 * Settings screen (PRD Section 8.8). Composes the three settings panels.
 * Save/invite handlers are local-state-only in this build (no backend
 * wired) — see README for what a real persistence layer would hook into.
 */
export function SettingsClient({
  initialFleetName,
  initialLogoUrl,
  initialManagers,
  initialNotificationPrefs,
}: SettingsClientProps) {
  return (
    <div className="flex flex-col gap-6">
      <FleetProfileForm
        initialName={initialFleetName}
        initialLogoUrl={initialLogoUrl}
        onSave={() => {}}
      />
      <ManagerList initialManagers={initialManagers} />
      <NotificationPrefs initialPrefs={initialNotificationPrefs} />
    </div>
  );
}
