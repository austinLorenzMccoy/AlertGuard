import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLiveAlerts } from "@/lib/hooks/useLiveAlerts";
import type { RealtimeClientLike, RealtimePayload } from "@/lib/hooks/useRealtimeChannel";
import type { DrowsinessEvent } from "@/lib/types";

function makeFakeClient() {
  let capturedCallback: ((payload: RealtimePayload<Record<string, unknown>>) => void) | null = null;
  const channel = {
    on: vi.fn((_type, _filter, callback) => {
      capturedCallback = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const client: RealtimeClientLike = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return { client, emit: (payload: RealtimePayload<Record<string, unknown>>) => capturedCallback?.(payload) };
}

const initialEvent: DrowsinessEvent = {
  id: "e1",
  session_id: "s1",
  event_type: "eye_closure",
  severity: "critical",
  device_confidence: 0.9,
  occurred_at: "2026-09-17T08:00:00.000Z",
  lat: null,
  lng: null,
};

describe("useLiveAlerts", () => {
  it("returns the initial alerts unchanged when nothing streams in", () => {
    const { result } = renderHook(() => useLiveAlerts(null, [initialEvent]));
    expect(result.current).toEqual([initialEvent]);
  });

  it("prepends a new critical event on INSERT, mirroring updateDashboard", () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() => useLiveAlerts(fake.client, [initialEvent]));

    const newEvent: DrowsinessEvent = { ...initialEvent, id: "e2", occurred_at: "2026-09-17T09:00:00.000Z" };
    act(() => {
      fake.emit({ new: newEvent as unknown as Record<string, unknown> });
    });

    expect(result.current[0].id).toBe("e2");
    expect(result.current).toHaveLength(2);
  });
});
