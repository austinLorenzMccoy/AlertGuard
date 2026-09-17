import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  it("renders the login client", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "AlertGuard Fleet Dashboard" })).toBeInTheDocument();
  });
});
