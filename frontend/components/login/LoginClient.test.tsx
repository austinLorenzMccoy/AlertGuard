import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { LoginClient } from "@/components/login/LoginClient";

describe("LoginClient", () => {
  it("redirects to /overview for the default fleet_manager demo role", async () => {
    render(<LoginClient />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/overview");
  });

  it("redirects to /overview for admin", async () => {
    render(<LoginClient />);
    await userEvent.selectOptions(screen.getByLabelText(/Demo role/), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/overview");
  });

  it("redirects to /download for driver", async () => {
    render(<LoginClient />);
    await userEvent.selectOptions(screen.getByLabelText(/Demo role/), "driver");
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(pushMock).toHaveBeenCalledWith("/download");
  });
});
