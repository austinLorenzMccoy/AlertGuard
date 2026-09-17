import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRealtimeSubscription, type RealtimeClientLike, type RealtimePayload } from "@/lib/hooks/useRealtimeChannel";

function makeFakeClient() {
  let capturedCallback: ((payload: RealtimePayload<Record<string, unknown>>) => void) | null = null;
  const unsubscribe = vi.fn();
  const on = vi.fn((_type, _filter, callback) => {
    capturedCallback = callback;
    return channel;
  });
  const subscribe = vi.fn(() => channel);
  const channel = { on, subscribe };
  const removeChannel = vi.fn();
  const channelFn = vi.fn(() => channel);

  const client: RealtimeClientLike = {
    channel: channelFn,
    removeChannel,
  };

  return {
    client,
    channelFn,
    on,
    subscribe,
    removeChannel,
    unsubscribe,
    emit: (payload: RealtimePayload<Record<string, unknown>>) => capturedCallback?.(payload),
  };
}

describe("useRealtimeSubscription", () => {
  it("does nothing when client is null", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() =>
      useRealtimeSubscription(null, { channelName: "c", table: "t" }, onChange),
    );
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  it("subscribes to the given channel/table/filter and forwards payload.new", () => {
    const fake = makeFakeClient();
    const onChange = vi.fn();
    renderHook(() =>
      useRealtimeSubscription(
        fake.client,
        { channelName: "fleet-safety-monitor", table: "drowsiness_events", filter: "severity=eq.critical" },
        onChange,
      ),
    );

    expect(fake.channelFn).toHaveBeenCalledWith("fleet-safety-monitor");
    expect(fake.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "drowsiness_events", filter: "severity=eq.critical" },
      expect.any(Function),
    );
    expect(fake.subscribe).toHaveBeenCalled();

    fake.emit({ new: { id: "e1" } });
    expect(onChange).toHaveBeenCalledWith({ id: "e1" });
  });

  it("defaults event to INSERT and schema to public when omitted", () => {
    const fake = makeFakeClient();
    renderHook(() => useRealtimeSubscription(fake.client, { channelName: "c", table: "t" }, vi.fn()));
    expect(fake.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "t", filter: undefined },
      expect.any(Function),
    );
  });

  it("respects a custom event type", () => {
    const fake = makeFakeClient();
    renderHook(() =>
      useRealtimeSubscription(fake.client, { channelName: "c", table: "t", event: "*" }, vi.fn()),
    );
    expect(fake.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "*" }),
      expect.any(Function),
    );
  });

  it("removes the channel on unmount", () => {
    const fake = makeFakeClient();
    const { unmount } = renderHook(() =>
      useRealtimeSubscription(fake.client, { channelName: "c", table: "t" }, vi.fn()),
    );
    unmount();
    expect(fake.removeChannel).toHaveBeenCalled();
  });
});
