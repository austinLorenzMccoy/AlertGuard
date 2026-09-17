import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriverGrid } from "@/components/overview/DriverGrid";
import type { DriverGridCard } from "@/lib/types";

describe("DriverGrid", () => {
  it("shows an empty state when there are no drivers", () => {
    render(<DriverGrid cards={[]} />);
    expect(screen.getByText("No drivers in this fleet yet.")).toBeInTheDocument();
  });

  it("renders one card per driver", () => {
    const cards: DriverGridCard[] = [
      {
        driver: { id: "d1", full_name: "Ada", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
        activeSession: null,
        currentScore: 80,
        isLive: false,
      },
      {
        driver: { id: "d2", full_name: "Bello", phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
        activeSession: null,
        currentScore: 60,
        isLive: true,
      },
    ];
    render(<DriverGrid cards={cards} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
