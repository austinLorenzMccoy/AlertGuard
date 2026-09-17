import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriverHeader } from "@/components/driver-detail/DriverHeader";
import type { Profile } from "@/lib/types";

function driver(overrides: Partial<Profile>): Profile {
  return {
    id: "d1",
    full_name: "Ada Obi",
    phone: "+2348010000001",
    role: "driver",
    fleet_id: "f1",
    wallet_address: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("DriverHeader", () => {
  it("renders the driver's name and masked phone", () => {
    render(<DriverHeader driver={driver({})} />);
    expect(screen.getByRole("heading", { name: "Ada Obi" })).toBeInTheDocument();
    expect(screen.getByText(/01$/)).toBeInTheDocument();
  });

  it("shows 'Not linked' when there is no wallet address", () => {
    render(<DriverHeader driver={driver({})} />);
    expect(screen.getByText("Not linked")).toBeInTheDocument();
  });

  it("shows 'Linked ✓' when a wallet address is present", () => {
    render(<DriverHeader driver={driver({ wallet_address: "SP1..." })} />);
    expect(screen.getByText("Linked ✓")).toBeInTheDocument();
  });

  it("falls back to 'Unnamed driver' when full_name is null", () => {
    render(<DriverHeader driver={driver({ full_name: null })} />);
    expect(screen.getByRole("heading", { name: "Unnamed driver" })).toBeInTheDocument();
  });
});
