import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiveAlertsFeedClient } from "@/components/alerts/LiveAlertsFeedClient";
import type { LiveAlertRow, SessionDriverInfo } from "@/lib/data/alerts";
import type { RealtimeClientLike, RealtimePayload } from "@/lib/hooks/useRealtimeChannel";
import type { DrowsinessEvent } from "@/lib/types";

function makeFakeClient() {
  let capturedCallback: ((payload: RealtimePayload<Record<string, unknown>>) => void) | null = null;
  const channel = {
    on: vi.fn((_type, _filter, callback) => {
      capturedCallback = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const client: RealtimeClientLike = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  return { client, emit: (payload: RealtimePayload<Record<string, unknown>>) => capturedCallback?.(payload) };
}

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

const initialRows: LiveAlertRow[] = [{ event, driverName: "Ada Obi", driverId: "d1", sessionId: "s1" }];
const driverInfoBySessionId: Record<string, SessionDriverInfo> = { s1: { driverId: "d1", driverName: "Ada Obi" } };

describe("LiveAlertsFeedClient", () => {
  it("shows an all-clear message when there are no alerts", () => {
    render(
      <LiveAlertsFeedClient initialRows={[]} driverInfoBySessionId={{}} realtimeClient={null} />,
    );
    expect(screen.getByText(/no critical alerts/i)).toBeInTheDocument();
  });

  it("renders initial rows and acknowledges one", async () => {
    render(
      <LiveAlertsFeedClient initialRows={initialRows} driverInfoBySessionId={driverInfoBySessionId} realtimeClient={null} />,
    );
    expect(screen.getByText(/Ada Obi/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeInTheDocument();
  });

  it("prepends a realtime critical event and labels it via the lookup", () => {
    const fake = makeFakeClient();
    render(
      <LiveAlertsFeedClient initialRows={[]} driverInfoBySessionId={driverInfoBySessionId} realtimeClient={fake.client} />,
    );

    act(() => {
      fake.emit({ new: { ...event, id: "e2" } });
    });

    expect(screen.getByText(/Ada Obi/)).toBeInTheDocument();
  });

  it("falls back to 'Unknown driver' for a session not in the lookup", () => {
    const fake = makeFakeClient();
    render(<LiveAlertsFeedClient initialRows={[]} driverInfoBySessionId={{}} realtimeClient={fake.client} />);

    act(() => {
      fake.emit({ new: { ...event, id: "e3", session_id: "unmapped" } });
    });

    expect(screen.getByText(/Unknown driver/)).toBeInTheDocument();
  });
});
