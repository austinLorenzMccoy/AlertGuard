// Pure reward-calculation logic for `calculate-reward`.
// PRD reference: Backend PRD Section 10.2.
//
//   const points = Math.round(session.safety_score * (session.distance_km / 10));
//   const tokenAmount = points * TOKEN_RATE_PER_POINT;
//
// Reproduced here as an injectable pure function per the task requirements,
// with negative/zero guards the PRD's one-line sketch doesn't address:
// a flagged/unscored session (safety_score null or <= 0) or a zero/negative
// distance must never mint a positive reward.

export interface RewardCalculationInput {
  safetyScore: number | null | undefined;
  distanceKm: number | null | undefined;
  tokenRatePerPoint: number;
}

export interface RewardCalculationResult {
  points: number;
  tokenAmount: number;
}

export function calculateReward(
  safetyScore: number | null | undefined,
  distanceKm: number | null | undefined,
  tokenRatePerPoint: number
): RewardCalculationResult {
  if (
    typeof tokenRatePerPoint !== "number" ||
    !Number.isFinite(tokenRatePerPoint)
  ) {
    throw new TypeError("tokenRatePerPoint must be a finite number");
  }

  const safeScore =
    safetyScore == null || !Number.isFinite(safetyScore) || safetyScore < 0
      ? 0
      : safetyScore;

  const safeDistance =
    distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0
      ? 0
      : distanceKm;

  const safeRate = tokenRatePerPoint < 0 ? 0 : tokenRatePerPoint;

  const points = Math.round(safeScore * (safeDistance / 10));
  const tokenAmount = points * safeRate;

  return { points, tokenAmount };
}

export interface RewardCalculationDeps {
  tokenRatePerPoint: number;
  insertPendingReward: (input: {
    driverId: string;
    sessionId: string;
    points: number;
    tokenAmount: number;
  }) => Promise<{ id: string }>;
  triggerPayout: (rewardId: string) => Promise<void>;
}

export interface SessionForReward {
  id: string;
  driver_id: string | null;
  safety_score: number | null;
  distance_km: number | null;
}

export interface RewardOrchestrationResult {
  rewardId: string;
  points: number;
  tokenAmount: number;
}

/**
 * Orchestrates the calculate-reward Edge Function's business logic: compute
 * the reward, persist it as `pending`, and chain into trigger-payout — with
 * the DB write and the payout trigger both injected so this is testable
 * without a real Supabase client or network call.
 */
export async function processRewardCalculation(
  session: SessionForReward,
  deps: RewardCalculationDeps
): Promise<RewardOrchestrationResult> {
  if (!session.driver_id) {
    throw new Error(`session ${session.id} has no driver_id; cannot calculate reward`);
  }

  const { points, tokenAmount } = calculateReward(
    session.safety_score,
    session.distance_km,
    deps.tokenRatePerPoint
  );

  const reward = await deps.insertPendingReward({
    driverId: session.driver_id,
    sessionId: session.id,
    points,
    tokenAmount,
  });

  await deps.triggerPayout(reward.id);

  return { rewardId: reward.id, points, tokenAmount };
}
