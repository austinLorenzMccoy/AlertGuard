import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FleetProfileForm } from "@/components/settings/FleetProfileForm";

describe("FleetProfileForm", () => {
  it("renders the initial values", () => {
    render(<FleetProfileForm initialName="Lacoco Fleet" initialLogoUrl="https://x/logo.png" onSave={vi.fn()} />);
    expect(screen.getByLabelText("Fleet name")).toHaveValue("Lacoco Fleet");
    expect(screen.getByLabelText("Logo URL")).toHaveValue("https://x/logo.png");
  });

  it("calls onSave with edited values on submit and shows a saved indicator", async () => {
    const onSave = vi.fn();
    render(<FleetProfileForm initialName="" initialLogoUrl="" onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Fleet name"), "New Fleet");
    await userEvent.type(screen.getByLabelText("Logo URL"), "https://x/logo.png");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith({ name: "New Fleet", logoUrl: "https://x/logo.png" });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
