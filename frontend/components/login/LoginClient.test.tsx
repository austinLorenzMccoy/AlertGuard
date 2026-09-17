import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signInWithOAuthMock = vi.fn();
const createBrowserSupabaseClientMock = vi.fn(() => ({
  auth: { signInWithOAuth: signInWithOAuthMock },
}));
vi.mock("@/lib/supabase-browser", () => ({
  createBrowserSupabaseClient: () => createBrowserSupabaseClientMock(),
}));

import { LoginClient } from "@/components/login/LoginClient";

describe("LoginClient (demo mode — no Supabase env vars)", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it("redirects to /overview for the default fleet_manager demo role", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<LoginClient />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/overview");
  });

  it("redirects to /overview for admin", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<LoginClient />);
    await userEvent.selectOptions(screen.getByLabelText(/Demo role/), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/overview");
  });

  it("redirects to /download for driver", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<LoginClient />);
    await userEvent.selectOptions(screen.getByLabelText(/Demo role/), "driver");
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/download");
  });
});

describe("LoginClient (real mode — Supabase env vars configured)", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    signInWithOAuthMock.mockReset();
  });

  it("renders a real Continue with Google button with no demo role selector", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    render(<LoginClient />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Demo role/)).not.toBeInTheDocument();
  });

  it("calls signInWithOAuth with the google provider and the auth callback redirect", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    render(<LoginClient />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });
});
