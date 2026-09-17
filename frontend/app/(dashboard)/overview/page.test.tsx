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

import OverviewPage from "@/app/(dashboard)/overview/page";

describe("OverviewPage", () => {
  it("renders the fleet overview for the resolved fleet", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: FLEET_ID, profile: {} });
    getServerDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({ fleets: [{ id: FLEET_ID, name: "Fleet One", owner_id: "m1", created_at: "" }] }),
      ),
    );
    const element = await OverviewPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Fleet One")).toBeInTheDocument();
  });

  it("never renders page content when the fleet context isn't resolved", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(OverviewPage()).rejects.toThrow(/Fleet context is not resolved/);
  });
});
