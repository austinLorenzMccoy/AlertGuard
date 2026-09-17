import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopStrip } from "@/components/overview/TopStrip";

describe("TopStrip", () => {
  it("renders the fleet name and counts", () => {
    render(
      <TopStrip fleetName="Lacoco Fleet" activeDriversNow={3} todayAvgScore={82.4} todayCriticalAlertCount={0} />,
    );
    expect(screen.getByText("Lacoco Fleet")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("renders '—' when todayAvgScore is null", () => {
    render(<TopStrip fleetName="Fleet" activeDriversNow={0} todayAvgScore={null} todayCriticalAlertCount={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("emphasizes the critical alert count when > 0", () => {
    render(<TopStrip fleetName="Fleet" activeDriversNow={0} todayAvgScore={50} todayCriticalAlertCount={2} />);
    expect(screen.getByText("2")).toHaveClass("text-brake");
  });
});
