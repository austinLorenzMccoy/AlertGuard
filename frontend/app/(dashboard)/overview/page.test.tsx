import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

import OverviewPage from "@/app/(dashboard)/overview/page";

describe("OverviewPage", () => {
  it("renders the fleet overview for the demo fleet", async () => {
    getDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({ fleets: [{ id: FLEET_ID, name: "Fleet One", owner_id: "m1", created_at: "" }] }),
      ),
    );
    const element = await OverviewPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Fleet One")).toBeInTheDocument();
  });
});
