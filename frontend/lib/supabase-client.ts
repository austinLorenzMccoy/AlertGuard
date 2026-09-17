import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AlertGuardDataSource,
  EventFilter,
  ProfileFilter,
  SessionFilter,
} from "@/lib/data/data-source";

/**
 * Creates the raw Supabase JS client. Reads the two public env vars
 * documented in the README. Never called at module load time so that
 * importing this file in a test (or during a build with no env vars set)
 * doesn't throw.
 */
export function createRawSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "See README.md for required env vars.",
    );
  }

  return createClient(url, anonKey);
}

/**
 * Wraps a real Supabase client as an `AlertGuardDataSource`, so the rest of
 * the app (lib/data/*.ts) never depends on supabase-js directly and can be
 * unit-tested against `lib/data/fake-data-source.ts` instead.
 */
export function createSupabaseDataSource(
  client: SupabaseClient,
): AlertGuardDataSource {
  return {
    async getProfiles(filter?: ProfileFilter) {
      let query = client.from("profiles").select("*");
      if (filter?.fleet_id) query = query.eq("fleet_id", filter.fleet_id);
      if (filter?.role) query = query.eq("role", filter.role);
      if (filter?.id) query = query.eq("id", filter.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getFleets(filter?: { id?: string }) {
      let query = client.from("fleets").select("*");
      if (filter?.id) query = query.eq("id", filter.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getDevices(filter?: { driver_id?: string }) {
      let query = client.from("devices").select("*");
      if (filter?.driver_id) query = query.eq("driver_id", filter.driver_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getDrivingSessions(filter?: SessionFilter) {
      let query = client.from("driving_sessions").select("*");
      if (filter?.fleet_id) query = query.eq("fleet_id", filter.fleet_id);
      if (filter?.driver_id) query = query.eq("driver_id", filter.driver_id);
      if (filter?.status) query = query.eq("status", filter.status);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getDrowsinessEvents(filter?: EventFilter) {
      let query = client.from("drowsiness_events").select("*");
      if (filter?.session_id) query = query.eq("session_id", filter.session_id);
      if (filter?.session_ids) query = query.in("session_id", filter.session_ids);
      if (filter?.severity) query = query.eq("severity", filter.severity);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getRewards(filter?: { driver_id?: string; fleet_id?: string }) {
      let query = client.from("rewards").select("*");
      if (filter?.driver_id) query = query.eq("driver_id", filter.driver_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getRedemptions(filter?: { driver_id?: string; status?: string }) {
      let query = client.from("redemptions").select("*");
      if (filter?.driver_id) query = query.eq("driver_id", filter.driver_id);
      if (filter?.status) query = query.eq("status", filter.status);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async getFleetReports(filter?: { fleet_id?: string }) {
      let query = client.from("fleet_reports").select("*");
      if (filter?.fleet_id) query = query.eq("fleet_id", filter.fleet_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  };
}

/**
 * Convenience factory: real Supabase client + env vars -> AlertGuardDataSource.
 * The single place `app/**` code should call to get a live data source.
 */
export function createLiveDataSource(): AlertGuardDataSource {
  return createSupabaseDataSource(createRawSupabaseClient());
}
