import { afterEach, describe, expect, it } from "vitest";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

describe("createBrowserSupabaseClient", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("throws when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => createBrowserSupabaseClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("creates a client when env vars are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const client = createBrowserSupabaseClient();
    expect(typeof client.auth.signInWithOAuth).toBe("function");
  });
});
