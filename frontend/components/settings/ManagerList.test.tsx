import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const promoteUserMock = vi.fn();
vi.mock("@/app/(dashboard)/settings/actions", () => ({
  promoteUser: (...args: unknown[]) => promoteUserMock(...args),
}));

import { ManagerList } from "@/components/settings/ManagerList";

describe("ManagerList (demo mode — no Supabase env vars)", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    promoteUserMock.mockReset();
  });

  it("shows an empty state with no managers", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    expect(screen.getByText("No managers yet.")).toBeInTheDocument();
  });

  it("lists initial managers", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(
      <ManagerList
        initialManagers={[{ id: "m1", email: "a@b.com" }]}
        currentUserRole="fleet_manager"
        currentUserFleetId="f1"
      />,
    );
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
  });

  it("never renders the role selector or fleet ID input in demo mode", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fleet ID/)).not.toBeInTheDocument();
  });

  it("shows an error and does not add an invalid email", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByText("No managers yet.")).toBeInTheDocument();
    expect(promoteUserMock).not.toHaveBeenCalled();
  });

  it("adds a manager locally and clears the input for a valid email, without calling the Server Action", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "new@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(screen.getByText("new@fleet.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Invite manager")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(promoteUserMock).not.toHaveBeenCalled();
  });
});

describe("ManagerList (real mode — Supabase env vars configured)", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    promoteUserMock.mockReset();
  });

  function setRealMode() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  }

  it("shows the role selector without an Admin option, and no Fleet ID input, for a fleet_manager caller", () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fleet ID/)).not.toBeInTheDocument();
  });

  it("shows the Admin option and a Fleet ID input for an admin caller", () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId="f9" />);
    expect(screen.getByRole("option", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fleet ID")).toBeInTheDocument();
  });

  it("labels the Fleet ID input as optional when Admin is selected", async () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    expect(screen.getByLabelText("Fleet ID (optional)")).toBeInTheDocument();
  });

  it("blocks submission client-side with fleet_id_required when an admin leaves Fleet ID blank for a fleet_manager promotion", async () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a fleet ID for this fleet manager.");
    expect(promoteUserMock).not.toHaveBeenCalled();
  });

  it("promotes a target to fleet_manager as an admin caller, with the entered fleet ID, and shows success", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({
      status: "success",
      targetId: "target-1",
      role: "fleet_manager",
      fleetId: "fleet-9",
    });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.type(screen.getByLabelText("Fleet ID"), "fleet-9");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({
        email: "target@fleet.com",
        role: "fleet_manager",
        fleetId: "fleet-9",
      }),
    );
    expect(await screen.findByText("target@fleet.com promoted to fleet manager.")).toBeInTheDocument();
    expect(screen.getByText("target@fleet.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Invite manager")).toHaveValue("");
  });

  it("promotes a target to admin as an admin caller with no fleet ID entered, passing fleetId: null and showing success", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({
      status: "success",
      targetId: "target-2",
      role: "admin",
      fleetId: null,
    });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    await userEvent.type(screen.getByLabelText("Invite manager"), "newadmin@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({
        email: "newadmin@fleet.com",
        role: "admin",
        fleetId: null,
      }),
    );
    expect(await screen.findByText("newadmin@fleet.com promoted to admin.")).toBeInTheDocument();
  });

  it("promotes a target to fleet_manager as a fleet_manager caller, with no fleet ID sent (server forces the caller's own fleet)", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({
      status: "success",
      targetId: "target-3",
      role: "fleet_manager",
      fleetId: "manager-fleet",
    });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="manager-fleet" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({
        email: "target@fleet.com",
        role: "fleet_manager",
        fleetId: undefined,
      }),
    );
    expect(await screen.findByText("target@fleet.com promoted to fleet manager.")).toBeInTheDocument();
  });

  it("shows the disabled 'Sending...' state while the Server Action is pending", async () => {
    setRealMode();
    let resolvePromise: (value: unknown) => void = () => {};
    promoteUserMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByRole("button", { name: "Sending..." })).toBeDisabled();

    resolvePromise({ status: "success", targetId: "t1", role: "fleet_manager", fleetId: "f1" });
    await screen.findByRole("button", { name: "Send invite" });
  });

  it("shows the user_not_found message and adds nothing when the target hasn't signed in yet", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({ status: "error", reason: "user_not_found" });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "nobody@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(
      await screen.findByText(
        "This person needs to sign in to AlertGuard at least once before they can be promoted.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("No managers yet.")).toBeInTheDocument();
  });

  it("shows the forbidden message for a forbidden result", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({ status: "error", reason: "forbidden" });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText("You don't have permission to assign that role.")).toBeInTheDocument();
  });

  it("shows the cannot_modify_own_role message for a self-promotion attempt", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({ status: "error", reason: "cannot_modify_own_role" });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    await userEvent.type(screen.getByLabelText("Invite manager"), "self@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText("You cannot change your own role.")).toBeInTheDocument();
  });

  it("shows a generic error message for an unexpected error reason", async () => {
    setRealMode();
    promoteUserMock.mockResolvedValue({ status: "error", reason: "error" });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "target@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
