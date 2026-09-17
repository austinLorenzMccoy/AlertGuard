import { describe, expect, it } from "vitest";
import { getPostLoginRedirect } from "@/lib/logic/auth-redirect";

describe("getPostLoginRedirect", () => {
  it("sends fleet_manager to /overview", () => {
    expect(getPostLoginRedirect("fleet_manager")).toBe("/overview");
  });

  it("sends admin to /overview", () => {
    expect(getPostLoginRedirect("admin")).toBe("/overview");
  });

  it("sends driver to /download", () => {
    expect(getPostLoginRedirect("driver")).toBe("/download");
  });

  it("fails closed to /download for null/undefined role", () => {
    expect(getPostLoginRedirect(null)).toBe("/download");
    expect(getPostLoginRedirect(undefined)).toBe("/download");
  });
});
