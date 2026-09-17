// Shared types for AlertGuard Edge Function logic modules.
// Kept dependency-free (no Deno / Supabase SDK types) so every _shared module
// can be unit-tested under plain Node + Vitest.

export type SessionStatus = "active" | "completed" | "flagged" | "verified";

export interface DrivingSessionRow {
  id: string;
  driver_id: string | null;
  device_id: string | null;
  fleet_id: string | null;
  start_time: string | null;
  end_time: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_km: number | null;
  gps_trace_hash: string | null;
  status: SessionStatus;
  safety_score: number | null;
  created_at?: string;
}

export interface DeviceRow {
  id: string;
  driver_id: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  device_attestation_key: string | null;
  last_active?: string;
}

export type RewardStatus = "pending" | "settled" | "failed";

export interface RewardRow {
  id: string;
  driver_id: string | null;
  session_id: string | null;
  points_earned: number | null;
  token_amount: number | null;
  status: RewardStatus;
  stacks_tx_hash: string | null;
  created_at: string;
}

export type RedemptionType =
  | "airtime"
  | "fuel_voucher"
  | "insurance_discount"
  | "token_withdrawal";

export type RedemptionStatus = "pending" | "processing" | "completed" | "failed";

export interface RedemptionRow {
  id: string;
  driver_id: string;
  redemption_type: RedemptionType;
  amount: number;
  status: RedemptionStatus;
  created_at?: string;
}

export type EventSeverity = "soft" | "vibration" | "critical";
