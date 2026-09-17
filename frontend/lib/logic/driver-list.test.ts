import { describe, expect, it } from "vitest";
import { filterDrivers, sortDrivers } from "@/lib/logic/driver-list";
import type { DriverListRow } from "@/lib/types";

function row(overrides: Partial<DriverListRow>): DriverListRow {
  return {
    driver: {
      id: "d1",
      full_name: "Bravo",
      phone: null,
      role: "driver",
      fleet_id: "f1",
      wallet_address: null,
      created_at: "",
      updated_at: "",
    },
    currentScore: 70,
    scoreBand: "warning",
    sevenDayTrend: [],
    totalVerifiedTrips: 3,
    lastActive: "2026-09-10T00:00:00.000Z",
    alertCount: 1,
    isActive: false,
    ...overrides,
  };
}

describe("sortDrivers", () => {
  const rows = [
    row({ driver: { ...row({}).driver, id: "a", full_name: "Zeta" }, currentScore: 90, totalVerifiedTrips: 1, alertCount: 5, lastActive: "2026-09-01" }),
    row({ driver: { ...row({}).driver, id: "b", full_name: "Alpha" }, currentScore: 40, totalVerifiedTrips: 9, alertCount: 0, lastActive: "2026-09-15" }),
  ];

  it("sorts by name ascending", () => {
    const sorted = sortDrivers(rows, "name", "asc");
    expect(sorted.map((r) => r.driver.full_name)).toEqual(["Alpha", "Zeta"]);
  });

  it("sorts by name descending", () => {
    const sorted = sortDrivers(rows, "name", "desc");
    expect(sorted.map((r) => r.driver.full_name)).toEqual(["Zeta", "Alpha"]);
  });

  it("sorts by score ascending, treating null as lowest", () => {
    const withNull = [...rows, row({ driver: { ...row({}).driver, id: "c", full_name: "Null" }, currentScore: null })];
    const sorted = sortDrivers(withNull, "score", "asc");
    expect(sorted[0].driver.full_name).toBe("Null");
  });

  it("sorts by trips", () => {
    const sorted = sortDrivers(rows, "trips", "asc");
    expect(sorted.map((r) => r.driver.full_name)).toEqual(["Zeta", "Alpha"]);
  });

  it("sorts by alerts", () => {
    const sorted = sortDrivers(rows, "alerts", "asc");
    expect(sorted.map((r) => r.driver.full_name)).toEqual(["Alpha", "Zeta"]);
  });

  it("sorts by lastActive", () => {
    const sorted = sortDrivers(rows, "lastActive", "asc");
    expect(sorted.map((r) => r.driver.full_name)).toEqual(["Zeta", "Alpha"]);
  });

  it("defaults to ascending order and does not mutate the input array", () => {
    const copy = [...rows];
    sortDrivers(rows, "name");
    expect(rows).toEqual(copy);
  });

  it("treats a null full_name as empty string on either side of the comparison", () => {
    const named = row({ driver: { ...row({}).driver, id: "n", full_name: "Mid" } });
    const unnamed = row({ driver: { ...row({}).driver, id: "u", full_name: null } });
    expect(sortDrivers([unnamed, named], "name", "asc").map((r) => r.driver.id)).toEqual(["u", "n"]);
    expect(sortDrivers([named, unnamed], "name", "asc").map((r) => r.driver.id)).toEqual(["u", "n"]);
  });

  it("treats a null currentScore as -1 on either side of the comparison", () => {
    const scored = row({ driver: { ...row({}).driver, id: "s" }, currentScore: 50 });
    const unscored = row({ driver: { ...row({}).driver, id: "u" }, currentScore: null });
    expect(sortDrivers([unscored, scored], "score", "asc").map((r) => r.driver.id)).toEqual(["u", "s"]);
    expect(sortDrivers([scored, unscored], "score", "asc").map((r) => r.driver.id)).toEqual(["u", "s"]);
  });

  it("treats a null lastActive as empty string on either side of the comparison", () => {
    const active = row({ driver: { ...row({}).driver, id: "a" }, lastActive: "2026-09-10" });
    const never = row({ driver: { ...row({}).driver, id: "n" }, lastActive: null });
    expect(sortDrivers([never, active], "lastActive", "asc").map((r) => r.driver.id)).toEqual(["n", "a"]);
    expect(sortDrivers([active, never], "lastActive", "asc").map((r) => r.driver.id)).toEqual(["n", "a"]);
  });
});

describe("filterDrivers", () => {
  const rows = [
    row({ driver: { ...row({}).driver, id: "a" }, scoreBand: "good", isActive: true, alertCount: 0 }),
    row({ driver: { ...row({}).driver, id: "b" }, scoreBand: "critical", isActive: false, alertCount: 4 }),
  ];

  it("returns all rows when scoreBand filter is 'all'", () => {
    expect(filterDrivers(rows, { scoreBand: "all" })).toHaveLength(2);
  });

  it("filters by score band", () => {
    const filtered = filterDrivers(rows, { scoreBand: "critical" });
    expect(filtered.map((r) => r.driver.id)).toEqual(["b"]);
  });

  it("filters by activeOnly", () => {
    const filtered = filterDrivers(rows, { activeOnly: true });
    expect(filtered.map((r) => r.driver.id)).toEqual(["a"]);
  });

  it("filters by minAlerts", () => {
    const filtered = filterDrivers(rows, { minAlerts: 2 });
    expect(filtered.map((r) => r.driver.id)).toEqual(["b"]);
  });

  it("applies no filters when none are given", () => {
    expect(filterDrivers(rows, {})).toHaveLength(2);
  });
});
