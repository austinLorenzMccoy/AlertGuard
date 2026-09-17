import { afterEach, describe, expect, it, vi } from "vitest";
import { FLEET_ID } from "@/lib/data/demo-seed";

const createServerSupabaseClientMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

import { getFleetContext, requireFleetId, requireProfile } from "@/lib/auth/fleet-context";
import type { FleetContext } from "@/lib/auth/fleet-context";

function makeFakeClient(opts: {
  user?: { id: string } | null;
  profile?: Record<string, unknown> | null;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
    },
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        single: async () => ({ data: opts.profile ?? null, error: null }),
      };
      return builder;
    },
  };
}

describe("getFleetContext", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    createServerSupabaseClientMock.mockReset();
  });

  it('returns "demo" using the demo seed when Supabase env vars are unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const context = await getFleetContext();
    expect(context).toEqual({
      status: "demo",
      fleetId: FLEET_ID,
      profile: expect.objectContaining({ id: "mgr-1", role: "fleet_manager" }),
    });
  });

  it('returns "unauthenticated" when there is no signed-in user', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerSupabaseClientMock.mockReturnValue(makeFakeClient({ user: null }));

    const context = await getFleetContext();
    expect(context).toEqual({ status: "unauthenticated" });
  });

  it('returns "unauthenticated" when the user has no profiles row', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({ user: { id: "u1" }, profile: null }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "unauthenticated" });
  });

  it('returns "unauthorized_role" for a driver', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({
        user: { id: "u1" },
        profile: { id: "u1", role: "driver", fleet_id: "f1" },
      }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "unauthorized_role", role: "driver" });
  });

  it('returns "unauthorized_role" for an unrecognized role value', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({
        user: { id: "u1" },
        profile: { id: "u1", role: "some_future_role", fleet_id: "f1" },
      }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "unauthorized_role", role: "some_future_role" });
  });

  it('returns "no_fleet" for a fleet_manager with no fleet_id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const profile = { id: "u1", role: "fleet_manager", fleet_id: null };
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({ user: { id: "u1" }, profile }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "no_fleet", profile });
  });

  it('returns "no_fleet" for an admin with no fleet_id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const profile = { id: "u1", role: "admin", fleet_id: null };
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({ user: { id: "u1" }, profile }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "no_fleet", profile });
  });

  it('returns "ok" for a fleet_manager with a resolved fleet_id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const profile = { id: "u1", role: "fleet_manager", fleet_id: "f1" };
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({ user: { id: "u1" }, profile }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "ok", fleetId: "f1", profile });
  });

  it('returns "ok" for an admin with a resolved fleet_id', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const profile = { id: "u1", role: "admin", fleet_id: "f2" };
    createServerSupabaseClientMock.mockReturnValue(
      makeFakeClient({ user: { id: "u1" }, profile }),
    );

    const context = await getFleetContext();
    expect(context).toEqual({ status: "ok", fleetId: "f2", profile });
  });
});

describe("requireFleetId", () => {
  it("returns fleetId for a demo context", () => {
    const context: FleetContext = {
      status: "demo",
      fleetId: "f1",
      profile: {
        id: "mgr-1",
        full_name: "Ada Obi",
        phone: null,
        role: "fleet_manager",
        fleet_id: "f1",
        wallet_address: null,
        created_at: "",
        updated_at: "",
      },
    };
    expect(requireFleetId(context)).toBe("f1");
  });

  it("returns fleetId for an ok context", () => {
    const context: FleetContext = {
      status: "ok",
      fleetId: "f2",
      profile: {
        id: "mgr-1",
        full_name: "Ada Obi",
        phone: null,
        role: "fleet_manager",
        fleet_id: "f2",
        wallet_address: null,
        created_at: "",
        updated_at: "",
      },
    };
    expect(requireFleetId(context)).toBe("f2");
  });

  it.each<FleetContext>([
    { status: "unauthenticated" },
    { status: "unauthorized_role", role: "driver" },
    {
      status: "no_fleet",
      profile: {
        id: "mgr-1",
        full_name: "Ada Obi",
        phone: null,
        role: "fleet_manager",
        fleet_id: null,
        wallet_address: null,
        created_at: "",
        updated_at: "",
      },
    },
  ])("throws for a $status context", (context) => {
    expect(() => requireFleetId(context)).toThrow(/Fleet context is not resolved/);
  });
});

describe("requireProfile", () => {
  it("returns the profile for a demo context", () => {
    const profile = {
      id: "mgr-1",
      full_name: "Ada Obi",
      phone: null,
      role: "fleet_manager" as const,
      fleet_id: "f1",
      wallet_address: null,
      created_at: "",
      updated_at: "",
    };
    const context: FleetContext = { status: "demo", fleetId: "f1", profile };
    expect(requireProfile(context)).toEqual(profile);
  });

  it("returns the profile for an ok context", () => {
    const profile = {
      id: "mgr-1",
      full_name: "Ada Obi",
      phone: null,
      role: "admin" as const,
      fleet_id: "f2",
      wallet_address: null,
      created_at: "",
      updated_at: "",
    };
    const context: FleetContext = { status: "ok", fleetId: "f2", profile };
    expect(requireProfile(context)).toEqual(profile);
  });

  it.each<FleetContext>([
    { status: "unauthenticated" },
    { status: "unauthorized_role", role: "driver" },
    {
      status: "no_fleet",
      profile: {
        id: "mgr-1",
        full_name: "Ada Obi",
        phone: null,
        role: "fleet_manager",
        fleet_id: null,
        wallet_address: null,
        created_at: "",
        updated_at: "",
      },
    },
  ])("throws for a $status context", (context) => {
    expect(() => requireProfile(context)).toThrow(/Fleet context is not resolved/);
  });
});
