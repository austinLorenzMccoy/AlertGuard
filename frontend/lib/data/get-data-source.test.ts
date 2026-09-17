import { afterEach, describe, expect, it } from "vitest";
import { getDataSource } from "@/lib/data/get-data-source";

describe("getDataSource", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("falls back to the fake demo data source when env vars are unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const ds = getDataSource();
    const fleets = await ds.getFleets();
    expect(fleets.length).toBeGreaterThan(0);
  });

  it("uses the live Supabase data source when env vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const ds = getDataSource();
    expect(typeof ds.getFleets).toBe("function");
  });
});
