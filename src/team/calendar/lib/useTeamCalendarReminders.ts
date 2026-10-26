import * as React from "react";
import { toast } from "sonner";

import { sendDesktopNotification } from "../compat/relay";
import {
  type CalendarOccurrence,
  REPEAT_DOC,
  addDays,
  combineMonths,
  expandRepeats,
  monthOfDate,
  shiftMonth,
  todayKey,
} from "./teamCalendar";
import {
  MAX_REMINDER_OFFSET_MINUTES,
  type ReminderOverrides,
  channelNoticeText,
  dueChannelNotices,
  dueReminders,
  parseReminderOverrides,
  reminderLabel,
} from "./teamReminders";
import { postChannelNotice } from "./channelNotice";
import { useTeamCalendarMonth } from "./useTeamCalendar";

const CHECK_INTERVAL_MS = 30_000;
const OVERRIDES_PREFIX = "buzz-team-calendar-reminders.v1";
const WATERMARK_PREFIX = "buzz-team-calendar-reminded.v1";
const OVERRIDES_EVENT = "buzz-team-calendar-reminders-changed";

const storageKey = (prefix: string, pubkey: string, relayUrl: string) =>
  `${prefix}:${pubkey}:${relayUrl}`;

function readOverrides(pubkey: string, relayUrl: string): ReminderOverrides {
  try {
    return parseReminderOverrides(
      window.localStorage.getItem(
        storageKey(OVERRIDES_PREFIX, pubkey, relayUrl),
      ),
    );
  } catch {
    return {};
  }
}

/** This person's own reminder choices per entry, kept on this device. */
export function useReminderOverrides(pubkey: string, relayUrl: string) {
  const [overrides, setOverrides] = React.useState(() =>
    readOverrides(pubkey, relayUrl),
  );
  React.useEffect(() => {
    const refresh = () => setOverrides(readOverrides(pubkey, relayUrl));
    refresh();
    window.addEventListener(OVERRIDES_EVENT, refresh);
    return () => window.removeEventListener(OVERRIDES_EVENT, refresh);
  }, [pubkey, relayUrl]);

  /** `offsets = null` goes back to the default reminders. */
  const setEntryOffsets = React.useCallback(
    (entryId: string, offsets: number[] | null) => {
      const next = { ...readOverrides(pubkey, relayUrl) };
      if (offsets === null) delete next[entryId];
      else next[entryId] = [...new Set(offsets)].sort((a, b) => b - a);
      try {
        window.localStorage.setItem(
          storageKey(OVERRIDES_PREFIX, pubkey, relayUrl),
          JSON.stringify(next),
        );
      } catch {
        // Storage is full or blocked: the choice lasts until the app restarts.
      }
      setOverrides(next);
      window.dispatchEvent(new Event(OVERRIDES_EVENT));
    },
    [pubkey, relayUrl],
  );

  return { overrides, setEntryOffsets };
}

function dateLabel(entry: CalendarOccurrence): string {
  const [, month, day] = entry.date.split("-").map(Number);
  return `${month}월 ${day}일${entry.time ? ` ${entry.time}` : ""}`;
}

/**
 * Fires calendar reminders while the app runs (team patch). Mount once per
 * community: it reads this month, the next one and the repeating entries, and
 * every 30 seconds shows the reminders that came due since the last check.
 */
export function useTeamCalendarReminders(pubkey: string, relayUrl: string) {
  const [month, setMonth] = React.useState(() => monthOfDate(todayKey()));
  const here = useTeamCalendarMonth(pubkey, relayUrl, month);
  const next = useTeamCalendarMonth(pubkey, relayUrl, shiftMonth(month, 1));
  const repeating = useTeamCalendarMonth(pubkey, relayUrl, REPEAT_DOC);

  const entriesRef = React.useRef<CalendarOccurrence[]>([]);
  const readyRef = React.useRef(false);
  const today = todayKey();
  entriesRef.current = React.useMemo(
    () =>
      expandRepeats(
        combineMonths([here.entries, next.entries, repeating.entries]),
        today,
        addDays(today, MAX_REMINDER_OFFSET_MINUTES / 1_440 + 1),
      ),
    [here.entries, next.entries, repeating.entries, today],
  );
  readyRef.current =
    here.status === "ready" &&
    next.status === "ready" &&
    repeating.status === "ready";

  React.useEffect(() => {
    const key = storageKey(WATERMARK_PREFIX, pubkey, relayUrl);
    // Reminders already shown in this run, in case storage cannot be written.
    const shown = new Set<string>();
    const startedAt = Date.now();

    const check = () => {
      setMonth(monthOfDate(todayKey()));
      // An unfinished read must not move the watermark past unseen entries.
      if (!readyRef.current) return;
      const nowMs = Date.now();
      let sinceMs = startedAt;
      try {
        const stored = Number(window.localStorage.getItem(key));
        // First run ever: start from now, not from every past reminder.
        if (Number.isFinite(stored) && stored > 0) sinceMs = stored;
      } catch {
        // Fall back to the start of this run.
      }
      const due = dueReminders({
        entries: entriesRef.current,
        overrides: readOverrides(pubkey, relayUrl),
        pubkey,
        sinceMs,
        nowMs,
      });
      const notices = dueChannelNotices({
        entries: entriesRef.current,
        pubkey,
        sinceMs,
        nowMs,
      });
      try {
        window.localStorage.setItem(key, String(nowMs));
      } catch {
        // `shown` still stops repeats within this run.
      }
      for (const entry of notices) {
        const channelId = entry.notify?.channelId;
        const before = entry.notify?.before;
        if (!channelId || !before) continue;
        const id = `${entry.id}@${entry.date}@channel`;
        if (shown.has(id)) continue;
        shown.add(id);
        // One attempt: the watermark has moved on, so a failed post is not
        // retried into the channel later, out of time.
        void postChannelNotice(
          relayUrl,
          channelId,
          channelNoticeText(entry, `일정 알림 (${reminderLabel(before)})`),
        ).catch(() =>
          toast.error(`"${entry.title}" 일정 알림을 채널에 올리지 못했습니다.`),
        );
      }
      for (const { entry, offset } of due) {
        const id = `${entry.id}@${entry.date}@${offset}`;
        if (shown.has(id)) continue;
        shown.add(id);
        const title = `일정 알림 · ${reminderLabel(offset)}`;
        const body = `${entry.title} — ${dateLabel(entry)}`;
        toast(title, { description: body, duration: 15_000 });
        void sendDesktopNotification({ title, body });
      }
    };

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pubkey, relayUrl]);
}
