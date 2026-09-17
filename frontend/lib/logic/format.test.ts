import { describe, expect, it } from "vitest";
import { isValidEmail, maskPhone } from "@/lib/logic/format";

describe("maskPhone", () => {
  it("returns a placeholder when there is no phone", () => {
    expect(maskPhone(null)).toBe("No phone on file");
    expect(maskPhone(undefined)).toBe("No phone on file");
    expect(maskPhone("")).toBe("No phone on file");
  });

  it("masks all but the last 2 digits", () => {
    const digits = "2348020000001";
    expect(maskPhone(`+${digits}`)).toBe(`${"*".repeat(digits.length - 2)}01`);
  });

  it("masks a short number entirely when <= 2 digits", () => {
    expect(maskPhone("+1")).toBe("*");
  });
});

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
  });

  it("rejects a missing @", () => {
    expect(isValidEmail("ab.com")).toBe(false);
  });

  it("rejects a missing domain dot", () => {
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    expect(isValidEmail("   ")).toBe(false);
  });
});
