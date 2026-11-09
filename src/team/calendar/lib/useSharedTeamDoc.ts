import * as React from "react";

import { relayClient } from "../compat/relay";
import { signRelayEvent } from "../compat/relay";
import type { RelayEvent } from "../compat/relay";
import { KIND_CHANNEL_SECTIONS } from "../compat/relay";
import { MAX_TEAM_CALENDAR_AUTHORS } from "./teamCalendar";

/** kind 30078 (application data), the same kind the team calendar uses. */
const KIND_TEAM_DOC = KIND_CHANNEL_SECTIONS;

export type SharedDocStatus = "loading" | "ready" | "error";

/** How one kind of shared team document is read, merged and written. */
export type SharedDocCodec<T> = {
  empty: T;
  /** Every member's events merged, plus this member's own copy. */
  mergeEvents: (
    events: RelayEvent[],
    dTag: string,
    pubkey: string,
  ) => { merged: T; own: T; ownCreatedAt: number };
  /** One event's copy. */
  decode: (content: string) => T;
  /** `base` merged with `other`; `base` itself when nothing changed. */
  merge: (base: T, other: T) => T;
  /** True when `local` holds something `remote` (own copy) lacks. */
  hasNewer: (local: T, remote: T) => boolean;
  /** Content to publish, or `null` when it is too big. */
  encode: (value: T) => string | null;
  tooBigMessage: string;
  slowMessage: string;
  failedMessage: string;
  /** The `t` tag put on the events. */
  topic: string;
};

/**
 * One shared document of the community (one `d` tag), the way the team
 * calendar months are shared: every member's copy is read and merged, kept
 * live, and this member's edits are published as their own copy.
 */
export function useSharedTeamDoc<T>(
  pubkey: string,
  relayUrl: string,
  dTag: string,
  codec: SharedDocCodec<T>,
) {
  const scope = `${pubkey}|${relayUrl}|${dTag}`;
  const [state, setState] = React.useState<{
    scope: string;
    value: T;
    status: SharedDocStatus;
  }>({ scope, value: codec.empty, status: "loading" });
  const current =
    state.scope === scope
      ? state
      : { scope, value: codec.empty, status: "loading" as const };

  const liveRef = React.useRef<{
    scope: string;
    cancelled: boolean;
    value: T;
    own: T;
    ownCreatedAt: number;
    queue: Promise<void>;
    load?: () => void;
  } | null>(null);
  const codecRef = React.useRef(codec);
  codecRef.current = codec;

  React.useEffect(() => {
    const codecNow = codecRef.current;
    const live = {
      scope,
      cancelled: false,
      value: codecNow.empty,
      own: codecNow.empty,
      ownCreatedAt: 0,
      queue: Promise.resolve(),
    };
    liveRef.current = live;
    setState({ scope, value: codecNow.empty, status: "loading" });
    const filter = { kinds: [KIND_TEAM_DOC], "#d": [dTag] };

    const apply = (next: T, status?: SharedDocStatus) => {
      live.value = next;
      setState((previous) => ({
        scope,
        value: next,
        status:
          status ?? (previous.scope === scope ? previous.status : "ready"),
      }));
    };

    const load = () =>
      void relayClient
        .fetchEvents({ ...filter, limit: MAX_TEAM_CALENDAR_AUTHORS })
        .then(
          (events) => {
            if (live.cancelled) return;
            const result = codecNow.mergeEvents(events, dTag, pubkey);
            if (result.ownCreatedAt >= live.ownCreatedAt) {
              live.ownCreatedAt = result.ownCreatedAt;
              live.own = result.own;
            }
            apply(codecNow.merge(live.value, result.merged), "ready");
          },
          () => {
            if (live.cancelled) return;
            setState((previous) =>
              previous.scope === scope && previous.status === "loading"
                ? { ...previous, status: "error" }
                : previous,
            );
          },
        );

    const ingest = (event: RelayEvent) => {
      if (live.cancelled) return;
      const d = event.tags.filter((tag) => tag[0] === "d");
      if (d.length !== 1 || d[0]?.[1] !== dTag) return;
      const copy = codecNow.decode(event.content);
      if (event.pubkey === pubkey && event.created_at >= live.ownCreatedAt) {
        live.ownCreatedAt = event.created_at;
        live.own = copy;
      }
      const merged = codecNow.merge(live.value, copy);
      if (merged !== live.value) apply(merged);
    };

    let unsubLive: (() => Promise<void>) | null = null;
    void relayClient
      .subscribeLive({ ...filter, limit: 0 }, ingest)
      .then((dispose) => {
        if (live.cancelled) void dispose();
        else unsubLive = dispose;
      })
      .catch(() => {});
    const unsubReconnect = relayClient.subscribeToReconnects(load);
    (live as { load?: () => void }).load = load;
    load();

    return () => {
      live.cancelled = true;
      unsubReconnect();
      if (unsubLive) void unsubLive();
    };
  }, [scope, pubkey, dTag]);

  /**
   * Applies `change` locally, then publishes this member's copy. Publishes
   * run one at a time so each replaces the one before it.
   */
  const commit = React.useCallback(
    (change: (value: T) => T): Promise<void> => {
      const live = liveRef.current;
      const codecNow = codecRef.current;
      if (!live || live.cancelled || live.scope !== scope) {
        return Promise.reject(new Error("아직 불러오는 중입니다."));
      }
      const next = change(live.value);
      live.value = next;
      setState((previous) => ({
        scope,
        value: next,
        status: previous.scope === scope ? previous.status : "ready",
      }));
      const run = async () => {
        if (live.cancelled) return;
        const value = live.value;
        if (!codecNow.hasNewer(value, live.own)) return;
        const content = codecNow.encode(value);
        if (content === null) throw new Error(codecNow.tooBigMessage);
        const createdAt = Math.max(
          Math.floor(Date.now() / 1_000),
          live.ownCreatedAt + 1,
        );
        const event = await signRelayEvent({
          kind: KIND_TEAM_DOC,
          content,
          createdAt,
          tags: [
            ["d", dTag],
            ["t", codecNow.topic],
          ],
        });
        try {
          await relayClient.publishEvent(
            event,
            codecNow.slowMessage,
            codecNow.failedMessage,
            () => !live.cancelled,
          );
        } catch (error) {
          if (!String((error as Error)?.message).startsWith("duplicate:"))
            throw error;
        }
        live.ownCreatedAt = createdAt;
        live.own = value;
      };
      const result = live.queue.then(run, run);
      live.queue = result.catch(() => {});
      return result;
    },
    [scope, dTag],
  );

  const retry = React.useCallback(() => commit((value) => value), [commit]);

  /** Reads the document again (after writes made outside this hook). */
  const refresh = React.useCallback(() => {
    const live = liveRef.current;
    if (live && !live.cancelled) live.load?.();
  }, []);

  return {
    value: current.value,
    status: current.status,
    commit,
    retry,
    refresh,
  };
}
