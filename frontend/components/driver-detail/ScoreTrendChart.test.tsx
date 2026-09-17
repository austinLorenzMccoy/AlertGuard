import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreTrendChart } from "@/components/driver-detail/ScoreTrendChart";

describe("ScoreTrendChart", () => {
  it("renders an empty state when there are no scored points", () => {
    render(<ScoreTrendChart points={[{ date: "2026-09-01", score: null }]} />);
    expect(screen.getByText("No sessions in this period")).toBeInTheDocument();
  });

  it("renders an SVG line chart labelled with the latest score", () => {
    render(
      <ScoreTrendChart
        points={[
          { date: "2026-09-01", score: 70 },
          { date: "2026-09-02", score: null },
          { date: "2026-09-03", score: 90 },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: /latest score 90/ })).toBeInTheDocument();
  });
});
