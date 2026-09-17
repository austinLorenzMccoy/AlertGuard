import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertRow } from "@/components/alerts/AlertRow";
import type { DrowsinessEvent } from "@/lib/types";

const event: DrowsinessEvent = {
  id: "e1",
  session_id: "s1",
  event_type: "eye_closure",
  severity: "critical",
  device_confidence: 0.9,
  occurred_at: "2026-09-17T08:00:00.000Z",
  lat: null,
  lng: null,
};

describe("AlertRow", () => {
  it("renders driver name and a link to their detail page", () => {
    render(<AlertRow event={event} driverName="Ada Obi" driverId="d1" acknowledged={false} onAcknowledge={vi.fn()} />);
    expect(screen.getByText(/Ada Obi/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View driver" })).toHaveAttribute("href", "/drivers/d1");
  });

  it("calls onAcknowledge with the event id when clicked", async () => {
    const onAcknowledge = vi.fn();
    render(<AlertRow event={event} driverName="Ada" driverId="d1" acknowledged={false} onAcknowledge={onAcknowledge} />);
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(onAcknowledge).toHaveBeenCalledWith("e1");
  });

  it("shows a disabled 'Acknowledged' state once acknowledged", () => {
    render(<AlertRow event={event} driverName="Ada" driverId="d1" acknowledged={true} onAcknowledge={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeDisabled();
  });
});
