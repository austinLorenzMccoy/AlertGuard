import { describe, expect, it } from "vitest";
import { getMiddlewareRedirect, isDashboardPath } from "@/lib/auth/middleware-logic";

describe("isDashboardPath", () => {
  it.each([
    "/overview",
    "/drivers",
    "/drivers/abc-123",
    "/alerts",
    "/reports",
    "/redemptions",
    "/settings",
  ])("is true for dashboard path %s", (path) => {
    expect(isDashboardPath(path)).toBe(true);
  });

  it.each(["/login", "/download", "/", "/auth/callback", "/overviews", "/report"])(
    "is false for non-dashboard path %s",
    (path) => {
      expect(isDashboardPath(path)).toBe(false);
    },
  );
});

describe("getMiddlewareRedirect", () => {
  it("redirects unauthenticated visitors away from a dashboard path", () => {
    expect(getMiddlewareRedirect(false, "/overview")).toBe("/login");
  });

  it("redirects unauthenticated visitors away from a nested dashboard path", () => {
    expect(getMiddlewareRedirect(false, "/drivers/abc-123")).toBe("/login");
  });

  it("lets authenticated visitors through to a dashboard path", () => {
    expect(getMiddlewareRedirect(true, "/overview")).toBeNull();
  });

  it("lets unauthenticated visitors through to a non-dashboard path", () => {
    expect(getMiddlewareRedirect(false, "/login")).toBeNull();
  });

  it("lets authenticated visitors through to a non-dashboard path", () => {
    expect(getMiddlewareRedirect(true, "/login")).toBeNull();
  });
});
