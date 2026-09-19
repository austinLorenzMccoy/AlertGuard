import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "@/app/page";

describe("RootPage", () => {
  it("renders the landing page's hero and a fleet dashboard card linking to /login", () => {
    render(<RootPage />);
    expect(screen.getByRole("heading", { name: "AlertGuard" })).toBeInTheDocument();
    expect(
      screen.getByText("Verified-safe-driving detection, with an on-chain incentive layer."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fleet dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });
});
