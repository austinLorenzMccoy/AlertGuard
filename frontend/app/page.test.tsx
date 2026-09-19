import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "@/app/page";

describe("RootPage", () => {
  it("renders the landing page's hero, sections, and CTAs", () => {
    render(<RootPage />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Stay awake at the wheel.");
    expect(heading.textContent).toContain("Get paid");

    expect(screen.getByRole("heading", { name: "Three signals, read in real time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "See it from the fleet side, live" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Safe driving pays — literally" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Driving for a living?" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Running a fleet, or writing cover?" }),
    ).toBeInTheDocument();

    for (const link of screen.getAllByRole("link", { name: "Download the app" })) {
      expect(link).toHaveAttribute("href", "/download");
    }
    expect(screen.getByRole("link", { name: "Get the app" })).toHaveAttribute("href", "/download");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "For fleets & insurers" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "See the fleet dashboard" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", "/login");
  });
});
