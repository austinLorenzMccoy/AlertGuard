"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

export interface FleetProfileFormProps {
  initialName: string;
  initialLogoUrl: string;
  onSave: (values: { name: string; logoUrl: string }) => void;
}

/** Fleet profile settings (PRD Section 8.8). */
export function FleetProfileForm({ initialName, initialLogoUrl, onSave }: FleetProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ name, logoUrl });
    setSavedAt(Date.now());
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-card border border-line bg-ink-2 p-4">
      <h2 className="font-display text-lg text-fog">Fleet profile</h2>
      <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="fleet-name">
        Fleet name
        <input
          id="fleet-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-touch rounded-btn border border-line bg-ink-3 px-3 text-fog"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="fleet-logo">
        Logo URL
        <input
          id="fleet-logo"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className="min-h-touch rounded-btn border border-line bg-ink-3 px-3 text-fog"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary">
          Save changes
        </Button>
        {savedAt !== null && <span className="text-xs text-mist">Saved</span>}
      </div>
    </form>
  );
}
