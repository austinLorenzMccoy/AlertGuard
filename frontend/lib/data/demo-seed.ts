import type { FakeSeed } from "@/lib/data/fake-data-source";

/**
 * Static demo fixture data powering `npm run dev` when no real Supabase
 * project is configured (see README "Demo mode"). Pure data, no logic —
 * excluded from coverage thresholds.
 */
export const FLEET_ID = "fleet-lacoco";

const now = () => new Date();
const daysAgo = (n: number, hours = 8) => {
  const d = new Date(now());
  d.setDate(d.getDate() - n);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString();
};

export const demoSeed: FakeSeed = {
  fleets: [
    { id: FLEET_ID, name: "Lacoco Fleet", owner_id: "mgr-1", created_at: daysAgo(120) },
  ],
  profiles: [
    { id: "mgr-1", full_name: "Ada Obi", phone: "+2348010000001", role: "fleet_manager", fleet_id: FLEET_ID, wallet_address: null, created_at: daysAgo(120), updated_at: daysAgo(1) },
    { id: "drv-1", full_name: "Chinedu Okafor", phone: "+2348020000001", role: "driver", fleet_id: FLEET_ID, wallet_address: "SP2J6ZY48...", created_at: daysAgo(90), updated_at: daysAgo(1) },
    { id: "drv-2", full_name: "Ngozi Umeh", phone: "+2348020000002", role: "driver", fleet_id: FLEET_ID, wallet_address: null, created_at: daysAgo(80), updated_at: daysAgo(1) },
    { id: "drv-3", full_name: "Tunde Bakare", phone: "+2348020000003", role: "driver", fleet_id: FLEET_ID, wallet_address: "SP3K9...", created_at: daysAgo(70), updated_at: daysAgo(1) },
    { id: "drv-4", full_name: "Fatima Sule", phone: "+2348020000004", role: "driver", fleet_id: FLEET_ID, wallet_address: null, created_at: daysAgo(60), updated_at: daysAgo(1) },
  ],
  devices: [
    { id: "dev-1", driver_id: "drv-1", device_model: "Tecno Spark 10", os_version: "13", app_version: "1.0.0", device_attestation_key: "key-1", last_active: daysAgo(0) },
  ],
  sessions: [
    { id: "sess-1", driver_id: "drv-1", device_id: "dev-1", fleet_id: FLEET_ID, start_time: daysAgo(0, 7), end_time: null, start_lat: 6.5244, start_lng: 3.3792, end_lat: null, end_lng: null, distance_km: 12.4, gps_trace_hash: "hash-1", status: "active", safety_score: 91, created_at: daysAgo(0, 7) },
    { id: "sess-2", driver_id: "drv-2", device_id: null, fleet_id: FLEET_ID, start_time: daysAgo(0, 6), end_time: null, start_lat: 6.45, start_lng: 3.39, end_lat: null, end_lng: null, distance_km: 5.1, gps_trace_hash: "hash-2", status: "active", safety_score: 58, created_at: daysAgo(0, 6) },
    { id: "sess-3", driver_id: "drv-3", device_id: null, fleet_id: FLEET_ID, start_time: daysAgo(1, 8), end_time: daysAgo(1, 9), start_lat: 6.5, start_lng: 3.35, end_lat: 6.6, end_lng: 3.4, distance_km: 22.8, gps_trace_hash: "hash-3", status: "verified", safety_score: 78, created_at: daysAgo(1, 8) },
    { id: "sess-4", driver_id: "drv-1", device_id: "dev-1", fleet_id: FLEET_ID, start_time: daysAgo(2, 8), end_time: daysAgo(2, 9), start_lat: 6.5, start_lng: 3.35, end_lat: 6.6, end_lng: 3.4, distance_km: 18.2, gps_trace_hash: "hash-4", status: "verified", safety_score: 88, created_at: daysAgo(2, 8) },
    { id: "sess-5", driver_id: "drv-4", device_id: null, fleet_id: FLEET_ID, start_time: daysAgo(3, 8), end_time: daysAgo(3, 9), start_lat: 6.5, start_lng: 3.35, end_lat: 6.6, end_lng: 3.4, distance_km: 9.6, gps_trace_hash: "hash-5", status: "verified", safety_score: 45, created_at: daysAgo(3, 8) },
  ],
  events: [
    { id: "evt-1", session_id: "sess-2", event_type: "eye_closure", severity: "critical", device_confidence: 0.92, occurred_at: daysAgo(0, 6), lat: 6.45, lng: 3.39 },
    { id: "evt-2", session_id: "sess-5", event_type: "head_nod", severity: "critical", device_confidence: 0.88, occurred_at: daysAgo(3, 8), lat: 6.5, lng: 3.35 },
    { id: "evt-3", session_id: "sess-3", event_type: "yawn", severity: "soft", device_confidence: 0.6, occurred_at: daysAgo(1, 8), lat: 6.5, lng: 3.35 },
  ],
  rewards: [
    { id: "rwd-1", driver_id: "drv-1", session_id: "sess-4", points_earned: 160, token_amount: 1.6, status: "settled", stacks_tx_hash: "0xabc", created_at: daysAgo(2) },
    { id: "rwd-2", driver_id: "drv-3", session_id: "sess-3", points_earned: 178, token_amount: 1.78, status: "pending", stacks_tx_hash: null, created_at: daysAgo(1) },
  ],
  redemptions: [
    { id: "rdm-1", driver_id: "drv-1", redemption_type: "airtime", amount: 500, status: "completed", created_at: daysAgo(5) },
    { id: "rdm-2", driver_id: "drv-3", redemption_type: "fuel_voucher", amount: 2000, status: "pending", created_at: daysAgo(0) },
    { id: "rdm-3", driver_id: "drv-4", redemption_type: "token_withdrawal", amount: 10, status: "processing", created_at: daysAgo(1) },
  ],
  reports: [
    { id: "rep-1", fleet_id: FLEET_ID, period_start: daysAgo(7).slice(0, 10), period_end: daysAgo(0).slice(0, 10), avg_safety_score: 76.4, total_sessions: 34, total_critical_alerts: 3, generated_at: daysAgo(0) },
    { id: "rep-2", fleet_id: FLEET_ID, period_start: daysAgo(14).slice(0, 10), period_end: daysAgo(7).slice(0, 10), avg_safety_score: 81.1, total_sessions: 29, total_critical_alerts: 1, generated_at: daysAgo(7) },
  ],
};
