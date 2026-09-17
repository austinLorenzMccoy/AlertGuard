import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DriverTable } from "@/components/drivers/DriverTable";
import type { DriverListRow } from "@/lib/types";

function row(overrides: Partial<DriverListRow>): DriverListRow {
  return {
    driver: { id: "d1", full_name: "Ada Obi", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
    currentScore: 80,
    scoreBand: "good",
    sevenDayTrend: [70, 75, 80],
    totalVerifiedTrips: 5,
    lastActive: "2026-09-15T00:00:00.000Z",
    alertCount: 0,
    isActive: false,
    ...overrides,
  };
}

describe("DriverTable", () => {
  it("shows an empty state when there are no rows", () => {
    render(<DriverTable rows={[]} sortKey="score" sortDirection="asc" onSort={vi.fn()} />);
    expect(screen.getByText("No drivers match the current filters.")).toBeInTheDocument();
  });

  it("renders a row per driver with a link to the detail page", () => {
    render(<DriverTable rows={[row({})]} sortKey="score" sortDirection="asc" onSort={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Ada Obi" })).toHaveAttribute("href", "/drivers/d1");
  });

  it("renders '—' for lastActive when null", () => {
    render(<DriverTable rows={[row({ lastActive: null })]} sortKey="score" sortDirection="asc" onSort={vi.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls onSort with the clicked column key", async () => {
    const onSort = vi.fn();
    render(<DriverTable rows={[row({})]} sortKey="score" sortDirection="asc" onSort={onSort} />);
    await userEvent.click(screen.getByRole("button", { name: "Sort by Verified trips" }));
    expect(onSort).toHaveBeenCalledWith("trips");
  });

  it("shows a direction indicator on the active sort column", () => {
    render(<DriverTable rows={[row({})]} sortKey="score" sortDirection="desc" onSort={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sort by Score" })).toHaveTextContent("↓");
  });

  it("falls back to 'Unnamed driver' / 'Driver' labels when full_name is null", () => {
    render(
      <DriverTable
        rows={[row({ driver: { ...row({}).driver, full_name: null }, sevenDayTrend: [] })]}
        sortKey="score"
        sortDirection="asc"
        onSort={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Unnamed driver" })).toBeInTheDocument();
    expect(screen.getByLabelText("Driver 7-day trend: no data")).toBeInTheDocument();
  });
});
