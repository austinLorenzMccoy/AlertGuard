import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "@/components/ui/IconButton";

describe("IconButton", () => {
  it("renders a real <button> with the required aria-label", () => {
    render(<IconButton aria-label="Notifications">🔔</IconButton>);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Close" onClick={onClick}>
        ✕
      </IconButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
