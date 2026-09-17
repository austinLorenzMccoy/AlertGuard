import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

import DriversPage from "@/app/(dashboard)/drivers/page";

describe("DriversPage", () => {
  it("renders the driver list for the demo fleet", async () => {
    getDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          profiles: [
            { id: "d1", full_name: "Driver One", phone: null, role: "driver", fleet_id: FLEET_ID, wallet_address: null, created_at: "", updated_at: "" },
          ],
        }),
      ),
    );
    const element = await DriversPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Drivers" })).toBeInTheDocument();
    expect(screen.getByText("Driver One")).toBeInTheDocument();
  });
});
