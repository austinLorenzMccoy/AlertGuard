import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "@/app/page";

describe("RootPage", () => {
  it("renders the landing page with a link to /login", () => {
    render(<RootPage />);
    expect(screen.getByRole("heading", { name: "AlertGuard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });
});
