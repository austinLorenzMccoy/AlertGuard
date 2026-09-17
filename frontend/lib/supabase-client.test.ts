import { afterEach, describe, expect, it } from "vitest";
import {
  createLiveDataSource,
  createRawSupabaseClient,
  createSupabaseDataSource,
} from "@/lib/supabase-client";

/** Minimal fake of the supabase-js fluent query builder used by our data source. */
function makeFakeClient(resultByTable: Record<string, { data: unknown[] | null; error: unknown }>) {
  const calls: { table: string; eq: [string, unknown][]; in: [string, unknown][] }[] = [];

  return {
    calls,
    from(table: string) {
      const eqCalls: [string, unknown][] = [];
      const inCalls: [string, unknown][] = [];
      const record = { table, eq: eqCalls, in: inCalls };
      calls.push(record);

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          eqCalls.push([col, val]);
          return builder;
        },
        in(col: string, val: unknown) {
          inCalls.push([col, val]);
          return builder;
        },
        then(resolve: (v: unknown) => unknown) {
          const result = resultByTable[table] ?? { data: [], error: null };
          return Promise.resolve(result).then(resolve);
        },
      };
      return builder;
    },
  };
}

describe("createRawSupabaseClient", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("throws when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => createRawSupabaseClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("creates a client when env vars are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    expect(() => createRawSupabaseClient()).not.toThrow();
  });
});

describe("createLiveDataSource", () => {
  it("wires a raw client into a data source", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const ds = createLiveDataSource();
    expect(typeof ds.getProfiles).toBe("function");
  });
});

describe("createSupabaseDataSource", () => {
  it("getProfiles: applies fleet_id/role/id filters and unwraps data", async () => {
    const client = makeFakeClient({ profiles: { data: [{ id: "d1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    const result = await ds.getProfiles({ fleet_id: "f1", role: "driver", id: "d1" });
    expect(result).toEqual([{ id: "d1" }]);
    expect(client.calls[0].eq).toEqual([
      ["fleet_id", "f1"],
      ["role", "driver"],
      ["id", "d1"],
    ]);
  });

  it("getProfiles: no filter applies no eq calls, defaults data to []", async () => {
    const client = makeFakeClient({ profiles: { data: null as unknown as never[], error: null } });
    const ds = createSupabaseDataSource(client as never);
    const result = await ds.getProfiles();
    expect(result).toEqual([]);
    expect(client.calls[0].eq).toEqual([]);
  });

  it("getProfiles: throws on error", async () => {
    const client = makeFakeClient({ profiles: { data: null, error: new Error("boom") } });
    const ds = createSupabaseDataSource(client as never);
    await expect(ds.getProfiles()).rejects.toThrow("boom");
  });

  it("getFleets: applies id filter and defaults", async () => {
    const client = makeFakeClient({ fleets: { data: [{ id: "f1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    expect(await ds.getFleets({ id: "f1" })).toEqual([{ id: "f1" }]);
    expect(await ds.getFleets()).toEqual([{ id: "f1" }]);
  });

  it("getDevices: applies driver_id filter and defaults", async () => {
    const client = makeFakeClient({ devices: { data: [{ id: "dev1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    expect(await ds.getDevices({ driver_id: "d1" })).toEqual([{ id: "dev1" }]);
    expect(await ds.getDevices()).toEqual([{ id: "dev1" }]);
  });

  it("getDrivingSessions: applies fleet_id/driver_id/status filters", async () => {
    const client = makeFakeClient({ driving_sessions: { data: [{ id: "s1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    const result = await ds.getDrivingSessions({ fleet_id: "f1", driver_id: "d1", status: "active" });
    expect(result).toEqual([{ id: "s1" }]);
    expect(client.calls[0].eq).toEqual([
      ["fleet_id", "f1"],
      ["driver_id", "d1"],
      ["status", "active"],
    ]);
    await ds.getDrivingSessions();
  });

  it("getDrowsinessEvents: applies session_id/session_ids/severity filters", async () => {
    const client = makeFakeClient({ drowsiness_events: { data: [{ id: "e1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    const result = await ds.getDrowsinessEvents({
      session_id: "s1",
      session_ids: ["s1", "s2"],
      severity: "critical",
    });
    expect(result).toEqual([{ id: "e1" }]);
    expect(client.calls[0].eq).toEqual([["session_id", "s1"], ["severity", "critical"]]);
    expect(client.calls[0].in).toEqual([["session_id", ["s1", "s2"]]]);
    await ds.getDrowsinessEvents();
  });

  it("getRewards: applies driver_id filter and defaults", async () => {
    const client = makeFakeClient({ rewards: { data: [{ id: "r1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    expect(await ds.getRewards({ driver_id: "d1" })).toEqual([{ id: "r1" }]);
    expect(await ds.getRewards()).toEqual([{ id: "r1" }]);
  });

  it("getRedemptions: applies driver_id/status filters", async () => {
    const client = makeFakeClient({ redemptions: { data: [{ id: "rd1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    const result = await ds.getRedemptions({ driver_id: "d1", status: "pending" });
    expect(result).toEqual([{ id: "rd1" }]);
    await ds.getRedemptions();
  });

  it("getFleetReports: applies fleet_id filter and defaults", async () => {
    const client = makeFakeClient({ fleet_reports: { data: [{ id: "rep1" }], error: null } });
    const ds = createSupabaseDataSource(client as never);
    expect(await ds.getFleetReports({ fleet_id: "f1" })).toEqual([{ id: "rep1" }]);
    expect(await ds.getFleetReports()).toEqual([{ id: "rep1" }]);
  });

  it.each([
    ["getFleets", "fleets"],
    ["getDevices", "devices"],
    ["getDrivingSessions", "driving_sessions"],
    ["getDrowsinessEvents", "drowsiness_events"],
    ["getRewards", "rewards"],
    ["getRedemptions", "redemptions"],
    ["getFleetReports", "fleet_reports"],
  ] as const)("%s throws on error", async (method, table) => {
    const client = makeFakeClient({ [table]: { data: null, error: new Error("fail") } });
    const ds = createSupabaseDataSource(client as never);
    await expect((ds[method] as () => Promise<unknown>)()).rejects.toThrow("fail");
  });

  it.each([
    ["getFleets", "fleets"],
    ["getDevices", "devices"],
    ["getDrivingSessions", "driving_sessions"],
    ["getDrowsinessEvents", "drowsiness_events"],
    ["getRewards", "rewards"],
    ["getRedemptions", "redemptions"],
    ["getFleetReports", "fleet_reports"],
  ] as const)("%s defaults to [] when data is null and there is no error", async (method, table) => {
    const client = makeFakeClient({ [table]: { data: null, error: null } });
    const ds = createSupabaseDataSource(client as never);
    await expect((ds[method] as () => Promise<unknown>)()).resolves.toEqual([]);
  });
});
