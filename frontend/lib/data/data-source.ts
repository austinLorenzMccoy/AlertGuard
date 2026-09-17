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

/**
 * A thin, swappable interface over the tables the web dashboard reads.
 *
 * `lib/supabase-client.ts` implements this against a real `@supabase/supabase-js`
 * client. `lib/data/fake-data-source.ts` implements it in-memory for unit
 * tests and for local/demo use when no Supabase project is configured. Every
 * function in `lib/data/*.ts` (getFleetOverview, getDrivers, ...) is written
 * against this interface, never against the raw Supabase client, so it can
 * be unit-tested without a network call.
 */
export interface AlertGuardDataSource {
  getProfiles(filter?: ProfileFilter): Promise<Profile[]>;
  getFleets(filter?: { id?: string }): Promise<Fleet[]>;
  getDevices(filter?: { driver_id?: string }): Promise<Device[]>;
  getDrivingSessions(filter?: SessionFilter): Promise<DrivingSession[]>;
  getDrowsinessEvents(filter?: EventFilter): Promise<DrowsinessEvent[]>;
  getRewards(filter?: { driver_id?: string; fleet_id?: string }): Promise<Reward[]>;
  getRedemptions(filter?: { driver_id?: string; status?: string }): Promise<Redemption[]>;
  getFleetReports(filter?: { fleet_id?: string }): Promise<FleetReport[]>;
}

export interface ProfileFilter {
  fleet_id?: string;
  role?: Profile["role"];
  id?: string;
}

export interface SessionFilter {
  fleet_id?: string;
  driver_id?: string;
  status?: DrivingSession["status"];
}

export interface EventFilter {
  session_id?: string;
  session_ids?: string[];
  severity?: DrowsinessEvent["severity"];
}
