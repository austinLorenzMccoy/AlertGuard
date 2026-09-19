import { describe, it, expect, vi } from "vitest";
import {
  authorizeRoleChange,
  manageUserRole,
  selectPromotableUsers,
  listPromotableUsers,
  type CallerProfileRepo,
  type TargetUserResolver,
  type TargetProfileRepo,
  type RoleChangeAuditLogger,
  type ProfileRole,
  type PromotableUser,
  type AllUsersRepo,
} from "../../supabase/functions/_shared/roles.ts";

describe("authorizeRoleChange", () => {
  it("denies a driver caller with forbidden", () => {
    expect(
      authorizeRoleChange({
        callerRole: "driver",
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: "fleet-1",
      })
    ).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("denies a caller with no profile row at all with forbidden", () => {
    expect(
      authorizeRoleChange({
        callerRole: null,
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: "fleet-1",
      })
    ).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("allows a fleet_manager to grant fleet_manager, forcing the caller's own fleet_id and ignoring the requested one", () => {
    expect(
      authorizeRoleChange({
        callerRole: "fleet_manager",
        callerFleetId: "caller-fleet",
        requestedRole: "fleet_manager",
        requestedFleetId: "some-other-fleet",
      })
    ).toEqual({ allowed: true, fleetId: "caller-fleet" });
  });

  it("allows a fleet_manager to grant fleet_manager when no fleet_id was requested, using the caller's own fleet_id", () => {
    expect(
      authorizeRoleChange({
        callerRole: "fleet_manager",
        callerFleetId: "caller-fleet",
        requestedRole: "fleet_manager",
        requestedFleetId: undefined,
      })
    ).toEqual({ allowed: true, fleetId: "caller-fleet" });
  });

  it("denies a fleet_manager requesting admin with forbidden", () => {
    expect(
      authorizeRoleChange({
        callerRole: "fleet_manager",
        callerFleetId: "caller-fleet",
        requestedRole: "admin",
        requestedFleetId: null,
      })
    ).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("allows an admin to grant fleet_manager when a fleet_id is provided", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: "target-fleet",
      })
    ).toEqual({ allowed: true, fleetId: "target-fleet" });
  });

  it("denies an admin granting fleet_manager with no fleet_id, reason fleet_id_required", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: undefined,
      })
    ).toEqual({ allowed: false, reason: "fleet_id_required" });
  });

  it("denies an admin granting fleet_manager with an empty-string fleet_id, reason fleet_id_required", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: "",
      })
    ).toEqual({ allowed: false, reason: "fleet_id_required" });
  });

  it("denies an admin granting fleet_manager with a null fleet_id, reason fleet_id_required", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "fleet_manager",
        requestedFleetId: null,
      })
    ).toEqual({ allowed: false, reason: "fleet_id_required" });
  });

  it("allows an admin to grant admin with a fleet_id passed through", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "admin",
        requestedFleetId: "some-fleet",
      })
    ).toEqual({ allowed: true, fleetId: "some-fleet" });
  });

  it("allows an admin to grant admin with fleet_id explicitly null", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "admin",
        requestedFleetId: null,
      })
    ).toEqual({ allowed: true, fleetId: null });
  });

  it("allows an admin to grant admin with no fleet_id at all, defaulting to null", () => {
    expect(
      authorizeRoleChange({
        callerRole: "admin",
        callerFleetId: null,
        requestedRole: "admin",
        requestedFleetId: undefined,
      })
    ).toEqual({ allowed: true, fleetId: null });
  });
});

describe("manageUserRole", () => {
  function makeDeps(overrides: {
    callerProfile?: { role: ProfileRole; fleet_id: string | null } | null;
    targetUserId?: string | null;
    targetProfile?: { role: ProfileRole; fleet_id: string | null } | null;
  } = {}): {
    callerProfiles: CallerProfileRepo;
    targetUserResolver: TargetUserResolver;
    targetProfiles: TargetProfileRepo;
    auditLogger: RoleChangeAuditLogger;
  } {
    return {
      callerProfiles: {
        findCallerProfile: vi.fn().mockResolvedValue(
          overrides.callerProfile === undefined
            ? { role: "admin", fleet_id: null }
            : overrides.callerProfile
        ),
      },
      targetUserResolver: {
        findUserIdByEmail: vi
          .fn()
          .mockResolvedValue(overrides.targetUserId === undefined ? "target-1" : overrides.targetUserId),
      },
      targetProfiles: {
        findTargetProfile: vi.fn().mockResolvedValue(
          overrides.targetProfile === undefined
            ? { role: "driver", fleet_id: null }
            : overrides.targetProfile
        ),
        updateRoleAndFleet: vi.fn().mockResolvedValue(undefined),
      },
      auditLogger: {
        logRoleChange: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  it("promotes a target user to fleet_manager (admin caller) and writes an audit row", async () => {
    const deps = makeDeps({
      callerProfile: { role: "admin", fleet_id: null },
      targetProfile: { role: "driver", fleet_id: null },
    });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "fleet_manager", fleetId: "fleet-9" },
      deps
    );

    expect(result).toEqual({ status: "success", targetId: "target-1", role: "fleet_manager", fleetId: "fleet-9" });
    expect(deps.targetProfiles.updateRoleAndFleet).toHaveBeenCalledWith("target-1", "fleet_manager", "fleet-9");
    expect(deps.auditLogger.logRoleChange).toHaveBeenCalledWith({
      actorId: "caller-1",
      targetId: "target-1",
      oldRole: "driver",
      newRole: "fleet_manager",
      oldFleetId: null,
      newFleetId: "fleet-9",
    });
  });

  it("promotes a target user to admin (admin caller) with no fleet_id", async () => {
    const deps = makeDeps({
      callerProfile: { role: "admin", fleet_id: null },
      targetProfile: { role: "fleet_manager", fleet_id: "old-fleet" },
    });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "admin" },
      deps
    );

    expect(result).toEqual({ status: "success", targetId: "target-1", role: "admin", fleetId: null });
    expect(deps.targetProfiles.updateRoleAndFleet).toHaveBeenCalledWith("target-1", "admin", null);
  });

  it("promotes a target user to fleet_manager (fleet_manager caller), forcing the caller's own fleet_id", async () => {
    const deps = makeDeps({
      callerProfile: { role: "fleet_manager", fleet_id: "manager-fleet" },
      targetProfile: { role: "driver", fleet_id: null },
    });

    const result = await manageUserRole(
      {
        callerId: "caller-1",
        email: "target@example.com",
        role: "fleet_manager",
        fleetId: "some-other-fleet-should-be-ignored",
      },
      deps
    );

    expect(result).toEqual({ status: "success", targetId: "target-1", role: "fleet_manager", fleetId: "manager-fleet" });
    expect(deps.targetProfiles.updateRoleAndFleet).toHaveBeenCalledWith("target-1", "fleet_manager", "manager-fleet");
  });

  it("rejects with cannot_modify_own_role, unconditionally, before any role-authorization logic runs, when the target email is the caller's own account", async () => {
    const deps = makeDeps({
      callerProfile: { role: "admin", fleet_id: null },
      targetUserId: "caller-1",
    });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "self@example.com", role: "admin" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "cannot_modify_own_role" });
    // Proves the guard fired before the authorization/profile-lookup/update
    // machinery ever ran — an admin cannot use this endpoint on their own row.
    expect(deps.callerProfiles.findCallerProfile).not.toHaveBeenCalled();
    expect(deps.targetProfiles.findTargetProfile).not.toHaveBeenCalled();
    expect(deps.targetProfiles.updateRoleAndFleet).not.toHaveBeenCalled();
    expect(deps.auditLogger.logRoleChange).not.toHaveBeenCalled();
  });

  it("returns user_not_found and touches nothing else when no account exists for the given email", async () => {
    const deps = makeDeps({ targetUserId: null });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "nobody@example.com", role: "fleet_manager", fleetId: "fleet-1" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "user_not_found" });
    expect(deps.callerProfiles.findCallerProfile).not.toHaveBeenCalled();
    expect(deps.targetProfiles.updateRoleAndFleet).not.toHaveBeenCalled();
  });

  it("returns forbidden and writes nothing when the caller is a driver", async () => {
    const deps = makeDeps({ callerProfile: { role: "driver", fleet_id: null } });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "fleet_manager", fleetId: "fleet-1" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "forbidden" });
    expect(deps.targetProfiles.updateRoleAndFleet).not.toHaveBeenCalled();
    expect(deps.auditLogger.logRoleChange).not.toHaveBeenCalled();
  });

  it("returns forbidden when the caller has no profile row at all", async () => {
    const deps = makeDeps({ callerProfile: null });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "fleet_manager", fleetId: "fleet-1" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "forbidden" });
  });

  it("returns fleet_id_required when an admin tries to grant fleet_manager without a fleet_id", async () => {
    const deps = makeDeps({ callerProfile: { role: "admin", fleet_id: null } });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "fleet_manager" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "fleet_id_required" });
    expect(deps.targetProfiles.updateRoleAndFleet).not.toHaveBeenCalled();
  });

  it("returns profile_not_ready and writes nothing when the target user exists but has no profiles row", async () => {
    const deps = makeDeps({
      callerProfile: { role: "admin", fleet_id: null },
      targetProfile: null,
    });

    const result = await manageUserRole(
      { callerId: "caller-1", email: "target@example.com", role: "admin" },
      deps
    );

    expect(result).toEqual({ status: "error", reason: "profile_not_ready" });
    expect(deps.targetProfiles.updateRoleAndFleet).not.toHaveBeenCalled();
    expect(deps.auditLogger.logRoleChange).not.toHaveBeenCalled();
  });
});

describe("selectPromotableUsers", () => {
  const users: PromotableUser[] = [
    { id: "caller-1", email: "caller@example.com", fullName: "Caller", role: "admin", fleetId: null },
    { id: "driver-unassigned", email: "d1@example.com", fullName: "D1", role: "driver", fleetId: null },
    { id: "driver-own-fleet", email: "d2@example.com", fullName: "D2", role: "driver", fleetId: "fleet-a" },
    { id: "driver-other-fleet", email: "d3@example.com", fullName: "D3", role: "driver", fleetId: "fleet-b" },
    { id: "manager-1", email: "m1@example.com", fullName: "M1", role: "fleet_manager", fleetId: "fleet-a" },
    { id: "admin-2", email: "a2@example.com", fullName: "A2", role: "admin", fleetId: null },
  ];

  it("returns every other user for an admin caller, excluding the caller's own row", () => {
    const result = selectPromotableUsers("caller-1", "admin", null, users);
    expect(result.map((u) => u.id)).toEqual([
      "driver-unassigned",
      "driver-own-fleet",
      "driver-other-fleet",
      "manager-1",
      "admin-2",
    ]);
  });

  it("returns only unassigned or own-fleet drivers for a fleet_manager caller", () => {
    const result = selectPromotableUsers("caller-1", "fleet_manager", "fleet-a", users);
    expect(result.map((u) => u.id)).toEqual(["driver-unassigned", "driver-own-fleet"]);
  });

  it("excludes other fleets' drivers and non-driver roles for a fleet_manager caller", () => {
    const result = selectPromotableUsers("caller-1", "fleet_manager", "fleet-a", users);
    expect(result.some((u) => u.id === "driver-other-fleet")).toBe(false);
    expect(result.some((u) => u.id === "manager-1")).toBe(false);
    expect(result.some((u) => u.id === "admin-2")).toBe(false);
  });

  it("returns an empty list for a driver caller", () => {
    expect(selectPromotableUsers("caller-1", "driver", null, users)).toEqual([]);
  });

  it("returns an empty list when the caller has no profile row at all", () => {
    expect(selectPromotableUsers("caller-1", null, null, users)).toEqual([]);
  });
});

describe("listPromotableUsers", () => {
  function makeDeps(overrides: {
    callerProfile?: { role: ProfileRole; fleet_id: string | null } | null;
    allUsers?: PromotableUser[];
  } = {}): { callerProfiles: CallerProfileRepo; allUsers: AllUsersRepo } {
    return {
      callerProfiles: {
        findCallerProfile: vi.fn().mockResolvedValue(
          overrides.callerProfile === undefined
            ? { role: "admin", fleet_id: null }
            : overrides.callerProfile
        ),
      },
      allUsers: {
        listAllUsers: vi.fn().mockResolvedValue(overrides.allUsers ?? []),
      },
    };
  }

  it("returns the scoped user list for an authorized caller", async () => {
    const deps = makeDeps({
      callerProfile: { role: "admin", fleet_id: null },
      allUsers: [
        { id: "caller-1", email: "caller@example.com", fullName: null, role: "admin", fleetId: null },
        { id: "driver-1", email: "d1@example.com", fullName: null, role: "driver", fleetId: null },
      ],
    });

    const result = await listPromotableUsers("caller-1", deps);

    expect(result).toEqual({
      status: "success",
      users: [{ id: "driver-1", email: "d1@example.com", fullName: null, role: "driver", fleetId: null }],
    });
    expect(deps.allUsers.listAllUsers).toHaveBeenCalled();
  });

  it("returns forbidden and never fetches the full user list when the caller is a driver", async () => {
    const deps = makeDeps({ callerProfile: { role: "driver", fleet_id: null } });

    const result = await listPromotableUsers("caller-1", deps);

    expect(result).toEqual({ status: "error", reason: "forbidden" });
    expect(deps.allUsers.listAllUsers).not.toHaveBeenCalled();
  });

  it("returns forbidden when the caller has no profile row at all", async () => {
    const deps = makeDeps({ callerProfile: null });

    const result = await listPromotableUsers("caller-1", deps);

    expect(result).toEqual({ status: "error", reason: "forbidden" });
    expect(deps.allUsers.listAllUsers).not.toHaveBeenCalled();
  });
});
