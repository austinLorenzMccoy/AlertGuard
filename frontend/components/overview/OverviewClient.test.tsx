import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewClient } from "@/components/overview/OverviewClient";
import type { RealtimeClientLike, RealtimePayload } from "@/lib/hooks/useRealtimeChannel";
import type { FleetOverviewData } from "@/lib/types";

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

const data: FleetOverviewData = {
  fleet: { id: "f1", name: "Lacoco Fleet", owner_id: null, created_at: "" },
  activeDriversNow: 1,
  todayAvgScore: 75,
  todayCriticalAlertCount: 0,
  driverCards: [
    {
      driver: { id: "d1", full_name: "Ada", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
      activeSession: null,
      currentScore: 75,
      isLive: true,
    },
  ],
};

describe("OverviewClient", () => {
  it("renders the fleet name and derives active-driver count from the live cards", () => {
    render(<OverviewClient data={data} realtimeClient={null} />);
    expect(screen.getByText("Lacoco Fleet")).toBeInTheDocument();
    expect(screen.getAllByText("1")).not.toHaveLength(0);
  });

  it("falls back to 'Unknown fleet' when fleet is null", () => {
    render(<OverviewClient data={{ ...data, fleet: null }} realtimeClient={null} />);
    expect(screen.getByText("Unknown fleet")).toBeInTheDocument();
  });

  it("updates the active-driver count live when a session goes offline", () => {
    const fake = makeFakeClient();
    render(<OverviewClient data={data} realtimeClient={fake.client} />);

    act(() => {
      fake.emit({ new: { id: "s1", driver_id: "d1", status: "completed", safety_score: 40 } });
    });

    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});
