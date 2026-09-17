"use client";

import { useEffect } from "react";

export type PostgresChangesEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface PostgresChangesFilter {
  event: PostgresChangesEvent;
  schema: string;
  table: string;
  filter?: string;
}

export interface RealtimePayload<T> {
  new: T;
  old?: Partial<T>;
}

export interface RealtimeChannelLike {
  on(
    type: "postgres_changes",
    filter: PostgresChangesFilter,
    callback: (payload: RealtimePayload<Record<string, unknown>>) => void,
  ): RealtimeChannelLike;
  subscribe(): RealtimeChannelLike;
}

export interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): void;
}

export interface RealtimeSubscriptionConfig {
  channelName: string;
  table: string;
  event?: PostgresChangesEvent;
  schema?: string;
  filter?: string;
}

/**
 * Generic wrapper around the Supabase Realtime `postgres_changes` pattern
 * shown in Backend PRD Section 7: subscribes on mount, tears down on
 * unmount/dependency change, and hands each payload's `new` row to `onChange`.
 *
 * `client` is typed as the minimal `RealtimeClientLike` interface (not the
 * full supabase-js client) specifically so tests can pass a small fake
 * channel/client and assert `onChange` fires on a simulated INSERT, without
 * a real WebSocket connection.
 */
export function useRealtimeSubscription<T>(
  client: RealtimeClientLike | null,
  config: RealtimeSubscriptionConfig,
  onChange: (row: T) => void,
): void {
  useEffect(() => {
    if (!client) return undefined;

    const channel = client
      .channel(config.channelName)
      .on(
        "postgres_changes",
        {
          event: config.event ?? "INSERT",
          schema: config.schema ?? "public",
          table: config.table,
          filter: config.filter,
        },
        (payload) => onChange(payload.new as T),
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, config.channelName, config.table, config.event, config.schema, config.filter]);
}
