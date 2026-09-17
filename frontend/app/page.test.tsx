import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

import RootPage from "@/app/page";

describe("RootPage", () => {
  it("redirects to /login", () => {
    RootPage();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
