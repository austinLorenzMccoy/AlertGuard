import { describe, expect, it, vi } from "vitest";

const exchangeCodeForSessionMock = vi.fn();
const createServerSupabaseClientMock = vi.fn(() => ({
  auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  it("redirects to /login?error=missing_code when no code param is present", async () => {
    const request = new Request("https://app.example.com/auth/callback");
    const response = await GET(request as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?error=missing_code",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("redirects to /overview after successfully exchanging a valid code", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: null });
    const request = new Request("https://app.example.com/auth/callback?code=abc123");
    const response = await GET(request as never);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/overview");
  });

  it("redirects to /login?error=auth_callback_failed when the exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: new Error("bad code") });
    const request = new Request("https://app.example.com/auth/callback?code=bad");
    const response = await GET(request as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/login?error=auth_callback_failed",
    );
  });
});
