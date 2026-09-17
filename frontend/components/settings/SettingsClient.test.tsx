import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SettingsClient } from "@/components/settings/SettingsClient";

describe("SettingsClient", () => {
  it("composes fleet profile, manager list, and notification prefs panels", async () => {
    render(
      <SettingsClient
        initialFleetName="Lacoco Fleet"
        initialLogoUrl=""
        initialManagers={[{ id: "m1", email: "a@b.com" }]}
        initialNotificationPrefs={{
          critical: { sms: true, email: true },
          vibration: { sms: false, email: true },
          soft: { sms: false, email: false },
        }}
        currentUserRole="fleet_manager"
        currentUserFleetId="f1"
      />,
    );
    expect(screen.getByLabelText("Fleet name")).toHaveValue("Lacoco Fleet");
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Critical events SMS")).toBeChecked();

    // Exercises the (no-op, in this build) onSave handler wired to the form.
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
