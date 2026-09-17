import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

import SettingsPage from "@/app/(dashboard)/settings/page";

describe("SettingsPage", () => {
  it("renders settings panels with fleet + manager data", async () => {
    getDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          fleets: [{ id: FLEET_ID, name: "Fleet One", owner_id: null, created_at: "" }],
          profiles: [
            { id: "m1", full_name: "Manager One", phone: "+1000", role: "fleet_manager", fleet_id: FLEET_ID, wallet_address: null, created_at: "", updated_at: "" },
          ],
        }),
      ),
    );
    const element = await SettingsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fleet name")).toHaveValue("Fleet One");
    expect(screen.getByText("+1000")).toBeInTheDocument();
  });

  it("falls back to an empty fleet name when no fleet matches", async () => {
    getDataSourceMock.mockReturnValue(createFakeDataSource(buildTestSeed({ fleets: [] })));
    const element = await SettingsPage();
    render(element);
    expect(screen.getByLabelText("Fleet name")).toHaveValue("");
  });

  it("falls back to the manager id as the display email when phone is null", async () => {
    getDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          profiles: [
            { id: "m2", full_name: "Manager Two", phone: null, role: "fleet_manager", fleet_id: FLEET_ID, wallet_address: null, created_at: "", updated_at: "" },
          ],
        }),
      ),
    );
    const element = await SettingsPage();
    render(element);
    expect(screen.getByText("m2")).toBeInTheDocument();
  });
});
