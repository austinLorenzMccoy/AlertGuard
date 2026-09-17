import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RedemptionsTable, type RedemptionsTableRow } from "@/components/redemptions/RedemptionsTable";
import type { Redemption } from "@/lib/types";

function redemption(overrides: Partial<Redemption>): Redemption {
  return {
    id: "rd1",
    driver_id: "d1",
    redemption_type: "airtime",
    amount: 500,
    status: "pending",
    created_at: "",
    ...overrides,
  };
}

describe("RedemptionsTable", () => {
  it("shows an empty state with no rows", () => {
    render(<RedemptionsTable rows={[]} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText("No redemptions match this filter.")).toBeInTheDocument();
  });

  it("shows Approve/Reject actions for pending rows", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const rows: RedemptionsTableRow[] = [{ redemption: redemption({}), driverName: "Ada" }];
    render(<RedemptionsTable rows={rows} onApprove={onApprove} onReject={onReject} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith("rd1");

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledWith("rd1");
  });

  it("shows 'No action needed' for non-pending rows", () => {
    const rows: RedemptionsTableRow[] = [{ redemption: redemption({ status: "completed" }), driverName: "Ada" }];
    render(<RedemptionsTable rows={rows} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText("No action needed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("renders amount fallback of 0 when null", () => {
    const rows: RedemptionsTableRow[] = [{ redemption: redemption({ amount: null }), driverName: "Ada" }];
    render(<RedemptionsTable rows={rows} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByRole("cell", { name: "0" })).toBeInTheDocument();
  });
});
