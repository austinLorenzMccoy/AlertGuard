import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "@/components/reports/DateRangePicker";

describe("DateRangePicker", () => {
  it("hides custom date inputs when preset is not custom", () => {
    render(
      <DateRangePicker
        preset="this_week"
        customStart=""
        customEnd=""
        onPresetChange={vi.fn()}
        onCustomStartChange={vi.fn()}
        onCustomEndChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("shows custom date inputs when preset is custom", () => {
    render(
      <DateRangePicker
        preset="custom"
        customStart="2026-09-01"
        customEnd="2026-09-10"
        onPresetChange={vi.fn()}
        onCustomStartChange={vi.fn()}
        onCustomEndChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-09-10");
  });

  it("calls onPresetChange when the select changes", async () => {
    const onPresetChange = vi.fn();
    render(
      <DateRangePicker
        preset="this_week"
        customStart=""
        customEnd=""
        onPresetChange={onPresetChange}
        onCustomStartChange={vi.fn()}
        onCustomEndChange={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Range"), "custom");
    expect(onPresetChange).toHaveBeenCalledWith("custom");
  });

  it("calls onCustomStartChange/onCustomEndChange when the date inputs change", async () => {
    const onCustomStartChange = vi.fn();
    const onCustomEndChange = vi.fn();
    render(
      <DateRangePicker
        preset="custom"
        customStart=""
        customEnd=""
        onPresetChange={vi.fn()}
        onCustomStartChange={onCustomStartChange}
        onCustomEndChange={onCustomEndChange}
      />,
    );
    await userEvent.type(screen.getByLabelText("From"), "2026-09-01");
    await userEvent.type(screen.getByLabelText("To"), "2026-09-10");
    expect(onCustomStartChange).toHaveBeenCalled();
    expect(onCustomEndChange).toHaveBeenCalled();
  });
});
