import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const createServerSupabaseClientMock = vi.fn(() => ({
  auth: { getSession: getSessionMock },
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

import { promoteUser, listPromotableUsers } from "@/app/(dashboard)/settings/actions";

describe("promoteUser", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    global.fetch = originalFetch;
    getSessionMock.mockReset();
    createServerSupabaseClientMock.mockClear();
  });

  it("returns a generic error and never constructs a client when NEXT_PUBLIC_SUPABASE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "error" });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("returns forbidden and never calls fetch when there is no session/access token", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the manage-user-role Edge Function with the caller's bearer token and returns success", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", targetId: "target-1", role: "fleet_manager", fleetId: "f9" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f9" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/manage-user-role",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
        }),
        body: JSON.stringify({ email: "a@b.com", role: "fleet_manager", fleet_id: "f9" }),
      }),
    );
    expect(result).toEqual({ status: "success", targetId: "target-1", role: "fleet_manager", fleetId: "f9" });
  });

  it("defaults fleetId to null in the request body when not provided", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", targetId: "target-2", role: "admin" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "admin" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ email: "a@b.com", role: "admin", fleet_id: null }) }),
    );
    // fleetId absent on the mocked response body -> `?? null` branch.
    expect(result).toEqual({ status: "success", targetId: "target-2", role: "admin", fleetId: null });
  });

  it("returns a known error reason from a non-success response body", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: "error", reason: "user_not_found" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "nobody@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "user_not_found" });
  });

  it("returns a generic error when the response body has an unrecognized reason", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: "error", reason: "some_new_unmapped_reason" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "error" });
  });

  it("returns a generic error when the response body can't be parsed as JSON", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "error" });
  });

  it("returns a generic error when fetch itself throws (network failure)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await promoteUser({ email: "a@b.com", role: "fleet_manager", fleetId: "f1" });
    expect(result).toEqual({ status: "error", reason: "error" });
  });
});

describe("listPromotableUsers", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    global.fetch = originalFetch;
    getSessionMock.mockReset();
    createServerSupabaseClientMock.mockClear();
  });

  it("returns a generic error and never constructs a client when NEXT_PUBLIC_SUPABASE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "error" });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("returns forbidden and never calls fetch when there is no session/access token", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the list-promotable-users Edge Function with the caller's bearer token and returns the user list", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const users = [{ id: "u1", email: "u1@example.com", fullName: "U1", role: "driver", fleetId: null }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", users }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/list-promotable-users",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
    expect(result).toEqual({ status: "success", users });
  });

  it("returns forbidden when the response body's reason is forbidden", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: "error", reason: "forbidden" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "forbidden" });
  });

  it("returns a generic error when the response body can't be parsed as JSON", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "error" });
  });

  it("returns a generic error when fetch itself throws (network failure)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "error" });
  });

  it("returns a generic error when the success body's users field isn't an array", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", users: "not-an-array" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listPromotableUsers();
    expect(result).toEqual({ status: "error", reason: "error" });
  });
});
