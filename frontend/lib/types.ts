/**
 * Types mirroring the AlertGuard Supabase schema.
 * Source of truth: docs/AlertGuard-Backend-PRD.md Section 4 (Data Model).
 *
 * These are the web dashboard's view of the schema — only the fields the
 * fleet dashboard actually reads/writes are modeled here.
 */

export type Role = "driver" | "fleet_manager" | "admin";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  fleet_id: string | null;
  wallet_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Fleet {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  driver_id: string;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  device_attestation_key: string | null;
  last_active: string;
}

export type SessionStatus = "active" | "completed" | "flagged" | "verified";

export interface DrivingSession {
  id: string;
  driver_id: string;
  device_id: string | null;
  fleet_id: string;
  start_time: string;
  end_time: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_km: number | null;
  gps_trace_hash: string | null;
  status: SessionStatus;
  safety_score: number | null;
  created_at: string;
}

export type DrowsinessEventType =
  | "eye_closure"
  | "yawn"
  | "head_nod"
  | "blink_rate_drift";

export type DrowsinessSeverity = "soft" | "vibration" | "critical";

export interface DrowsinessEvent {
  id: string;
  session_id: string;
  event_type: DrowsinessEventType;
  severity: DrowsinessSeverity;
  device_confidence: number | null;
  occurred_at: string;
  lat: number | null;
  lng: number | null;
}

export type VerificationStatus = "pending" | "passed" | "failed";

export interface SessionVerification {
  id: string;
  session_id: string;
  gps_continuity_ok: boolean | null;
  device_attestation_ok: boolean | null;
  timestamp_consistency_ok: boolean | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
}

export type RewardStatus = "pending" | "settled" | "failed";

export interface Reward {
  id: string;
  driver_id: string;
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

export interface Redemption {
  id: string;
  driver_id: string;
  redemption_type: RedemptionType;
  amount: number | null;
  status: RedemptionStatus;
  created_at: string;
}

export interface FleetReport {
  id: string;
  fleet_id: string;
  period_start: string; // date
  period_end: string; // date
  avg_safety_score: number | null;
  total_sessions: number | null;
  total_critical_alerts: number | null;
  generated_at: string;
}

/** Derived, dashboard-only shapes — not raw tables. */

export type ScoreBand = "good" | "warning" | "critical";

export interface DriverGridCard {
  driver: Profile;
  activeSession: DrivingSession | null;
  currentScore: number | null;
  isLive: boolean;
}

export interface DriverListRow {
  driver: Profile;
  currentScore: number | null;
  scoreBand: ScoreBand | null;
  sevenDayTrend: (number | null)[];
  totalVerifiedTrips: number;
  lastActive: string | null;
  alertCount: number;
  isActive: boolean;
}

export interface DriverDetailData {
  driver: Profile;
  sessions: DrivingSession[];
  events: DrowsinessEvent[];
  rewards: Reward[];
}

export interface FleetOverviewData {
  fleet: Fleet | null;
  activeDriversNow: number;
  todayAvgScore: number | null;
  todayCriticalAlertCount: number;
  driverCards: DriverGridCard[];
}
