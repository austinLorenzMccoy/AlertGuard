import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

import DriverDetailPage from "@/app/(dashboard)/drivers/[id]/page";

describe("DriverDetailPage", () => {
  it("renders driver detail when the driver exists", async () => {
    getDataSourceMock.mockReturnValue(
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
    getDataSourceMock.mockReturnValue(createFakeDataSource(buildTestSeed({ profiles: [] })));
    await expect(DriverDetailPage({ params: { id: "missing" } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
