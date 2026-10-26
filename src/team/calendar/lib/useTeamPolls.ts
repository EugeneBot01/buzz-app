import * as React from "react";

import { relayClient } from "../compat/relay";
import { signRelayEvent } from "../compat/relay";
import type { RelayEvent } from "../compat/relay";
import { KIND_CHANNEL_SECTIONS } from "../compat/relay";
import { MAX_TEAM_CALENDAR_AUTHORS, todayKey } from "./teamCalendar";
import {
  type DatePoll,
  MAX_POLL_TITLE_LENGTH,
  type PollAnswer,
  type PollInput,
  type PollState,
  TEAM_POLLS_D_TAG,
  decodePollDoc,
  encodePollDoc,
  mergePollEvents,
  mergePolls,
  pollOptions,
  teamPollsDTag,
  validatePoll,
} from "./teamPolls";

export type TeamPollsStatus = "loading" | "ready" | "error";

const emptyState = (): PollState => ({ polls: {}, answersByMember: {} });

/**
 * The community's meeting-date polls for one pubkey + relay scope: every
 * member's copy merged, kept live, and this member's edits and answers
 * published.
 */
export function useTeamPolls(pubkey: string, relayUrl: string) {
  const scope = `${pubkey}|${relayUrl}`;
  const [state, setState] = React.useState<{
    scope: string;
    data: PollState;
    status: TeamPollsStatus;
  }>({ scope, data: emptyState(), status: "loading" });
  const current =
    state.scope === scope
      ? state
      : { scope, data: emptyState(), status: "loading" as const };

  const liveRef = React.useRef<{
    scope: string;
    cancelled: boolean;
    /** The first read finished, so this member's own answers are known. */
    loaded: boolean;
    data: PollState;
    ownCreatedAt: number;
    /** What this member's event on the relay holds, as far as we know. */
    published: string | null;
    queue: Promise<void>;
  } | null>(null);

  React.useEffect(() => {
    const live = {
      scope,
      cancelled: false,
      loaded: false,
      data: emptyState(),
      ownCreatedAt: 0,
      published: null as string | null,
      queue: Promise.resolve(),
    };
    liveRef.current = live;
    setState({ scope, data: emptyState(), status: "loading" });

    const dTag = teamPollsDTag(relayUrl);
    const filter = { kinds: [KIND_CHANNEL_SECTIONS], "#d": [dTag] };
    const apply = (data: PollState, status?: TeamPollsStatus) => {
      live.data = data;
      setState((previous) => ({
        scope,
        data,
        status:
          status ?? (previous.scope === scope ? previous.status : "ready"),
      }));
    };

    /** Folds one member's document in; their answers replace the old ones. */
    const fold = (
      base: PollState,
      author: string,
      polls: Record<string, DatePoll>,
      answers: Record<string, PollAnswer>,
    ): PollState => {
      // This member's own answers are whatever they last chose here, not an
      // echo of an older event.
      const keepOwn = author === pubkey && base.answersByMember[pubkey];
      return {
        polls: mergePolls(base.polls, polls),
        answersByMember: keepOwn
          ? base.answersByMember
          : { ...base.answersByMember, [author]: answers },
      };
    };

    const load = () =>
      void relayClient
        .fetchEvents({ ...filter, limit: MAX_TEAM_CALENDAR_AUTHORS })
        .then(
          (events) => {
            if (live.cancelled) return;
            const merged = mergePollEvents(events, dTag, pubkey);
            if (merged.ownCreatedAt > live.ownCreatedAt)
              live.ownCreatedAt = merged.ownCreatedAt;
            let next = live.data;
            for (const [author, answers] of Object.entries(
              merged.answersByMember,
            ))
              next = fold(next, author, {}, answers);
            next = { ...next, polls: mergePolls(next.polls, merged.polls) };
            live.loaded = true;
            apply(next, "ready");
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
      if (event.pubkey === pubkey && event.created_at > live.ownCreatedAt)
        live.ownCreatedAt = event.created_at;
      const doc = decodePollDoc(event.content);
      apply(fold(live.data, event.pubkey, doc.polls, doc.answers));
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
    load();

    return () => {
      live.cancelled = true;
      unsubReconnect();
      if (unsubLive) void unsubLive();
    };
  }, [scope, pubkey, relayUrl]);

  /** Applies `change` locally, then publishes this member's document. */
  const commit = React.useCallback(
    (change: (data: PollState) => PollState): Promise<void> => {
      const live = liveRef.current;
      // Publishing before the first read would drop answers already saved.
      if (!live || live.cancelled || live.scope !== scope || !live.loaded)
        return Promise.reject(new Error("투표를 아직 불러오는 중입니다."));
      const next = change(live.data);
      live.data = next;
      setState((previous) => ({
        scope,
        data: next,
        status: previous.scope === scope ? previous.status : "ready",
      }));
      const run = async () => {
        if (live.cancelled) return;
        const content = encodePollDoc(
          {
            polls: live.data.polls,
            answers: live.data.answersByMember[pubkey] ?? {},
          },
          todayKey(),
        );
        if (content === null)
          throw new Error("투표가 너무 많아 더 저장할 수 없습니다.");
        if (content === live.published) return;
        const createdAt = Math.max(
          Math.floor(Date.now() / 1_000),
          live.ownCreatedAt + 1,
        );
        const event = await signRelayEvent({
          kind: KIND_CHANNEL_SECTIONS,
          content,
          createdAt,
          tags: [
            ["d", teamPollsDTag(relayUrl)],
            ["t", TEAM_POLLS_D_TAG],
          ],
        });
        try {
          await relayClient.publishEvent(
            event,
            "투표를 저장하는 데 시간이 너무 오래 걸립니다.",
            "투표를 저장하지 못했습니다.",
            () => !live.cancelled,
          );
        } catch (error) {
          if (!String((error as Error)?.message).startsWith("duplicate:"))
            throw error;
        }
        live.ownCreatedAt = createdAt;
        live.published = content;
      };
      const result = live.queue.then(run, run);
      live.queue = result.catch(() => {});
      return result;
    },
    [scope, pubkey, relayUrl],
  );

  /** Creates a poll, or changes one (pass its `id`). */
  const savePoll = React.useCallback(
    (input: PollInput & { id?: string | undefined }): Promise<void> => {
      const problem = validatePoll(input);
      if (problem) return Promise.reject(new Error(problem));
      return commit((data) => {
        const previous = input.id ? data.polls[input.id] : undefined;
        const poll: DatePoll = {
          id: input.id ?? crypto.randomUUID(),
          title: input.title.trim().slice(0, MAX_POLL_TITLE_LENGTH),
          startDate: input.startDate,
          endDate: input.endDate,
          createdBy: previous?.createdBy ?? pubkey,
          updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
          updatedBy: pubkey,
        };
        if (input.hours) poll.hours = input.hours;
        return { ...data, polls: mergePolls(data.polls, { [poll.id]: poll }) };
      });
    },
    [commit, pubkey],
  );

  const deletePoll = React.useCallback(
    (id: string): Promise<void> =>
      commit((data) => {
        const poll = data.polls[id];
        if (!poll || poll.deleted) return data;
        const gone: DatePoll = {
          ...poll,
          title: "",
          updatedAt: Math.max(Date.now(), poll.updatedAt + 1),
          updatedBy: pubkey,
          deleted: true,
        };
        return { ...data, polls: mergePolls(data.polls, { [id]: gone }) };
      }),
    [commit, pubkey],
  );

  /** Replaces this member's answer to a poll. */
  const answerPoll = React.useCallback(
    (id: string, choices: string[]): Promise<void> =>
      commit((data) => {
        const poll = data.polls[id];
        if (!poll || poll.deleted) return data;
        const options = new Set(pollOptions(poll));
        const answer: PollAnswer = {
          choices: [...new Set(choices)]
            .filter((choice) => options.has(choice))
            .sort(),
          updatedAt: Date.now(),
        };
        return {
          ...data,
          answersByMember: {
            ...data.answersByMember,
            [pubkey]: { ...data.answersByMember[pubkey], [id]: answer },
          },
        };
      }),
    [commit, pubkey],
  );

  const retry = React.useCallback(() => commit((data) => data), [commit]);

  return {
    polls: current.data.polls,
    answersByMember: current.data.answersByMember,
    status: current.status,
    savePoll,
    deletePoll,
    answerPoll,
    retry,
  };
}
