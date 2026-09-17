import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NotificationPrefs, type NotificationPrefsState } from "@/components/settings/NotificationPrefs";

const initialPrefs: NotificationPrefsState = {
  critical: { sms: true, email: true },
  vibration: { sms: false, email: true },
  soft: { sms: false, email: false },
};

describe("NotificationPrefs", () => {
  it("renders initial checkbox states", () => {
    render(<NotificationPrefs initialPrefs={initialPrefs} />);
    expect(screen.getByLabelText("Critical events SMS")).toBeChecked();
    expect(screen.getByLabelText("Vibration-severity events SMS")).not.toBeChecked();
  });

  it("toggles an email checkbox independently", async () => {
    render(<NotificationPrefs initialPrefs={initialPrefs} />);
    const checkbox = screen.getByLabelText("Soft events email");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // Unrelated checkbox is unaffected.
    expect(screen.getByLabelText("Critical events SMS")).toBeChecked();
  });

  it("toggles an SMS checkbox independently", async () => {
    render(<NotificationPrefs initialPrefs={initialPrefs} />);
    const checkbox = screen.getByLabelText("Vibration-severity events SMS");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
