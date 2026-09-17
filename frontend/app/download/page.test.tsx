import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DownloadPage from "@/app/download/page";

describe("DownloadPage", () => {
  it("renders a disabled 'coming soon' state instead of a live Play Store link", () => {
    render(<DownloadPage />);
    // The mobile app has no Play Store listing yet — this must never be a
    // real, clickable link to a generic (misleading) store homepage.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Coming soon to Google Play" });
    expect(button).toBeDisabled();
  });
});
