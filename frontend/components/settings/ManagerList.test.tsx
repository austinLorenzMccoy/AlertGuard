import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const promoteUserMock = vi.fn();
const listPromotableUsersMock = vi.fn();
vi.mock("@/app/(dashboard)/settings/actions", () => ({
  promoteUser: (...args: unknown[]) => promoteUserMock(...args),
  listPromotableUsers: (...args: unknown[]) => listPromotableUsersMock(...args),
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
    listPromotableUsersMock.mockReset();
  });

  function setRealMode() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    listPromotableUsersMock.mockResolvedValue({ status: "success", users: [] });
  }

  it("shows the role selector without an Admin option, and no Fleet ID input, for a fleet_manager caller", async () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    await screen.findByText("No accounts available to promote.");
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fleet ID/)).not.toBeInTheDocument();
  });

  it("shows the Admin option and a Fleet ID input for an admin caller", async () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId="f9" />);
    await screen.findByText("No accounts available to promote.");
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

  it("shows the empty state when there are no signed-up accounts to promote", async () => {
    setRealMode();
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    expect(await screen.findByText("No accounts available to promote.")).toBeInTheDocument();
  });

  it("shows an error when the signed-up accounts list fails to load", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({ status: "error", reason: "forbidden" });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);
    expect(await screen.findByText("Couldn't load signed-up accounts.")).toBeInTheDocument();
  });

  it("lists signed-up accounts and promotes one with a single click for a fleet_manager caller (no role/fleet inputs)", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({
      status: "success",
      users: [{ id: "u1", email: "driver1@fleet.com", fullName: "Driver One", role: "driver", fleetId: null }],
    });
    promoteUserMock.mockResolvedValue({
      status: "success",
      targetId: "u1",
      role: "fleet_manager",
      fleetId: "manager-fleet",
    });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="manager-fleet" />);

    expect(await screen.findByText("Driver One")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Role for/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fleet ID for/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({
        email: "driver1@fleet.com",
        role: "fleet_manager",
        fleetId: undefined,
      }),
    );
    expect(await screen.findByText("driver1@fleet.com promoted to fleet manager.")).toBeInTheDocument();
    expect(screen.getByText("driver1@fleet.com")).toBeInTheDocument(); // now in the managers list
    expect(screen.queryByText("Driver One")).not.toBeInTheDocument(); // removed from the candidates list
  });

  it("shows a role selector and fleet ID input per candidate for an admin caller, and blocks promotion without a fleet ID", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({
      status: "success",
      users: [{ id: "u2", email: "driver2@fleet.com", fullName: null, role: "driver", fleetId: null }],
    });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);

    expect(await screen.findByLabelText("Role for driver2@fleet.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Fleet ID for driver2@fleet.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Promote" }));

    expect(await screen.findByText("Enter a fleet ID for this fleet manager.")).toBeInTheDocument();
    expect(promoteUserMock).not.toHaveBeenCalled();
  });

  it("promotes a candidate to fleet_manager for an admin caller after entering a fleet ID", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({
      status: "success",
      users: [{ id: "u5", email: "driver5@fleet.com", fullName: null, role: "driver", fleetId: null }],
    });
    promoteUserMock.mockResolvedValue({
      status: "success",
      targetId: "u5",
      role: "fleet_manager",
      fleetId: "fleet-7",
    });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);

    await userEvent.type(await screen.findByLabelText("Fleet ID for driver5@fleet.com"), "fleet-7");
    await userEvent.click(screen.getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({
        email: "driver5@fleet.com",
        role: "fleet_manager",
        fleetId: "fleet-7",
      }),
    );
    expect(await screen.findByText("driver5@fleet.com promoted to fleet manager.")).toBeInTheDocument();
  });

  it("promotes a candidate to admin for an admin caller, hiding the fleet ID input and requiring none", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({
      status: "success",
      users: [{ id: "u3", email: "driver3@fleet.com", fullName: null, role: "driver", fleetId: null }],
    });
    promoteUserMock.mockResolvedValue({ status: "success", targetId: "u3", role: "admin", fleetId: null });
    render(<ManagerList initialManagers={[]} currentUserRole="admin" currentUserFleetId={null} />);

    await userEvent.selectOptions(await screen.findByLabelText("Role for driver3@fleet.com"), "admin");
    expect(screen.queryByLabelText("Fleet ID for driver3@fleet.com")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(promoteUserMock).toHaveBeenCalledWith({ email: "driver3@fleet.com", role: "admin", fleetId: null }),
    );
    expect(await screen.findByText("driver3@fleet.com promoted to admin.")).toBeInTheDocument();
  });

  it("does not update state after unmounting before the account list fetch resolves", async () => {
    setRealMode();
    let resolveFetch: (value: unknown) => void = () => {};
    listPromotableUsersMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { unmount } = render(
      <ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />,
    );
    unmount();

    resolveFetch({
      status: "success",
      users: [{ id: "u9", email: "toolate@fleet.com", fullName: null, role: "driver", fleetId: null }],
    });
    // Nothing to assert on screen (the component is unmounted) — this just
    // proves the post-unmount .then() branch doesn't throw or warn.
    await waitFor(() => expect(listPromotableUsersMock).toHaveBeenCalled());
  });

  it("shows a per-candidate error and keeps the candidate listed when promotion fails", async () => {
    setRealMode();
    listPromotableUsersMock.mockResolvedValue({
      status: "success",
      users: [{ id: "u4", email: "driver4@fleet.com", fullName: null, role: "driver", fleetId: null }],
    });
    promoteUserMock.mockResolvedValue({ status: "error", reason: "profile_not_ready" });
    render(<ManagerList initialManagers={[]} currentUserRole="fleet_manager" currentUserFleetId="f1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Promote" }));

    expect(
      await screen.findByText("This account isn't fully set up yet. Try again shortly."),
    ).toBeInTheDocument();
    expect(screen.getByText("driver4@fleet.com")).toBeInTheDocument(); // still listed as a candidate
  });
});
