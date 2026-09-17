import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriverCard } from "@/components/overview/DriverCard";
import type { DriverGridCard } from "@/lib/types";

function card(overrides: Partial<DriverGridCard>): DriverGridCard {
  return {
    driver: {
      id: "d1",
      full_name: "Ada Obi",
      phone: null,
      role: "driver",
      fleet_id: "f1",
      wallet_address: null,
      created_at: "",
      updated_at: "",
    },
    activeSession: null,
    currentScore: 80,
    isLive: false,
    ...overrides,
  };
}

describe("DriverCard", () => {
  it("links to the driver's detail page", () => {
    render(<DriverCard card={card({})} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/drivers/d1");
  });

  it("shows 'Offline' with no live dot when not live", () => {
    render(<DriverCard card={card({ isLive: false })} />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows 'Trip active' with a live dot when live", () => {
    render(<DriverCard card={card({ isLive: true })} />);
    expect(screen.getByText("Trip active")).toBeInTheDocument();
  });

  it("falls back to 'Unnamed driver'", () => {
    render(<DriverCard card={card({ driver: { ...card({}).driver, full_name: null } })} />);
    expect(screen.getByText("Unnamed driver")).toBeInTheDocument();
  });
});
