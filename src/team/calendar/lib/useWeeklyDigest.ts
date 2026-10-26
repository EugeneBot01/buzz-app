import * as React from "react";
import { toast } from "sonner";

import { getChannelMessagesBefore } from "../compat/relay";
import { relayClient } from "../compat/relay";
import { signRelayEvent } from "../compat/relay";
import { sendChannelMessage } from "../compat/relay";
import { KIND_CHANNEL_SECTIONS } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";
import {
  REPEAT_DOC,
  TEAM_CALENDAR_D_TAG,
  addDays,
  combineMonths,
  expandRepeats,
  monthOfDate,
  shiftMonth,
  todayKey,
} from "./teamCalendar";
import { useTeamCalendarMonth } from "./useTeamCalendar";
import { useTeamMembers } from "./useTeamMembers";
import {
  type DigestSettings,
  DEFAULT_DIGEST,
  alreadyPosted,
  dailyHeader,
  dailyNotices,
  dailyNoticesDue,
  decodeDigest,
  digestDTag,
  digestHeader,
  digestText,
  dueDigestWeek,
  encodeDigest,
  latestDigest,
  postDelaySeconds,
  weekStartOf,
} from "./weeklyDigest";

const CHECK_INTERVAL_MS = 60_000;
const REFRESH_SETTINGS_MS = 5 * 60_000;
/** Recent posts scanned to see whether a notice already went out. */
const DEDUPE_SCAN = 50;
const POSTED_PREFIX = "buzz-team-calendar-digest-posted.v1";

async function fetchDigest(relayUrl: string): Promise<DigestSettings> {
  const events = await relayClient.fetchEvents({
    kinds: [KIND_CHANNEL_SECTIONS],
    "#d": [digestDTag(relayUrl)],
    limit: 200,
  });
  return latestDigest(events.map((event) => decodeDigest(event.content)));
}

/** The community's shared weekly-digest settings, and a way to change them. */
export function useDigestSettings(pubkey: string, relayUrl: string) {
  const [settings, setSettings] =
    React.useState<DigestSettings>(DEFAULT_DIGEST);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setReady(false);
    const load = () =>
      void fetchDigest(relayUrl).then(
        (next) => {
          if (cancelled) return;
          setSettings((previous) => latestDigest([previous, next]));
          setReady(true);
        },
        () => {},
      );
    setSettings(DEFAULT_DIGEST);
    load();
    const interval = window.setInterval(load, REFRESH_SETTINGS_MS);
    const unsubscribe = relayClient.subscribeToReconnects(load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [relayUrl]);

  const save = React.useCallback(
    async (
      change: Partial<Omit<DigestSettings, "updatedAt" | "updatedBy">>,
    ) => {
      const next: DigestSettings = {
        ...settings,
        ...change,
        updatedAt: Math.max(Date.now(), settings.updatedAt + 1),
        updatedBy: pubkey,
      };
      const event = await signRelayEvent({
        kind: KIND_CHANNEL_SECTIONS,
        content: encodeDigest(next),
        createdAt: Math.floor(Date.now() / 1_000),
        tags: [
          ["d", digestDTag(relayUrl)],
          ["t", TEAM_CALENDAR_D_TAG],
        ],
      });
      await relayClient.publishEvent(
        event,
        "주간 공지 설정을 저장하는 데 시간이 너무 오래 걸립니다.",
        "주간 공지 설정을 저장하지 못했습니다.",
      );
      setSettings(next);
    },
    [pubkey, relayUrl, settings],
  );

  return { settings, ready, save };
}

async function recentPosts(channelId: string) {
  const page = await getChannelMessagesBefore(
    channelId,
    { createdAt: Math.floor(Date.now() / 1_000) + 60, eventId: "" },
    DEDUPE_SCAN,
  );
  return page.events;
}

function markPosted(pubkey: string, relayUrl: string, key: string): boolean {
  const storageKey = `${POSTED_PREFIX}:${pubkey}:${relayUrl}`;
  try {
    const done = new Set<string>(
      JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"),
    );
    if (done.has(key)) return false;
    done.add(key);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([...done].slice(-60)),
    );
  } catch {
    // Without storage the channel scan still prevents a second post.
  }
  return true;
}

function wasPosted(pubkey: string, relayUrl: string, key: string): boolean {
  try {
    const done: string[] = JSON.parse(
      window.localStorage.getItem(`${POSTED_PREFIX}:${pubkey}:${relayUrl}`) ??
        "[]",
    );
    return done.includes(key);
  } catch {
    return false;
  }
}

/** Calendar occurrences from four weeks before `weekStart` to its Sunday. */
export function useWeekOccurrences(
  pubkey: string,
  relayUrl: string,
  weekStart: string,
) {
  const firstMonth = monthOfDate(weekStart);
  const here = useTeamCalendarMonth(pubkey, relayUrl, firstMonth);
  const next = useTeamCalendarMonth(
    pubkey,
    relayUrl,
    shiftMonth(firstMonth, 1),
  );
  const repeating = useTeamCalendarMonth(pubkey, relayUrl, REPEAT_DOC);
  const occurrences = React.useMemo(
    () =>
      expandRepeats(
        combineMonths([here.entries, next.entries, repeating.entries]),
        addDays(weekStart, -28),
        addDays(weekStart, 6),
      ),
    [here.entries, next.entries, repeating.entries, weekStart],
  );
  const ready =
    here.status === "ready" &&
    next.status === "ready" &&
    repeating.status === "ready";
  return { occurrences, ready };
}

/** Posts this week's digest now, without the de-duplication check (manual send). */
export async function postDigestNow(
  relayUrl: string,
  channelId: string,
  text: string,
): Promise<void> {
  await sendChannelMessage(
    channelId,
    text,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    normalizeRelayUrl(relayUrl),
  );
}

/**
 * Posts the weekly digest and the same-day notices while the app runs (team
 * patch 55). Mount once per community, next to the calendar reminders.
 */
export function useWeeklyDigest(pubkey: string, relayUrl: string) {
  const { settings, ready } = useDigestSettings(pubkey, relayUrl);
  const weekStart = weekStartOf(todayKey());
  const { occurrences, ready: calendarReady } = useWeekOccurrences(
    pubkey,
    relayUrl,
    weekStart,
  );
  const { nameOf } = useTeamMembers();

  // The interval below reads the newest values without restarting.
  const latest = React.useRef({
    settings,
    ready,
    occurrences,
    nameOf,
    calendarReady,
  });
  latest.current = { settings, ready, occurrences, nameOf, calendarReady };

  React.useEffect(() => {
    const scope = normalizeRelayUrl(relayUrl);
    const delayMs = postDelaySeconds(pubkey) * 1_000;
    let busy = false;

    const post = async (
      channelId: string,
      header: string,
      text: string,
      mentions: string[],
      key: string,
    ) => {
      if (wasPosted(pubkey, relayUrl, key)) return;
      if (alreadyPosted(await recentPosts(channelId), header)) {
        markPosted(pubkey, relayUrl, key);
        return;
      }
      if (!markPosted(pubkey, relayUrl, key)) return;
      await sendChannelMessage(
        channelId,
        text,
        null,
        undefined,
        mentions.length ? mentions : undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        scope,
      );
    };

    const check = async () => {
      const state = latest.current;
      if (busy || !state.ready || !state.calendarReady) return;
      busy = true;
      try {
        const now = Date.now() - delayMs;
        const day = todayKey();
        const week = dueDigestWeek(state.settings, day, now);
        if (week && state.settings.channelId) {
          const header = digestHeader(week);
          await post(
            state.settings.channelId,
            header,
            digestText(state.occurrences, week, state.nameOf),
            [],
            `week:${week}:${state.settings.channelId}`,
          ).catch(() =>
            toast.error("이번 주 일정 공지를 채널에 올리지 못했습니다."),
          );
        }
        if (dailyNoticesDue(state.settings, day, now)) {
          for (const notice of dailyNotices(
            state.occurrences,
            day,
            state.nameOf,
          )) {
            await post(
              notice.channelId,
              dailyHeader(day),
              notice.text,
              notice.mentions,
              `day:${day}:${notice.channelId}`,
            ).catch(() =>
              toast.error("오늘 일정 공지를 채널에 올리지 못했습니다."),
            );
          }
        }
      } finally {
        busy = false;
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pubkey, relayUrl]);
}
