import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCookieAdapter, buildServerSupabaseClient } from "@/lib/supabase-server";

describe("buildCookieAdapter", () => {
  it("getAll delegates to the cookie store", () => {
    const getAll = vi.fn(() => [{ name: "sb-token", value: "abc" }]);
    const adapter = buildCookieAdapter({ getAll });
    expect(adapter.getAll()).toEqual([{ name: "sb-token", value: "abc" }]);
    expect(getAll).toHaveBeenCalled();
  });

  it("setAll writes each cookie via the store's set()", () => {
    const set = vi.fn();
    const adapter = buildCookieAdapter({ getAll: () => [], set });
    adapter.setAll?.(
      [
        { name: "sb-token", value: "abc", options: { path: "/" } },
        { name: "sb-refresh", value: "def", options: {} },
      ],
      {},
    );
    expect(set).toHaveBeenCalledWith("sb-token", "abc", { path: "/" });
    expect(set).toHaveBeenCalledWith("sb-refresh", "def", {});
  });

  it("setAll swallows an error thrown by the store's set() (Server Component context)", () => {
    const set = vi.fn(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    const adapter = buildCookieAdapter({ getAll: () => [], set });
    expect(() =>
      adapter.setAll?.([{ name: "sb-token", value: "abc", options: {} }], {}),
    ).not.toThrow();
  });

  it("setAll is a no-op when the store has no set()", () => {
    const adapter = buildCookieAdapter({ getAll: () => [] });
    expect(() => adapter.setAll?.([{ name: "sb-token", value: "abc", options: {} }], {})).not.toThrow();
  });
});

describe("buildServerSupabaseClient", () => {
  it("returns a Supabase client wired to the given cookie store", () => {
    const client = buildServerSupabaseClient(
      { getAll: () => [{ name: "sb-token", value: "abc" }] },
      "https://example.supabase.co",
      "anon-key",
    );
    expect(typeof client.auth.getUser).toBe("function");
    expect(typeof client.from).toBe("function");
  });
});

describe("createServerSupabaseClient", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    vi.doUnmock("next/headers");
    vi.resetModules();
  });

  it("throws when env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.doMock("next/headers", () => ({ cookies: () => ({ getAll: () => [] }) }));
    const { createServerSupabaseClient } = await import("@/lib/supabase-server");
    expect(() => createServerSupabaseClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("builds a client from next/headers' cookies() when env vars are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const getAll = vi.fn(() => [{ name: "sb-token", value: "abc" }]);
    vi.doMock("next/headers", () => ({ cookies: () => ({ getAll, set: vi.fn() }) }));
    const { createServerSupabaseClient } = await import("@/lib/supabase-server");
    const client = createServerSupabaseClient();
    expect(typeof client.from).toBe("function");
  });
});
