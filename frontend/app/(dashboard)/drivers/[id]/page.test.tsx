import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
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

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

import DriverDetailPage from "@/app/(dashboard)/drivers/[id]/page";

describe("DriverDetailPage", () => {
  it("renders driver detail when the driver exists", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: "f1", profile: {} });
    getServerDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          profiles: [
            { id: "d1", full_name: "Driver One", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
          ],
        }),
      ),
    );
    const element = await DriverDetailPage({ params: { id: "d1" } });
    render(element);
    expect(screen.getByRole("heading", { name: "Driver One" })).toBeInTheDocument();
  });

  it("calls notFound when the driver does not exist", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: "f1", profile: {} });
    getServerDataSourceMock.mockReturnValue(createFakeDataSource(buildTestSeed({ profiles: [] })));
    await expect(DriverDetailPage({ params: { id: "missing" } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("never renders page content when the fleet context isn't resolved", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(DriverDetailPage({ params: { id: "d1" } })).rejects.toThrow(
      /Fleet context is not resolved/,
    );
  });
});
