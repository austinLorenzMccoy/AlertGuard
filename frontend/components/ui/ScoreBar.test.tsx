import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBar } from "@/components/ui/ScoreBar";

describe("ScoreBar", () => {
  it("renders '—' and a 0-width bar for a null score", () => {
    render(<ScoreBar score={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("renders a rounded numeric label for a good score", () => {
    render(<ScoreBar score={91.6} />);
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("renders for a warning-band score", () => {
    render(<ScoreBar score={65} />);
    expect(screen.getByText("65")).toBeInTheDocument();
  });

  it("renders for a critical-band score", () => {
    render(<ScoreBar score={20} />);
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("clamps the visual bar width to [0, 100]", () => {
    render(<ScoreBar score={150} />);
    expect(screen.getByRole("progressbar").firstChild).toHaveStyle({ width: "100%" });
  });
});
