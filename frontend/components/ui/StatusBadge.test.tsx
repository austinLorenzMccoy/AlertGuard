import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/ui/StatusBadge";

describe("StatusBadge", () => {
  it("renders a 'No data' badge with icon+text for null band", () => {
    render(<StatusBadge band={null} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders icon + text for the good band", () => {
    render(<StatusBadge band="good" />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("renders icon + text for the warning band", () => {
    render(<StatusBadge band="warning" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("renders icon + text for the critical band", () => {
    render(<StatusBadge band="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });
});
