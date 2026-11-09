import * as React from "react";

import { relayClient } from "../compat/relay";
import { signRelayEvent } from "../compat/relay";
import type { RelayEvent } from "../compat/relay";
import { KIND_CHANNEL_SECTIONS } from "../compat/relay";
import {
  type CalendarColor,
  type CalendarEntry,
  type CalendarMonth,
  type CalendarNotify,
  type CalendarRepeat,
  DEPT_KEY_PATTERN,
  MAX_ATTENDEES,
  MAX_NOTE_LENGTH,
  MAX_SKIPPED_DAYS,
  MAX_TEAM_CALENDAR_AUTHORS,
  MAX_TITLE_LENGTH,
  REPEAT_DOC,
  TEAM_CALENDAR_D_TAG,
  combineMonths,
  decodeMonth,
  docOfEntry,
  encodeForPublish,
  hasNewerEntries,
  mergeMonthEvents,
  mergeMonths,
  monthsAround,
  teamCalendarDTag,
  validateRange,
} from "./teamCalendar";
import { assignMonthSlots } from "./monthSlots";

/** kind 30078 (application data), the same kind team sections use. */
const KIND_TEAM_CALENDAR = KIND_CHANNEL_SECTIONS;

export type CalendarEntryInput = {
  /** Omit to create a new entry. */
  id?: string | undefined;
  title: string;
  date: string;
  time?: string | undefined;
  /** Last day of a multi-day entry; leave out (or equal to `date`) for one day. */
  endDate?: string | undefined;
  endTime?: string | undefined;
  color?: CalendarColor | undefined;
  note?: string | undefined;
  /** Leave out (or empty) for the whole team. */
  attendees?: string[] | undefined;
  repeat?: CalendarRepeat | undefined;
  skip?: string[] | undefined;
  sourceEventId?: string | undefined;
  notify?: CalendarNotify | undefined;
  /** Sprint board department key; leave out for none. */
  dept?: string | undefined;
  milestone?: boolean | undefined;
};

/** The input that saves `entry` again unchanged (to change one field of it). */
export const inputOfEntry = (entry: CalendarEntry): CalendarEntryInput => ({
  id: entry.id,
  title: entry.title,
  date: entry.date,
  time: entry.time,
  endDate: entry.endDate,
  endTime: entry.endTime,
  color: entry.color,
  note: entry.note,
  attendees: entry.attendees,
  repeat: entry.repeat,
  skip: entry.skip,
  sourceEventId: entry.sourceEventId,
  notify: entry.notify,
  dept: entry.dept,
  milestone: entry.milestone,
});

export type TeamCalendarStatus = "loading" | "ready" | "error";

/** One shared empty month, so an empty view keeps the same object. */
const EMPTY_MONTH: CalendarMonth = Object.freeze({}) as CalendarMonth;

const monthFilter = (dTag: string) => ({
  kinds: [KIND_TEAM_CALENDAR],
  "#d": [dTag],
});

async function fetchMonth(relayUrl: string, month: string, pubkey: string) {
  const dTag = teamCalendarDTag(relayUrl, month);
  const events = await relayClient.fetchEvents({
    ...monthFilter(dTag),
    limit: MAX_TEAM_CALENDAR_AUTHORS,
  });
  return mergeMonthEvents(events, dTag, month, pubkey);
}

/**
 * Publishes this member's copy of one month. Returns the `created_at` used so
 * the next publish can replace it. `isCurrent` is checked right before the
 * send, so a publish that outlives its scope (a community switch mid-flight)
 * is dropped instead of sent.
 */
async function publishMonth(input: {
  relayUrl: string;
  month: string;
  entries: CalendarMonth;
  ownCreatedAt: number;
  isCurrent: () => boolean;
}): Promise<number> {
  const content = encodeForPublish(input.entries);
  if (content === null) {
    throw new Error("이 달에는 일정이 너무 많아 더 저장할 수 없습니다.");
  }
  const dTag = teamCalendarDTag(input.relayUrl, input.month);
  const createdAt = Math.max(
    Math.floor(Date.now() / 1_000),
    input.ownCreatedAt + 1,
  );
  const event = await signRelayEvent({
    kind: KIND_TEAM_CALENDAR,
    content,
    createdAt,
    tags: [
      ["d", dTag],
      ["t", TEAM_CALENDAR_D_TAG],
    ],
  });
  try {
    await relayClient.publishEvent(
      event,
      "팀 캘린더를 저장하는 데 시간이 너무 오래 걸립니다.",
      "팀 캘린더를 저장하지 못했습니다.",
      input.isCurrent,
    );
  } catch (error) {
    if (!String((error as Error)?.message).startsWith("duplicate:"))
      throw error;
  }
  return createdAt;
}

function buildEntry(
  input: CalendarEntryInput,
  previous: CalendarEntry | undefined,
  pubkey: string,
): CalendarEntry {
  const entry: CalendarEntry = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title.trim().slice(0, MAX_TITLE_LENGTH),
    date: input.date,
    // Always later than the copy it replaces, even if this clock is behind.
    updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
    updatedBy: pubkey,
  };
  if (input.time) entry.time = input.time;
  if (input.endDate && input.endDate > input.date)
    entry.endDate = input.endDate;
  if (input.time && input.endTime) entry.endTime = input.endTime;
  if (input.color) entry.color = input.color;
  const note = input.note?.trim().slice(0, MAX_NOTE_LENGTH);
  if (note) entry.note = note;
  if (input.attendees && input.attendees.length > 0)
    entry.attendees = [...new Set(input.attendees)]
      .slice(0, MAX_ATTENDEES)
      .sort();
  if (input.repeat) {
    entry.repeat = { every: input.repeat.every };
    if (input.repeat.until) entry.repeat.until = input.repeat.until;
    if (input.skip && input.skip.length > 0)
      entry.skip = [...new Set(input.skip)].sort().slice(-MAX_SKIPPED_DAYS);
  }
  if (input.sourceEventId) entry.sourceEventId = input.sourceEventId;
  if (input.notify?.channelId) {
    entry.notify = { channelId: input.notify.channelId };
    if (input.notify.before) entry.notify.before = input.notify.before;
  }
  if (input.dept && DEPT_KEY_PATTERN.test(input.dept)) entry.dept = input.dept;
  if (input.milestone) entry.milestone = true;
  return entry;
}

/**
 * Saves an entry straight into the document it belongs to, without a month
 * view open: reads that document, merges the entry in and publishes this
 * member's copy. Saving the same id again replaces the entry.
 */
export async function saveEntryToDoc(input: {
  pubkey: string;
  relayUrl: string;
  entry: CalendarEntryInput;
  isCurrent?: (() => boolean) | undefined;
}): Promise<CalendarEntry> {
  const problem = validateRange(input.entry);
  if (problem) throw new Error(problem);
  const doc = docOfEntry(input.entry);
  const there = await fetchMonth(input.relayUrl, doc, input.pubkey);
  const previous = input.entry.id ? there.merged[input.entry.id] : undefined;
  const entry = buildEntry(input.entry, previous, input.pubkey);
  await publishMonth({
    relayUrl: input.relayUrl,
    month: doc,
    entries: mergeMonths(there.merged, { [entry.id]: entry }),
    ownCreatedAt: there.ownCreatedAt,
    isCurrent: input.isCurrent ?? (() => true),
  });
  return entry;
}

const tombstone = (entry: CalendarEntry, pubkey: string): CalendarEntry => ({
  id: entry.id,
  title: "",
  date: entry.date,
  updatedAt: Math.max(Date.now(), entry.updatedAt + 1),
  updatedBy: pubkey,
  deleted: true,
});

/**
 * One month of the team calendar for one pubkey + relay scope: every member's
 * copy merged, kept live, and this member's edits published.
 */
export function useTeamCalendarMonth(
  pubkey: string,
  relayUrl: string,
  month: string,
) {
  const scope = `${pubkey}|${relayUrl}|${month}`;
  const [state, setState] = React.useState<{
    scope: string;
    entries: CalendarMonth;
    status: TeamCalendarStatus;
  }>({ scope, entries: {}, status: "loading" });
  // Never show another month's (or community's) entries for a frame.
  const current =
    state.scope === scope
      ? state
      : {
          scope,
          entries: EMPTY_MONTH,
          status: month ? ("loading" as const) : ("ready" as const),
        };

  // What this scope's effect instance knows; replaced on every scope change.
  const liveRef = React.useRef<{
    scope: string;
    cancelled: boolean;
    entries: CalendarMonth;
    own: CalendarMonth;
    ownCreatedAt: number;
    queue: Promise<void>;
    load?: () => void;
  } | null>(null);

  React.useEffect(() => {
    // An empty month is an unused slot of `useTeamCalendarMonths`.
    if (!month) {
      liveRef.current = null;
      setState({ scope, entries: EMPTY_MONTH, status: "ready" });
      return;
    }
    const live = {
      scope,
      cancelled: false,
      entries: {} as CalendarMonth,
      own: {} as CalendarMonth,
      ownCreatedAt: 0,
      queue: Promise.resolve(),
    };
    liveRef.current = live;
    setState({ scope, entries: {}, status: "loading" });

    const dTag = teamCalendarDTag(relayUrl, month);
    const apply = (next: CalendarMonth, status?: TeamCalendarStatus) => {
      live.entries = next;
      setState((previous) => ({
        scope,
        entries: next,
        status:
          status ?? (previous.scope === scope ? previous.status : "ready"),
      }));
    };

    const load = () =>
      void fetchMonth(relayUrl, month, pubkey).then(
        (result) => {
          if (live.cancelled) return;
          // Keep the newest own event seen so the next publish replaces it.
          if (result.ownCreatedAt >= live.ownCreatedAt) {
            live.ownCreatedAt = result.ownCreatedAt;
            live.own = result.own;
          }
          apply(mergeMonths(live.entries, result.merged), "ready");
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
      const copy = decodeMonth(event.content, month);
      if (event.pubkey === pubkey && event.created_at >= live.ownCreatedAt) {
        live.ownCreatedAt = event.created_at;
        live.own = copy;
      }
      const merged = mergeMonths(live.entries, copy);
      if (merged !== live.entries) apply(merged);
    };

    let unsubLive: (() => Promise<void>) | null = null;
    void relayClient
      .subscribeLive({ ...monthFilter(dTag), limit: 0 }, ingest)
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
  }, [scope, pubkey, relayUrl, month]);

  /** Reads the month again (after writes made outside this hook). */
  const refresh = React.useCallback(() => {
    const live = liveRef.current;
    if (live && !live.cancelled) live.load?.();
  }, []);

  /**
   * Applies `change` to this month locally, then publishes this member's
   * copy. Publishes run one at a time so each replaces the one before it.
   */
  const commit = React.useCallback(
    (change: (entries: CalendarMonth) => CalendarMonth): Promise<void> => {
      const live = liveRef.current;
      if (!live || live.cancelled || live.scope !== scope) {
        return Promise.reject(new Error("캘린더를 아직 불러오는 중입니다."));
      }
      const next = change(live.entries);
      live.entries = next;
      setState((previous) => ({
        scope,
        entries: next,
        status: previous.scope === scope ? previous.status : "ready",
      }));
      const run = async () => {
        if (live.cancelled) return;
        // Publish whatever is newest by the time this turn runs.
        const entries = live.entries;
        if (!hasNewerEntries(entries, live.own)) return;
        const createdAt = await publishMonth({
          relayUrl,
          month,
          entries,
          ownCreatedAt: live.ownCreatedAt,
          isCurrent: () => !live.cancelled,
        });
        live.ownCreatedAt = createdAt;
        live.own = entries;
      };
      const result = live.queue.then(run, run);
      live.queue = result.catch(() => {});
      return result;
    },
    [scope, relayUrl, month],
  );

  /** Creates or updates an entry. Moving it to another month is handled too. */
  const saveEntry = React.useCallback(
    async (input: CalendarEntryInput): Promise<void> => {
      const problem = validateRange(input);
      if (problem) throw new Error(problem);
      const live = liveRef.current;
      const previous = input.id ? live?.entries[input.id] : undefined;
      const entry = buildEntry(input, previous, pubkey);
      const targetMonth = docOfEntry(entry);
      if (targetMonth === month) {
        await commit((entries) => mergeMonths(entries, { [entry.id]: entry }));
        return;
      }
      // The date moved to another month: write it there first, then remove
      // it here, so a failure in between leaves a duplicate, not a loss.
      const there = await fetchMonth(relayUrl, targetMonth, pubkey);
      await publishMonth({
        relayUrl,
        month: targetMonth,
        entries: mergeMonths(there.merged, { [entry.id]: entry }),
        ownCreatedAt: there.ownCreatedAt,
        isCurrent: () => liveRef.current?.cancelled !== true,
      });
      if (previous) {
        await commit((entries) =>
          mergeMonths(entries, {
            [previous.id]: tombstone(previous, pubkey),
          }),
        );
      }
    },
    [commit, month, pubkey, relayUrl],
  );

  const deleteEntry = React.useCallback(
    (id: string): Promise<void> =>
      commit((entries) => {
        const entry = entries[id];
        return entry && !entry.deleted
          ? mergeMonths(entries, { [id]: tombstone(entry, pubkey) })
          : entries;
      }),
    [commit, pubkey],
  );

  /** Publishes again after a failed save (nothing to do when all is saved). */
  const retry = React.useCallback(() => commit((entries) => entries), [commit]);

  return {
    entries: current.entries,
    status: current.status,
    saveEntry,
    deleteEntry,
    retry,
    refresh,
  };
}

type MonthHandle = ReturnType<typeof useTeamCalendarMonth>;

/**
 * What a month view shows: the month before, the month itself and the month
 * after, so an entry that runs across a month edge is drawn on both sides. An
 * entry is stored in the month it starts in; `saveEntry` and `deleteEntry`
 * find the right month for it.
 */
export function useTeamCalendarRange(
  pubkey: string,
  relayUrl: string,
  month: string,
) {
  const [before, here, after] = monthsAround(month);
  const previous = useTeamCalendarMonth(pubkey, relayUrl, before);
  const current = useTeamCalendarMonth(pubkey, relayUrl, here);
  const following = useTeamCalendarMonth(pubkey, relayUrl, after);
  const repeating = useTeamCalendarMonth(pubkey, relayUrl, REPEAT_DOC);

  const entries = React.useMemo(
    () =>
      combineMonths([
        previous.entries,
        current.entries,
        following.entries,
        repeating.entries,
      ]),
    [previous.entries, current.entries, following.entries, repeating.entries],
  );

  const handles: Array<[string, MonthHandle]> = [
    [before, previous],
    [here, current],
    [after, following],
    [REPEAT_DOC, repeating],
  ];
  /** The month that holds the live copy of an entry. */
  const ownerOf = (id: string) =>
    handles.find(([, handle]) => {
      const entry = handle.entries[id];
      return entry !== undefined && !entry.deleted;
    })?.[1];
  const handleForMonth = (target: string) =>
    handles.find(([key]) => key === target)?.[1];

  const saveEntry = async (input: CalendarEntryInput): Promise<void> => {
    const owner = input.id ? ownerOf(input.id) : undefined;
    const target = handleForMonth(docOfEntry(input));
    if (owner && target && owner !== target) {
      // Moved to another month we have open: write it there first, then leave
      // a deletion here, so a failure in between leaves a duplicate (the newer
      // copy is shown), not a loss.
      await target.saveEntry(input);
      if (input.id) await owner.deleteEntry(input.id);
      return;
    }
    // Otherwise the month that has it, else the month it starts in, else the
    // visible month (which publishes into a month that is not open).
    await (owner ?? target ?? current).saveEntry(input);
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await (ownerOf(id) ?? current).deleteEntry(id);
  };

  const retry = async (): Promise<void> => {
    await Promise.all(handles.map(([, handle]) => handle.retry()));
  };

  return {
    entries,
    // A neighbouring month that is still loading only fills in later.
    status: current.status,
    saveEntry,
    deleteEntry,
    retry,
  };
}

/**
 * Any set of months of the team calendar (plus the repeat document) as one
 * entry list. Used by the dialog so the sprint board and the month view read
 * and write the very same entries: an edit in one shows up in the other.
 */
export function useTeamCalendarMonths(
  pubkey: string,
  relayUrl: string,
  wanted: readonly string[],
) {
  const slotsRef = React.useRef<string[]>([]);
  const wantedKey = [...new Set(wanted)].sort().join(",");
  const slots = React.useMemo(() => {
    const next = assignMonthSlots(
      slotsRef.current,
      wantedKey ? wantedKey.split(",") : [],
    );
    slotsRef.current = next;
    return next;
  }, [wantedKey]);

  // A fixed number of hook calls: React needs the same hooks every render.
  const s0 = useTeamCalendarMonth(pubkey, relayUrl, slots[0] ?? "");
  const s1 = useTeamCalendarMonth(pubkey, relayUrl, slots[1] ?? "");
  const s2 = useTeamCalendarMonth(pubkey, relayUrl, slots[2] ?? "");
  const s3 = useTeamCalendarMonth(pubkey, relayUrl, slots[3] ?? "");
  const s4 = useTeamCalendarMonth(pubkey, relayUrl, slots[4] ?? "");
  const s5 = useTeamCalendarMonth(pubkey, relayUrl, slots[5] ?? "");
  const s6 = useTeamCalendarMonth(pubkey, relayUrl, slots[6] ?? "");
  const s7 = useTeamCalendarMonth(pubkey, relayUrl, slots[7] ?? "");
  const s8 = useTeamCalendarMonth(pubkey, relayUrl, slots[8] ?? "");
  const s9 = useTeamCalendarMonth(pubkey, relayUrl, slots[9] ?? "");
  const s10 = useTeamCalendarMonth(pubkey, relayUrl, slots[10] ?? "");
  const s11 = useTeamCalendarMonth(pubkey, relayUrl, slots[11] ?? "");
  const repeating = useTeamCalendarMonth(pubkey, relayUrl, REPEAT_DOC);
  const monthHandles = [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11];

  const handles: Array<[string, MonthHandle]> = [
    ...slots
      .map((month, index) => [month, monthHandles[index]] as const)
      .filter((pair): pair is [string, MonthHandle] =>
        Boolean(pair[0] && pair[1]),
      ),
    [REPEAT_DOC, repeating],
  ];

  const all = [...monthHandles, repeating];
  const e = all.map((handle) => handle.entries);
  // Unused slots hold an empty month, so combining all of them is the same.
  const entries = React.useMemo(
    () => combineMonths(e),
    [
      e[0],
      e[1],
      e[2],
      e[3],
      e[4],
      e[5],
      e[6],
      e[7],
      e[8],
      e[9],
      e[10],
      e[11],
      e[12],
    ],
  );

  const statuses = handles.map(([, handle]) => handle.status);
  const status: TeamCalendarStatus = statuses.includes("error")
    ? "error"
    : statuses.includes("loading")
      ? "loading"
      : "ready";

  const ownerOf = (id: string) =>
    handles.find(([, handle]) => {
      const entry = handle.entries[id];
      return entry !== undefined && !entry.deleted;
    })?.[1];
  const handleForMonth = (target: string) =>
    handles.find(([key]) => key === target)?.[1];

  const saveEntry = async (input: CalendarEntryInput): Promise<void> => {
    const owner = input.id ? ownerOf(input.id) : undefined;
    const target = handleForMonth(docOfEntry(input));
    if (owner && target && owner !== target) {
      // Write the new place first, then leave a deletion in the old one, so a
      // failure in between leaves a duplicate (the newer copy shows), not a loss.
      await target.saveEntry(input);
      if (input.id) await owner.deleteEntry(input.id);
      return;
    }
    // The repeat document is always open; it publishes into a month that is
    // not open when it has to.
    await (owner ?? target ?? repeating).saveEntry(input);
  };

  const deleteEntry = async (id: string): Promise<void> => {
    const owner = ownerOf(id);
    if (owner) await owner.deleteEntry(id);
  };

  const retry = async (): Promise<void> => {
    await Promise.all(handles.map(([, handle]) => handle.retry()));
  };

  /** Status of only the given months (e.g. the month the person looks at). */
  const statusOf = (months: readonly string[]): TeamCalendarStatus => {
    const list = months
      .map((month) => handleForMonth(month)?.status ?? "loading")
      .concat(repeating.status);
    return list.includes("error")
      ? "error"
      : list.includes("loading")
        ? "loading"
        : "ready";
  };

  /** Reads every open month again (after an import). */
  const refresh = () => {
    for (const handle of all) handle.refresh();
  };

  return { entries, status, statusOf, saveEntry, deleteEntry, retry, refresh };
}

/**
 * Saves many entries at once (an import): entries are grouped by the document
 * they belong to, and each document is read, merged and published once.
 * Saving the same ids again replaces those entries, so an import can be run
 * twice without making duplicates.
 */
export async function saveEntriesToDocs(input: {
  pubkey: string;
  relayUrl: string;
  entries: CalendarEntryInput[];
  isCurrent?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<number> {
  const byDoc = new Map<string, CalendarEntryInput[]>();
  for (const entry of input.entries) {
    const problem = validateRange(entry);
    if (problem) throw new Error(`${entry.title}: ${problem}`);
    const doc = docOfEntry(entry);
    byDoc.set(doc, [...(byDoc.get(doc) ?? []), entry]);
  }
  let done = 0;
  for (const [doc, list] of byDoc) {
    if (input.isCurrent && !input.isCurrent()) break;
    const there = await fetchMonth(input.relayUrl, doc, input.pubkey);
    let merged = there.merged;
    for (const entryInput of list) {
      const previous = entryInput.id ? merged[entryInput.id] : undefined;
      const entry = buildEntry(entryInput, previous, input.pubkey);
      merged = mergeMonths(merged, { [entry.id]: entry });
    }
    await publishMonth({
      relayUrl: input.relayUrl,
      month: doc,
      entries: merged,
      ownCreatedAt: there.ownCreatedAt,
      isCurrent: input.isCurrent ?? (() => true),
    });
    done += list.length;
    input.onProgress?.(done, input.entries.length);
  }
  return done;
}

/**
 * Every live entry of the given months plus the repeating ones, read fresh
 * from the relay (for exports of months the dialog does not have open).
 */
export async function fetchEntriesForMonths(
  pubkey: string,
  relayUrl: string,
  months: readonly string[],
) {
  const docs = [...new Set([...months, REPEAT_DOC])];
  const results = await Promise.all(
    docs.map((doc) => fetchMonth(relayUrl, doc, pubkey)),
  );
  return combineMonths(results.map((result) => result.merged));
}
