import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getServerDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({
  getServerDataSource: () => getServerDataSourceMock(),
}));

const getFleetContextMock = vi.fn();
vi.mock("@/lib/auth/fleet-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/fleet-context")>();
  return { ...actual, getFleetContext: () => getFleetContextMock() };
});

import RedemptionsPage from "@/app/(dashboard)/redemptions/page";

describe("RedemptionsPage", () => {
  it("renders redemptions for the demo fleet", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: FLEET_ID, profile: {} });
    getServerDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          profiles: [
            { id: "d1", full_name: "Driver One", phone: null, role: "driver", fleet_id: FLEET_ID, wallet_address: null, created_at: "", updated_at: "" },
          ],
          redemptions: [
            { id: "rd1", driver_id: "d1", redemption_type: "airtime", amount: 500, status: "pending", created_at: "" },
          ],
        }),
      ),
    );
    const element = await RedemptionsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Redemptions" })).toBeInTheDocument();
    expect(screen.getByText("Driver One")).toBeInTheDocument();
  });

  it("never renders page content when the fleet context isn't resolved", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(RedemptionsPage()).rejects.toThrow(/Fleet context is not resolved/);
  });
});
