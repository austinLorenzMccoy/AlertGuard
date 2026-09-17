import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RewardHistory } from "@/components/driver-detail/RewardHistory";
import type { Reward } from "@/lib/types";

function reward(overrides: Partial<Reward>): Reward {
  return {
    id: "r1",
    driver_id: "d1",
    session_id: "s1",
    points_earned: 100,
    token_amount: 1,
    status: "settled",
    stacks_tx_hash: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RewardHistory", () => {
  it("shows an empty state with no rewards", () => {
    render(<RewardHistory rewards={[]} />);
    expect(screen.getByText("No rewards earned yet.")).toBeInTheDocument();
  });

  it("lists rewards newest first with status icon + text for each status", () => {
    render(
      <RewardHistory
        rewards={[
          reward({ id: "a", status: "pending", created_at: "2026-09-01T00:00:00.000Z" }),
          reward({ id: "b", status: "settled", created_at: "2026-09-05T00:00:00.000Z" }),
          reward({ id: "c", status: "failed", created_at: "2026-09-03T00:00:00.000Z" }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("settled");
    expect(items[1]).toHaveTextContent("failed");
    expect(items[2]).toHaveTextContent("pending");
  });

  it("falls back to 0 points when points_earned is null", () => {
    render(<RewardHistory rewards={[reward({ points_earned: null })]} />);
    expect(screen.getByText("0 pts")).toBeInTheDocument();
  });
});
