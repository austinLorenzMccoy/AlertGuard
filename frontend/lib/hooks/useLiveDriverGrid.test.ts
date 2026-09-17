import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLiveDriverGrid } from "@/lib/hooks/useLiveDriverGrid";
import type { RealtimeClientLike, RealtimePayload } from "@/lib/hooks/useRealtimeChannel";
import type { DriverGridCard, DrivingSession, Profile } from "@/lib/types";

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

const driver: Profile = {
  id: "d1",
  full_name: "Driver One",
  phone: null,
  role: "driver",
  fleet_id: "f1",
  wallet_address: null,
  created_at: "",
  updated_at: "",
};

const initialCard: DriverGridCard = {
  driver,
  activeSession: null,
  currentScore: 70,
  isLive: false,
};

describe("useLiveDriverGrid", () => {
  it("returns the initial cards unchanged with no client", () => {
    const { result } = renderHook(() => useLiveDriverGrid(null, [initialCard]));
    expect(result.current).toEqual([initialCard]);
  });

  it("patches the matching driver card to live on an active session update", () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() => useLiveDriverGrid(fake.client, [initialCard]));

    const session: Partial<DrivingSession> = {
      id: "s1",
      driver_id: "d1",
      status: "active",
      safety_score: 91,
    };
    act(() => {
      fake.emit({ new: session as unknown as Record<string, unknown> });
    });

    expect(result.current[0].isLive).toBe(true);
    expect(result.current[0].currentScore).toBe(91);
    expect(result.current[0].activeSession).toMatchObject({ id: "s1" });
  });

  it("clears activeSession and marks offline when the session completes", () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() =>
      useLiveDriverGrid(fake.client, [{ ...initialCard, isLive: true, activeSession: { id: "s1" } as DrivingSession }]),
    );

    act(() => {
      fake.emit({
        new: { id: "s1", driver_id: "d1", status: "completed", safety_score: 88 } as unknown as Record<string, unknown>,
      });
    });

    expect(result.current[0].isLive).toBe(false);
    expect(result.current[0].activeSession).toBeNull();
    expect(result.current[0].currentScore).toBe(88);
  });

  it("keeps the previous score when the incoming session has a null score", () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() => useLiveDriverGrid(fake.client, [initialCard]));

    act(() => {
      fake.emit({
        new: { id: "s1", driver_id: "d1", status: "active", safety_score: null } as unknown as Record<string, unknown>,
      });
    });

    expect(result.current[0].currentScore).toBe(70);
  });

  it("ignores updates for drivers not in the grid", () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() => useLiveDriverGrid(fake.client, [initialCard]));

    act(() => {
      fake.emit({
        new: { id: "s2", driver_id: "someone-else", status: "active", safety_score: 10 } as unknown as Record<string, unknown>,
      });
    });

    expect(result.current).toEqual([initialCard]);
  });
});
