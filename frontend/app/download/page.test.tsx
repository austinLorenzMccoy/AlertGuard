import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DownloadPage from "@/app/download/page";

describe("DownloadPage", () => {
  it("renders a real link to the Play Store", () => {
    render(<DownloadPage />);
    expect(screen.getByRole("link", { name: "Download on Google Play" })).toHaveAttribute(
      "href",
      "https://play.google.com/store",
    );
  });
});
