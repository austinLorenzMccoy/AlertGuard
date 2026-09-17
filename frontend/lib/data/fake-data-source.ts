import type { AlertGuardDataSource, EventFilter, ProfileFilter, SessionFilter } from "@/lib/data/data-source";
import type {
  Device,
  DrivingSession,
  DrowsinessEvent,
  Fleet,
  FleetReport,
  Profile,
  Redemption,
  Reward,
} from "@/lib/types";

export interface FakeSeed {
  profiles: Profile[];
  fleets: Fleet[];
  devices: Device[];
  sessions: DrivingSession[];
  events: DrowsinessEvent[];
  rewards: Reward[];
  redemptions: Redemption[];
  reports: FleetReport[];
}

/**
 * In-memory implementation of AlertGuardDataSource.
 *
 * Used for (a) unit tests, where the seed is crafted per-test, and (b) local
 * `npm run dev` when NEXT_PUBLIC_SUPABASE_URL is not set, via
 * `lib/data/demo-seed.ts`, so the dashboard is browsable without a real
 * Supabase project.
 */
export function createFakeDataSource(seed: FakeSeed): AlertGuardDataSource {
  return {
    async getProfiles(filter?: ProfileFilter) {
      return seed.profiles.filter((p) => {
        if (filter?.fleet_id && p.fleet_id !== filter.fleet_id) return false;
        if (filter?.role && p.role !== filter.role) return false;
        if (filter?.id && p.id !== filter.id) return false;
        return true;
      });
    },

    async getFleets(filter?: { id?: string }) {
      return seed.fleets.filter((f) => !filter?.id || f.id === filter.id);
    },

    async getDevices(filter?: { driver_id?: string }) {
      return seed.devices.filter(
        (d) => !filter?.driver_id || d.driver_id === filter.driver_id,
      );
    },

    async getDrivingSessions(filter?: SessionFilter) {
      return seed.sessions.filter((s) => {
        if (filter?.fleet_id && s.fleet_id !== filter.fleet_id) return false;
        if (filter?.driver_id && s.driver_id !== filter.driver_id) return false;
        if (filter?.status && s.status !== filter.status) return false;
        return true;
      });
    },

    async getDrowsinessEvents(filter?: EventFilter) {
      return seed.events.filter((e) => {
        if (filter?.session_id && e.session_id !== filter.session_id) return false;
        if (filter?.session_ids && !filter.session_ids.includes(e.session_id)) return false;
        if (filter?.severity && e.severity !== filter.severity) return false;
        return true;
      });
    },

    async getRewards(filter?: { driver_id?: string; fleet_id?: string }) {
      return seed.rewards.filter(
        (r) => !filter?.driver_id || r.driver_id === filter.driver_id,
      );
    },

    async getRedemptions(filter?: { driver_id?: string; status?: string }) {
      return seed.redemptions.filter((r) => {
        if (filter?.driver_id && r.driver_id !== filter.driver_id) return false;
        if (filter?.status && r.status !== filter.status) return false;
        return true;
      });
    },

    async getFleetReports(filter?: { fleet_id?: string }) {
      return seed.reports.filter(
        (r) => !filter?.fleet_id || r.fleet_id === filter.fleet_id,
      );
    },
  };
}
