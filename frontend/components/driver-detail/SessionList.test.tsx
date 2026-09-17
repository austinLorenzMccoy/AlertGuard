import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SessionList } from "@/components/driver-detail/SessionList";
import type { DrivingSession, DrowsinessEvent } from "@/lib/types";

const sessions: DrivingSession[] = [
  {
    id: "s1",
    driver_id: "d1",
    device_id: null,
    fleet_id: "f1",
    start_time: "2026-09-10T08:00:00.000Z",
    end_time: "2026-09-10T09:00:00.000Z",
    start_lat: null,
    start_lng: null,
    end_lat: null,
    end_lng: null,
    distance_km: 12,
    gps_trace_hash: null,
    status: "verified",
    safety_score: 88,
    created_at: "",
  },
  {
    id: "s2",
    driver_id: "d1",
    device_id: null,
    fleet_id: "f1",
    start_time: "2026-09-12T08:00:00.000Z",
    end_time: null,
    start_lat: null,
    start_lng: null,
    end_lat: null,
    end_lng: null,
    distance_km: null,
    gps_trace_hash: null,
    status: "active",
    safety_score: null,
    created_at: "",
  },
];

const events: DrowsinessEvent[] = [
  {
    id: "e1",
    session_id: "s1",
    event_type: "eye_closure",
    severity: "critical",
    device_confidence: 0.9,
    occurred_at: "2026-09-10T08:30:00.000Z",
    lat: null,
    lng: null,
  },
  {
    id: "e2",
    session_id: "s1",
    event_type: "blink_rate_drift",
    severity: "vibration",
    device_confidence: 0.7,
    occurred_at: "2026-09-10T08:35:00.000Z",
    lat: null,
    lng: null,
  },
  {
    id: "e3",
    session_id: "s1",
    event_type: "yawn",
    severity: "soft",
    device_confidence: 0.4,
    occurred_at: "2026-09-10T08:40:00.000Z",
    lat: null,
    lng: null,
  },
];

describe("SessionList", () => {
  it("shows an empty state with no sessions", () => {
    render(<SessionList sessions={[]} events={[]} />);
    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
  });

  it("lists sessions newest first with an event count toggle", () => {
    render(<SessionList sessions={sessions} events={events} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Events (0)"); // s2 is newest, no events
    expect(buttons[1]).toHaveTextContent("Events (3)"); // s1
  });

  it("expands a session to show its events, and can collapse again", async () => {
    render(<SessionList sessions={sessions} events={events} />);
    const s1Toggle = screen.getByRole("button", { name: "Events (3)" });
    await userEvent.click(s1Toggle);
    expect(screen.getByText("eye_closure")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide events" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide events" }));
    expect(screen.queryByText("eye_closure")).not.toBeInTheDocument();
  });

  it("shows a 'no events logged' message when expanding a session with 0 events", async () => {
    render(<SessionList sessions={sessions} events={events} />);
    await userEvent.click(screen.getByRole("button", { name: "Events (0)" }));
    expect(screen.getByText("No drowsiness events logged.")).toBeInTheDocument();
  });
});
