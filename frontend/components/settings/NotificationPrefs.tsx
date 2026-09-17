"use client";

import { useState } from "react";
import type { DrowsinessSeverity } from "@/lib/types";

export interface NotificationChannelPrefs {
  sms: boolean;
  email: boolean;
}

export type NotificationPrefsState = Record<DrowsinessSeverity, NotificationChannelPrefs>;

const SEVERITIES: { key: DrowsinessSeverity; label: string }[] = [
  { key: "critical", label: "Critical events" },
  { key: "vibration", label: "Vibration-severity events" },
  { key: "soft", label: "Soft events" },
];

export interface NotificationPrefsProps {
  initialPrefs: NotificationPrefsState;
}

/** Notification preferences (PRD Section 8.8): which events trigger SMS/email. */
export function NotificationPrefs({ initialPrefs }: NotificationPrefsProps) {
  const [prefs, setPrefs] = useState<NotificationPrefsState>(initialPrefs);

  const toggle = (severity: DrowsinessSeverity, channel: keyof NotificationChannelPrefs) => {
    setPrefs((prev) => ({
      ...prev,
      [severity]: { ...prev[severity], [channel]: !prev[severity][channel] },
    }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-ink-2 p-4">
      <h2 className="font-display text-lg text-fog">Notification preferences</h2>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="text-xs text-mist">
            <th scope="col" className="pb-2 font-medium">Event severity</th>
            <th scope="col" className="pb-2 font-medium">SMS</th>
            <th scope="col" className="pb-2 font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {SEVERITIES.map(({ key, label }) => (
            <tr key={key}>
              <td className="py-2 text-fog">{label}</td>
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${label} SMS`}
                  checked={prefs[key].sms}
                  onChange={() => toggle(key, "sms")}
                  className="h-4 w-4"
                />
              </td>
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${label} email`}
                  checked={prefs[key].email}
                  onChange={() => toggle(key, "email")}
                  className="h-4 w-4"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
