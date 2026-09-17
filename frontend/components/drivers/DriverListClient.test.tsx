import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DriverListClient } from "@/components/drivers/DriverListClient";
import type { DriverListRow } from "@/lib/types";

function row(overrides: Partial<DriverListRow>): DriverListRow {
  return {
    driver: { id: "d1", full_name: "Ada Obi", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
    currentScore: 80,
    scoreBand: "good",
    sevenDayTrend: [],
    totalVerifiedTrips: 5,
    lastActive: null,
    alertCount: 0,
    isActive: false,
    ...overrides,
  };
}

const rows: DriverListRow[] = [
  row({ driver: { ...row({}).driver, id: "d1", full_name: "Zeta" }, currentScore: 90, scoreBand: "good", isActive: true }),
  row({ driver: { ...row({}).driver, id: "d2", full_name: "Alpha" }, currentScore: 40, scoreBand: "critical", isActive: false }),
];

describe("DriverListClient", () => {
  it("renders all rows initially, sorted by score ascending", () => {
    render(<DriverListClient rows={rows} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Alpha", "Zeta"]);
  });

  it("toggles sort direction when the same column header is clicked twice", async () => {
    render(<DriverListClient rows={rows} />);
    const scoreHeader = screen.getByRole("button", { name: "Sort by Score" });
    await userEvent.click(scoreHeader); // desc
    let links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Zeta", "Alpha"]);

    await userEvent.click(scoreHeader); // asc again
    links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Alpha", "Zeta"]);
  });

  it("switches sort key and resets to ascending when a different column is clicked", async () => {
    render(<DriverListClient rows={rows} />);
    await userEvent.click(screen.getByRole("button", { name: "Sort by Driver" }));
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Alpha", "Zeta"]);
  });

  it("filters by score band", async () => {
    render(<DriverListClient rows={rows} />);
    await userEvent.selectOptions(screen.getByLabelText("Score band"), "critical");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveTextContent("Alpha");
  });

  it("filters to active-trip-only drivers", async () => {
    render(<DriverListClient rows={rows} />);
    await userEvent.click(screen.getByLabelText("Active trip only"));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveTextContent("Zeta");
  });
});
