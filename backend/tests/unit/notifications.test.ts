import { describe, it, expect, vi } from "vitest";
import {
  sendAlertNotification,
  buildCriticalAlertMessage,
  createTermiiProvider,
  createAfricasTalkingProvider,
  resolveSmsProviderName,
  DEFAULT_SMS_PROVIDER,
  type SmsProvider,
  type HttpFetcher,
} from "../../supabase/functions/_shared/notifications.ts";

describe("buildCriticalAlertMessage", () => {
  it("includes the driver name and fleet name", () => {
    expect(buildCriticalAlertMessage("Ada Obi", "Lacoco Pilot Fleet")).toBe(
      "AlertGuard: Ada Obi (Lacoco Pilot Fleet) triggered a critical fatigue alert. Trip in progress."
    );
  });

  it("omits the fleet suffix when fleet name is missing", () => {
    expect(buildCriticalAlertMessage("Ada Obi", null)).toBe(
      "AlertGuard: Ada Obi triggered a critical fatigue alert. Trip in progress."
    );
  });

  it("falls back to 'A driver' when name is missing", () => {
    expect(buildCriticalAlertMessage(null, "Lacoco Pilot Fleet")).toBe(
      "AlertGuard: A driver (Lacoco Pilot Fleet) triggered a critical fatigue alert. Trip in progress."
    );
  });

  it("falls back to 'A driver' when name is an empty/whitespace string", () => {
    expect(buildCriticalAlertMessage("   ", undefined)).toBe(
      "AlertGuard: A driver triggered a critical fatigue alert. Trip in progress."
    );
  });
});

describe("sendAlertNotification", () => {
  function makeProvider(overrides: Partial<SmsProvider> = {}): SmsProvider {
    return {
      name: "fake",
      sendSms: vi.fn().mockResolvedValue({ sent: true, providerMessageId: "msg-1" }),
      ...overrides,
    };
  }

  it("sends the alert for a critical event with a manager phone", async () => {
    const smsProvider = makeProvider();
    const result = await sendAlertNotification(
      {
        eventSeverity: "critical",
        driverFullName: "Ada Obi",
        fleetName: "Lacoco Pilot Fleet",
        managerPhone: "+2348010000000",
      },
      { smsProvider }
    );

    expect(result).toEqual({
      sent: true,
      providerMessageId: "msg-1",
      message: "AlertGuard: Ada Obi (Lacoco Pilot Fleet) triggered a critical fatigue alert. Trip in progress.",
    });
    expect(smsProvider.sendSms).toHaveBeenCalledWith(
      "+2348010000000",
      "AlertGuard: Ada Obi (Lacoco Pilot Fleet) triggered a critical fatigue alert. Trip in progress."
    );
  });

  it("does not send for a non-critical severity", async () => {
    const smsProvider = makeProvider();
    const result = await sendAlertNotification(
      {
        eventSeverity: "vibration",
        driverFullName: "Ada Obi",
        fleetName: "Lacoco Pilot Fleet",
        managerPhone: "+2348010000000",
      },
      { smsProvider }
    );

    expect(result).toEqual({ sent: false, reason: "not_critical" });
    expect(smsProvider.sendSms).not.toHaveBeenCalled();
  });

  it("does not send when there is no manager phone", async () => {
    const smsProvider = makeProvider();
    const result = await sendAlertNotification(
      {
        eventSeverity: "critical",
        driverFullName: "Ada Obi",
        fleetName: "Lacoco Pilot Fleet",
        managerPhone: null,
      },
      { smsProvider }
    );

    expect(result).toEqual({ sent: false, reason: "no_manager_phone" });
    expect(smsProvider.sendSms).not.toHaveBeenCalled();
  });

  it("reports provider_error when the provider resolves sent: false", async () => {
    const smsProvider = makeProvider({
      sendSms: vi.fn().mockResolvedValue({ sent: false }),
    });
    const result = await sendAlertNotification(
      {
        eventSeverity: "critical",
        driverFullName: "Ada Obi",
        fleetName: null,
        managerPhone: "+2348010000000",
      },
      { smsProvider }
    );

    expect(result).toEqual({ sent: false, reason: "provider_error" });
  });

  it("reports provider_error when the provider throws", async () => {
    const smsProvider = makeProvider({
      sendSms: vi.fn().mockRejectedValue(new Error("network down")),
    });
    const result = await sendAlertNotification(
      {
        eventSeverity: "critical",
        driverFullName: "Ada Obi",
        fleetName: null,
        managerPhone: "+2348010000000",
      },
      { smsProvider }
    );

    expect(result).toEqual({ sent: false, reason: "provider_error" });
  });
});

function makeFetcher(response: { ok: boolean; status: number; body: unknown }): HttpFetcher {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
}

describe("createTermiiProvider", () => {
  it("sends via the Termii API and returns the message id on success", async () => {
    const fetcher = makeFetcher({ ok: true, status: 200, body: { message_id: "termii-1" } });
    const provider = createTermiiProvider({ apiKey: "key", senderId: "AlertGuard" }, fetcher);

    const result = await provider.sendSms("+2348010000000", "hello");

    expect(result).toEqual({ sent: true, providerMessageId: "termii-1" });
    expect(provider.name).toBe("termii");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.ng.termii.com/api/sms/send",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses a custom base URL when provided", async () => {
    const fetcher = makeFetcher({ ok: true, status: 200, body: { message_id: "termii-2" } });
    const provider = createTermiiProvider(
      { apiKey: "key", senderId: "AlertGuard", baseUrl: "https://custom.termii.test" },
      fetcher
    );
    await provider.sendSms("+2348010000000", "hello");
    expect(fetcher).toHaveBeenCalledWith(
      "https://custom.termii.test/api/sms/send",
      expect.anything()
    );
  });

  it("returns sent: false when the HTTP response is not ok", async () => {
    const fetcher = makeFetcher({ ok: false, status: 500, body: {} });
    const provider = createTermiiProvider({ apiKey: "key", senderId: "AlertGuard" }, fetcher);
    const result = await provider.sendSms("+2348010000000", "hello");
    expect(result).toEqual({ sent: false });
  });
});

describe("createAfricasTalkingProvider", () => {
  it("sends via the Africa's Talking API and returns the message id on success", async () => {
    const fetcher = makeFetcher({
      ok: true,
      status: 200,
      body: { SMSMessageData: { Recipients: [{ messageId: "at-1" }] } },
    });
    const provider = createAfricasTalkingProvider(
      { apiKey: "key", username: "alertguard" },
      fetcher
    );

    const result = await provider.sendSms("+2348010000000", "hello");

    expect(result).toEqual({ sent: true, providerMessageId: "at-1" });
    expect(provider.name).toBe("africas_talking");
  });

  it("uses a custom base URL when provided", async () => {
    const fetcher = makeFetcher({
      ok: true,
      status: 200,
      body: { SMSMessageData: { Recipients: [{ messageId: "at-2" }] } },
    });
    const provider = createAfricasTalkingProvider(
      { apiKey: "key", username: "alertguard", baseUrl: "https://custom.at.test" },
      fetcher
    );
    await provider.sendSms("+2348010000000", "hello");
    expect(fetcher).toHaveBeenCalledWith("https://custom.at.test/messaging", expect.anything());
  });

  it("returns sent: false when the HTTP response is not ok", async () => {
    const fetcher = makeFetcher({ ok: false, status: 500, body: {} });
    const provider = createAfricasTalkingProvider({ apiKey: "key", username: "alertguard" }, fetcher);
    const result = await provider.sendSms("+2348010000000", "hello");
    expect(result).toEqual({ sent: false });
  });

  it("returns an undefined messageId when the response body has no recipients", async () => {
    const fetcher = makeFetcher({ ok: true, status: 200, body: { SMSMessageData: {} } });
    const provider = createAfricasTalkingProvider({ apiKey: "key", username: "alertguard" }, fetcher);
    const result = await provider.sendSms("+2348010000000", "hello");
    expect(result).toEqual({ sent: true, providerMessageId: undefined });
  });
});

describe("resolveSmsProviderName", () => {
  it("defaults to termii when unset", () => {
    expect(resolveSmsProviderName(undefined)).toBe(DEFAULT_SMS_PROVIDER);
    expect(resolveSmsProviderName(null)).toBe("termii");
  });

  it("returns africas_talking when explicitly configured", () => {
    expect(resolveSmsProviderName("africas_talking")).toBe("africas_talking");
  });

  it("falls back to termii for an unrecognized value", () => {
    expect(resolveSmsProviderName("some_other_provider")).toBe("termii");
  });
});
