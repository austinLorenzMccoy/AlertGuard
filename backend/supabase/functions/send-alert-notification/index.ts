// Deno wiring for `send-alert-notification`. PRD reference: Backend PRD Section 10.4.
// Thin wiring only — business logic lives in ../_shared/notifications.ts.
// Excluded from the coverage target; see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendAlertNotification,
  createTermiiProvider,
  createAfricasTalkingProvider,
  resolveSmsProviderName,
  type SmsProvider,
} from "../_shared/notifications.ts";
import { isInternalCall } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

function buildSmsProvider(): SmsProvider {
  const providerName = resolveSmsProviderName(Deno.env.get("SMS_PROVIDER"));
  if (providerName === "africas_talking") {
    return createAfricasTalkingProvider(
      {
        apiKey: Deno.env.get("AFRICAS_TALKING_API_KEY") ?? "",
        username: Deno.env.get("AFRICAS_TALKING_USERNAME") ?? "",
        senderId: Deno.env.get("AFRICAS_TALKING_SENDER_ID") ?? undefined,
      },
      fetch
    );
  }
  return createTermiiProvider(
    {
      apiKey: Deno.env.get("TERMII_API_KEY") ?? "",
      senderId: Deno.env.get("TERMII_SENDER_ID") ?? "AlertGuard",
    },
    fetch
  );
}

serve(async (req: Request) => {
  // Invoked via a Database Webhook on drowsiness_events insert (severity =
  // critical), configured with the service role + internal secret headers.
  if (!isInternalCall(req.headers, INTERNAL_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { session_id, event } = await req.json();

  const { data: session, error } = await supabase
    .from("driving_sessions")
    .select("driver_id, fleet_id, profiles(full_name), fleets(name)")
    .eq("id", session_id)
    .single();

  if (error || !session) {
    return new Response(JSON.stringify({ error: "session_not_found" }), { status: 404 });
  }

  const { data: manager } = await supabase
    .from("profiles")
    .select("phone")
    .eq("fleet_id", session.fleet_id)
    .eq("role", "fleet_manager")
    .single();

  const result = await sendAlertNotification(
    {
      eventSeverity: event?.severity,
      driverFullName: session.profiles?.full_name ?? null,
      fleetName: session.fleets?.name ?? null,
      managerPhone: manager?.phone ?? null,
    },
    { smsProvider: buildSmsProvider() }
  );

  return new Response(JSON.stringify(result), { status: 200 });
});
