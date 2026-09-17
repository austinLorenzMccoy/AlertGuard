// Deno wiring for the weekly fleet-reports aggregation cron job.
// PRD reference: Backend PRD Section 10 Step 10 / Section 12 Step 10.
// Thin wiring only — business logic lives in ../_shared/fleetReports.ts.
// Excluded from the coverage target; see backend/README.md.
//
// Scheduling: registered as a real pg_cron job in
// supabase/migrations/20260101000005_pg_cron_jobs.sql, running weekly
// (Sundays at 00:00 UTC) and calling this function over HTTP via pg_net.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateFleetReports } from "../_shared/fleetReports.ts";
import { isInternalCall } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

serve(async (req: Request) => {
  if (!isInternalCall(req.headers, INTERNAL_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const rows = await generateFleetReports(
    {
      listFleetIds: async () => {
        const { data, error } = await supabase.from("fleets").select("id");
        if (error) throw error;
        return (data ?? []).map((f: { id: string }) => f.id);
      },
      getSessionsForFleetInPeriod: async (fleetId, period) => {
        const { data, error } = await supabase
          .from("driving_sessions")
          .select("safety_score")
          .eq("fleet_id", fleetId)
          .gte("created_at", period.periodStart)
          .lte("created_at", period.periodEnd);
        if (error) throw error;
        return data ?? [];
      },
      getCriticalAlertCountForFleetInPeriod: async (fleetId, period) => {
        const { count, error } = await supabase
          .from("drowsiness_events")
          .select("id, driving_sessions!inner(fleet_id)", { count: "exact", head: true })
          .eq("severity", "critical")
          .eq("driving_sessions.fleet_id", fleetId)
          .gte("occurred_at", period.periodStart)
          .lte("occurred_at", period.periodEnd);
        if (error) throw error;
        return count ?? 0;
      },
      insertFleetReport: async (row) => {
        await supabase.from("fleet_reports").insert({
          fleet_id: row.fleetId,
          period_start: row.periodStart,
          period_end: row.periodEnd,
          avg_safety_score: row.avgSafetyScore,
          total_sessions: row.totalSessions,
          total_critical_alerts: row.totalCriticalAlerts,
        });
      },
    },
    new Date()
  );

  return new Response(JSON.stringify({ reports: rows }), { status: 200 });
});
