import { describe, it, expect, vi } from "vitest";
import {
  extractBearerToken,
  isInternalCall,
  timingSafeEqual,
  authorizeCaller,
  toHeaderLookup,
  INTERNAL_SECRET_HEADER,
  type JwtVerifier,
} from "../../supabase/functions/_shared/auth.ts";

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the Bearer prefix", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("returns null when the header is missing", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null when the header has no Bearer prefix", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null when the token portion is empty", () => {
    expect(extractBearerToken("Bearer    ")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeEqual("secret", "secret2")).toBe(false);
  });

  it("returns false for same-length but different strings", () => {
    expect(timingSafeEqual("secretA", "secretB")).toBe(false);
  });
});

describe("toHeaderLookup", () => {
  it("passes through an object that already has a get method", () => {
    const headers = new Headers({ "x-test": "1" });
    const lookup = toHeaderLookup(headers);
    expect(lookup.get("x-test")).toBe("1");
  });

  it("wraps a plain object with case-insensitive lookup", () => {
    const lookup = toHeaderLookup({ "X-Internal-Secret": "shh" });
    expect(lookup.get("x-internal-secret")).toBe("shh");
  });

  it("returns undefined for a header not present on a plain object", () => {
    const lookup = toHeaderLookup({ "x-other": "1" });
    expect(lookup.get("x-internal-secret")).toBeUndefined();
  });
});

describe("isInternalCall", () => {
  it("returns true when the header matches the expected secret", () => {
    expect(isInternalCall({ [INTERNAL_SECRET_HEADER]: "s3cret" }, "s3cret")).toBe(true);
  });

  it("returns false when the header is missing", () => {
    expect(isInternalCall({}, "s3cret")).toBe(false);
  });

  it("returns false when the header value doesn't match", () => {
    expect(isInternalCall({ [INTERNAL_SECRET_HEADER]: "wrong" }, "s3cret")).toBe(false);
  });

  it("returns false when no expected secret is configured", () => {
    expect(isInternalCall({ [INTERNAL_SECRET_HEADER]: "s3cret" }, undefined)).toBe(false);
    expect(isInternalCall({ [INTERNAL_SECRET_HEADER]: "s3cret" }, "")).toBe(false);
    expect(isInternalCall({ [INTERNAL_SECRET_HEADER]: "s3cret" }, null)).toBe(false);
  });
});

describe("authorizeCaller", () => {
  function makeVerifier(result: { userId: string } | null): JwtVerifier {
    return { verify: vi.fn().mockResolvedValue(result) };
  }

  it("authorizes as internal when the shared secret header is correct", async () => {
    const jwtVerifier = makeVerifier(null);
    const result = await authorizeCaller(
      { [INTERNAL_SECRET_HEADER]: "s3cret" },
      { internalSecret: "s3cret", jwtVerifier }
    );
    expect(result).toEqual({ authorized: true, isInternal: true, reason: "ok" });
    expect(jwtVerifier.verify).not.toHaveBeenCalled();
  });

  it("rejects when no authorization header and no internal secret are present", async () => {
    const jwtVerifier = makeVerifier(null);
    const result = await authorizeCaller({}, { internalSecret: "s3cret", jwtVerifier });
    expect(result).toEqual({ authorized: false, isInternal: false, reason: "missing_token" });
  });

  it("rejects an invalid bearer token", async () => {
    const jwtVerifier = makeVerifier(null);
    const result = await authorizeCaller(
      { authorization: "Bearer bad-token" },
      { internalSecret: "s3cret", jwtVerifier }
    );
    expect(result).toEqual({ authorized: false, isInternal: false, reason: "invalid_token" });
  });

  it("authorizes a valid end-user bearer token", async () => {
    const jwtVerifier = makeVerifier({ userId: "user-1" });
    const result = await authorizeCaller(
      { authorization: "Bearer good-token" },
      { internalSecret: "s3cret", jwtVerifier }
    );
    expect(result).toEqual({ authorized: true, isInternal: false, userId: "user-1", reason: "ok" });
  });
});
