import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RedemptionsClient } from "@/components/redemptions/RedemptionsClient";
import type { RedemptionsTableRow } from "@/components/redemptions/RedemptionsTable";
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

const initialRows: RedemptionsTableRow[] = [
  { redemption: redemption({ id: "1", status: "pending" }), driverName: "Ada" },
  { redemption: redemption({ id: "2", status: "completed" }), driverName: "Bello" },
];

describe("RedemptionsClient", () => {
  it("defaults to the 'All' tab showing every row", () => {
    render(<RedemptionsClient initialRows={initialRows} />);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Bello")).toBeInTheDocument();
  });

  it("filters rows by status tab and shows per-status counts", async () => {
    render(<RedemptionsClient initialRows={initialRows} />);
    expect(screen.getByRole("tab", { name: "Pending (1)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Pending (1)" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Bello")).not.toBeInTheDocument();
  });

  it("approves a pending redemption directly to completed when manual approval is off", async () => {
    render(<RedemptionsClient initialRows={initialRows} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("tab", { name: "Completed (2)" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("routes an approval to 'processing' when manual approval is required", async () => {
    render(<RedemptionsClient initialRows={initialRows} />);
    await userEvent.click(screen.getByLabelText(/Require manual approval/));
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("tab", { name: "Processing (1)" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("rejects a redemption to 'failed'", async () => {
    render(<RedemptionsClient initialRows={initialRows} />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(screen.getByRole("tab", { name: "Failed (1)" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });
});
