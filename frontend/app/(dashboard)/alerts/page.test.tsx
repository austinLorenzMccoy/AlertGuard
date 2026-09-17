import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

import AlertsPage from "@/app/(dashboard)/alerts/page";

describe("AlertsPage", () => {
  it("renders the live alerts feed for the demo fleet", async () => {
    getDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          profiles: [
            { id: "d1", full_name: "Driver One", phone: null, role: "driver", fleet_id: FLEET_ID, wallet_address: null, created_at: "", updated_at: "" },
          ],
          sessions: [
            { id: "s1", driver_id: "d1", device_id: null, fleet_id: FLEET_ID, start_time: "", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 1, gps_trace_hash: null, status: "active", safety_score: 50, created_at: "" },
          ],
          events: [
            { id: "e1", session_id: "s1", event_type: "eye_closure", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-17T08:00:00.000Z", lat: null, lng: null },
          ],
        }),
      ),
    );
    const element = await AlertsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Live alerts" })).toBeInTheDocument();
    expect(screen.getByText(/Driver One/)).toBeInTheDocument();
  });
});
