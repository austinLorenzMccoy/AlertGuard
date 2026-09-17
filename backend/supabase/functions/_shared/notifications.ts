// Pure alert-notification logic for `send-alert-notification`.
// PRD reference: Backend PRD Section 10.4; Open Questions (SMS provider TBD).
//
// PROVISIONAL CHOICE (documented per task instructions, revisit once the
// PRD's Section 14 "SMS provider choice ... pending cost comparison" open
// question resolves): default provider is **Termii**. Termii is priced and
// routed specifically for Nigerian carriers (the Lacoco pilot's market),
// supports both OTP and transactional SMS on one account, and its REST API
// (single POST, API-key auth) is simpler to integrate than Africa's Talking's
// multi-product SDK for a v1 that only needs one-way transactional alerts.
// This is provisional — cost/deliverability data from the pilot may flip it.
// Both providers are implemented behind the same SmsProvider interface so
// switching the default is a one-line config change (SMS_PROVIDER env var),
// not a code change.

export interface SmsSendResult {
  sent: boolean;
  providerMessageId?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(to: string, message: string): Promise<SmsSendResult>;
}

/** Builds the exact alert copy from the PRD's send-alert-notification sketch. */
export function buildCriticalAlertMessage(
  driverFullName: string | null | undefined,
  fleetName?: string | null
): string {
  const driverLabel = driverFullName?.trim() || "A driver";
  const fleetSuffix = fleetName ? ` (${fleetName})` : "";
  return `AlertGuard: ${driverLabel}${fleetSuffix} triggered a critical fatigue alert. Trip in progress.`;
}

export interface AlertNotificationInput {
  eventSeverity: string;
  driverFullName: string | null | undefined;
  fleetName: string | null | undefined;
  managerPhone: string | null | undefined;
}

export type AlertNotificationResult =
  | { sent: true; providerMessageId?: string; message: string }
  | { sent: false; reason: "not_critical" | "no_manager_phone" | "provider_error" };

/**
 * Sends a critical-event SMS alert to the fleet manager, mirroring the PRD's
 * send-alert-notification sketch. Only fires for `severity = 'critical'`
 * events (the Database Webhook that invokes this function is itself filtered
 * to critical events, but the logic re-validates defensively rather than
 * trusting the trigger's filter alone).
 */
export async function sendAlertNotification(
  input: AlertNotificationInput,
  deps: { smsProvider: SmsProvider }
): Promise<AlertNotificationResult> {
  if (input.eventSeverity !== "critical") {
    return { sent: false, reason: "not_critical" };
  }

  if (!input.managerPhone) {
    return { sent: false, reason: "no_manager_phone" };
  }

  const message = buildCriticalAlertMessage(input.driverFullName, input.fleetName);

  try {
    const result = await deps.smsProvider.sendSms(input.managerPhone, message);
    if (!result.sent) {
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true, providerMessageId: result.providerMessageId, message };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}

// ---------------------------------------------------------------------------
// Provider implementations (both stubbed — no real network calls here; the
// Deno index.ts wiring layer passes in `fetch` so these stay pure/testable).
// ---------------------------------------------------------------------------

export interface HttpFetcher {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

export interface TermiiConfig {
  apiKey: string;
  senderId: string;
  baseUrl?: string;
}

export function createTermiiProvider(config: TermiiConfig, fetcher: HttpFetcher): SmsProvider {
  return {
    name: "termii",
    async sendSms(to: string, message: string): Promise<SmsSendResult> {
      const baseUrl = config.baseUrl ?? "https://api.ng.termii.com";
      const response = await fetcher(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          to,
          from: config.senderId,
          sms: message,
          type: "plain",
          channel: "generic",
        }),
      });
      if (!response.ok) {
        return { sent: false };
      }
      const body = (await response.json()) as { message_id?: string };
      return { sent: true, providerMessageId: body.message_id };
    },
  };
}

export interface AfricasTalkingConfig {
  apiKey: string;
  username: string;
  senderId?: string;
  baseUrl?: string;
}

export function createAfricasTalkingProvider(
  config: AfricasTalkingConfig,
  fetcher: HttpFetcher
): SmsProvider {
  return {
    name: "africas_talking",
    async sendSms(to: string, message: string): Promise<SmsSendResult> {
      const baseUrl = config.baseUrl ?? "https://api.africastalking.com/version1";
      const response = await fetcher(`${baseUrl}/messaging`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apiKey: config.apiKey,
        },
        body: JSON.stringify({
          username: config.username,
          to,
          message,
          from: config.senderId,
        }),
      });
      if (!response.ok) {
        return { sent: false };
      }
      const body = (await response.json()) as {
        SMSMessageData?: { Recipients?: Array<{ messageId?: string }> };
      };
      const messageId = body.SMSMessageData?.Recipients?.[0]?.messageId;
      return { sent: true, providerMessageId: messageId };
    },
  };
}

export type SmsProviderName = "termii" | "africas_talking";

export const DEFAULT_SMS_PROVIDER: SmsProviderName = "termii";

export function resolveSmsProviderName(
  configuredValue: string | null | undefined
): SmsProviderName {
  return configuredValue === "africas_talking" ? "africas_talking" : DEFAULT_SMS_PROVIDER;
}
