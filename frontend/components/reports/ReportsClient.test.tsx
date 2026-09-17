import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const downloadFileMock = vi.fn();
vi.mock("@/lib/dom/download", () => ({ downloadFile: (...args: unknown[]) => downloadFileMock(...args) }));

afterEach(() => {
  downloadFileMock.mockClear();
});

import { ReportsClient } from "@/components/reports/ReportsClient";
import type { Fleet, FleetReport } from "@/lib/types";

const fleet: Fleet = { id: "f1", name: "Lacoco Fleet", owner_id: null, created_at: "" };

function report(overrides: Partial<FleetReport>): FleetReport {
  return {
    id: "r1",
    fleet_id: "f1",
    period_start: "2026-09-10",
    period_end: "2026-09-17",
    avg_safety_score: 80,
    total_sessions: 10,
    total_critical_alerts: 1,
    generated_at: "",
    ...overrides,
  };
}

describe("ReportsClient", () => {
  it("defaults to this_month and shows matching reports", () => {
    render(<ReportsClient fleet={fleet} reports={[report({})]} />);
    expect(screen.getByText("2026-09-10 – 2026-09-17")).toBeInTheDocument();
  });

  it("shows an empty state when no reports are in range", () => {
    render(<ReportsClient fleet={fleet} reports={[]} />);
    expect(screen.getByText("No report periods in this range.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  });

  it("exports CSV via downloadFile", async () => {
    render(<ReportsClient fleet={fleet} reports={[report({})]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(downloadFileMock).toHaveBeenCalledWith(
      "alertguard-fleet-report.csv",
      expect.stringContaining("Period start"),
      "text/csv",
    );
  });

  it("exports PDF via downloadFile", async () => {
    render(<ReportsClient fleet={fleet} reports={[report({})]} />);
    await userEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    const [filename, bytes, mimeType] = downloadFileMock.mock.calls[0];
    expect(filename).toBe("alertguard-fleet-report.pdf");
    expect(ArrayBuffer.isView(bytes)).toBe(true);
    expect(mimeType).toBe("application/pdf");
  });

  it("switches to a custom range and shows no rows until both dates are filled", async () => {
    render(<ReportsClient fleet={fleet} reports={[report({})]} />);
    await userEvent.selectOptions(screen.getByLabelText("Range"), "custom");
    expect(screen.getByText("No report periods in this range.")).toBeInTheDocument();
  });

  it("filters by a fully-specified custom range", async () => {
    render(<ReportsClient fleet={fleet} reports={[report({})]} />);
    await userEvent.selectOptions(screen.getByLabelText("Range"), "custom");
    await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
    await userEvent.type(screen.getByLabelText("To"), "2026-09-20");
    expect(screen.getByText("2026-09-10 – 2026-09-17")).toBeInTheDocument();
  });

  it("renders '—' for a null avg_safety_score and 0 for null session/alert counts", () => {
    render(
      <ReportsClient
        fleet={fleet}
        reports={[report({ avg_safety_score: null, total_sessions: null, total_critical_alerts: null })]}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    const cells = screen.getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("0");
    expect(cells[3]).toHaveTextContent("0");
  });
});
