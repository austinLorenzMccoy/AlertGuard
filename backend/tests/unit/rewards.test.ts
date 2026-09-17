import { describe, it, expect, vi } from "vitest";
import {
  calculateReward,
  processRewardCalculation,
  type RewardCalculationDeps,
  type SessionForReward,
} from "../../supabase/functions/_shared/rewards.ts";

describe("calculateReward", () => {
  it("computes points and token amount per the PRD formula", () => {
    // points = round(80 * (50/10)) = round(400) = 400; tokenAmount = 400 * 0.01 = 4
    expect(calculateReward(80, 50, 0.01)).toEqual({ points: 400, tokenAmount: 4 });
  });

  it("rounds points to the nearest integer", () => {
    // round(75 * (7/10)) = round(52.5) = 53 (banker's? Math.round(52.5) = 53)
    expect(calculateReward(75, 7, 1).points).toBe(53);
  });

  it("treats a null safety score as zero", () => {
    expect(calculateReward(null, 50, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("treats an undefined safety score as zero", () => {
    expect(calculateReward(undefined, 50, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("clamps a negative safety score to zero", () => {
    expect(calculateReward(-10, 50, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("treats a NaN safety score as zero", () => {
    expect(calculateReward(NaN, 50, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("treats a null distance as zero", () => {
    expect(calculateReward(80, null, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("treats an undefined distance as zero", () => {
    expect(calculateReward(80, undefined, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("clamps a negative distance to zero", () => {
    expect(calculateReward(80, -5, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("treats a non-finite distance as zero", () => {
    expect(calculateReward(80, Infinity, 0.01).points).toBe(0);
  });

  it("clamps a negative token rate to zero", () => {
    expect(calculateReward(80, 50, -1)).toEqual({ points: 400, tokenAmount: 0 });
  });

  it("returns zero for a zero safety score even with positive distance", () => {
    expect(calculateReward(0, 100, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("returns zero for a zero distance even with a perfect safety score", () => {
    expect(calculateReward(100, 0, 0.01)).toEqual({ points: 0, tokenAmount: 0 });
  });

  it("throws a TypeError when tokenRatePerPoint is not a number", () => {
    expect(() => calculateReward(80, 50, "bad" as unknown as number)).toThrow(TypeError);
  });

  it("throws a TypeError when tokenRatePerPoint is NaN", () => {
    expect(() => calculateReward(80, 50, NaN)).toThrow(TypeError);
  });

  it("throws a TypeError when tokenRatePerPoint is non-finite", () => {
    expect(() => calculateReward(80, 50, Infinity)).toThrow(TypeError);
  });
});

describe("processRewardCalculation", () => {
  function makeSession(overrides: Partial<SessionForReward> = {}): SessionForReward {
    return {
      id: "session-1",
      driver_id: "driver-1",
      safety_score: 90,
      distance_km: 20,
      ...overrides,
    };
  }

  function makeDeps(overrides: Partial<RewardCalculationDeps> = {}): RewardCalculationDeps {
    return {
      tokenRatePerPoint: 0.01,
      insertPendingReward: vi.fn().mockResolvedValue({ id: "reward-1" }),
      triggerPayout: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("inserts a pending reward and chains into triggerPayout", async () => {
    const deps = makeDeps();
    const result = await processRewardCalculation(makeSession(), deps);

    expect(deps.insertPendingReward).toHaveBeenCalledWith({
      driverId: "driver-1",
      sessionId: "session-1",
      points: 180, // round(90 * 2)
      tokenAmount: 1.8,
    });
    expect(deps.triggerPayout).toHaveBeenCalledWith("reward-1");
    expect(result).toEqual({ rewardId: "reward-1", points: 180, tokenAmount: 1.8 });
  });

  it("throws when the session has no driver_id", async () => {
    const deps = makeDeps();
    await expect(
      processRewardCalculation(makeSession({ driver_id: null }), deps)
    ).rejects.toThrow(/no driver_id/);
    expect(deps.insertPendingReward).not.toHaveBeenCalled();
  });

  it("propagates a zero reward for an unscored session without calling triggerPayout differently", async () => {
    const deps = makeDeps();
    const result = await processRewardCalculation(
      makeSession({ safety_score: null }),
      deps
    );
    expect(result.points).toBe(0);
    expect(result.tokenAmount).toBe(0);
    expect(deps.triggerPayout).toHaveBeenCalledWith("reward-1");
  });
});
