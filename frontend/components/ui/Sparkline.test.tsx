import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "@/components/ui/Sparkline";

describe("Sparkline", () => {
  it("renders 'No data' when every point is null", () => {
    render(<Sparkline points={[null, null]} label="7-day trend" />);
    expect(screen.getByLabelText("7-day trend: no data")).toBeInTheDocument();
  });

  it("renders an SVG with a labelled points summary when data exists", () => {
    render(<Sparkline points={[10, null, 30]} label="7-day trend" />);
    expect(screen.getByRole("img", { name: "7-day trend: 10, 30" })).toBeInTheDocument();
  });

  it("handles a single known point without dividing by zero", () => {
    render(<Sparkline points={[42]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("handles all-equal values (zero range)", () => {
    render(<Sparkline points={[50, 50, 50]} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
