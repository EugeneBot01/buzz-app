import { type CalendarOccurrence, isAttendee } from "./teamCalendar";

/**
 * Calendar reminders (team patch). Every attendee of an entry gets the default
 * reminders; each person can change their own per entry. The choice is kept on
 * this device, and a reminder only fires while the app is running: there is no
 * server that could send it.
 */

/** Minutes before the start: a day, 30 minutes, 10 minutes. */
export const DEFAULT_REMINDER_OFFSETS = [1_440, 30, 10] as const;
/** An all-day entry has no clock time to count back from: only the day before. */
export const ALL_DAY_REMINDER_OFFSETS = [1_440] as const;
/** Offsets a person can pick, in minutes. */
export const REMINDER_CHOICES = [
  10, 30, 60, 180, 1_440, 2_880, 10_080,
] as const;
/** The longest offset: how far ahead entries must be read. */
export const MAX_REMINDER_OFFSET_MINUTES = 10_080;
/** An all-day entry counts as starting at this local hour. */
export const ALL_DAY_START_HOUR = 9;

/** A person's own reminder offsets by entry id. */
export type ReminderOverrides = Record<string, number[]>;

export function reminderLabel(offset: number): string {
  if (offset % 10_080 === 0) return `${offset / 10_080}주 전`;
  if (offset === 1_440) return "하루 전";
  if (offset % 1_440 === 0) return `${offset / 1_440}일 전`;
  if (offset % 60 === 0) return `${offset / 60}시간 전`;
  return `${offset}분 전`;
}

/** Local start of an occurrence as milliseconds since epoch. */
export function occurrenceStartMs(entry: CalendarOccurrence): number {
  const [year, month, day] = entry.date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = entry.time
    ? (entry.time.split(":").map(Number) as [number, number])
    : [ALL_DAY_START_HOUR, 0];
  return new Date(year, month - 1, day, hour, minute).getTime();
}

/** The offsets that apply to an entry for this person. */
export function reminderOffsets(
  entry: CalendarOccurrence,
  overrides: ReminderOverrides,
): number[] {
  const own = overrides[entry.id];
  if (own) return own;
  return [
    ...(entry.time ? DEFAULT_REMINDER_OFFSETS : ALL_DAY_REMINDER_OFFSETS),
  ];
}

export function parseReminderOverrides(raw: string | null): ReminderOverrides {
  if (!raw) return {};
  try {
    const json: unknown = JSON.parse(raw);
    if (!json || typeof json !== "object") return {};
    const result: ReminderOverrides = {};
    for (const [id, value] of Object.entries(json as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      result[id] = [
        ...new Set(
          value.filter(
            (offset): offset is number =>
              typeof offset === "number" &&
              Number.isInteger(offset) &&
              offset > 0 &&
              offset <= MAX_REMINDER_OFFSET_MINUTES,
          ),
        ),
      ].sort((a, b) => b - a);
    }
    return result;
  } catch {
    return {};
  }
}

export type DueReminder = { entry: CalendarOccurrence; offset: number };

/**
 * The channel reminders that came due after `sinceMs` and up to `nowMs`.
 * Only the member who last saved an entry posts its channel reminder, so a
 * channel gets one message however many members have the app open.
 */
export function dueChannelNotices(input: {
  entries: CalendarOccurrence[];
  pubkey: string;
  sinceMs: number;
  nowMs: number;
}): CalendarOccurrence[] {
  return input.entries.filter((entry) => {
    if (entry.deleted || entry.updatedBy !== input.pubkey) return false;
    const before = entry.notify?.before;
    if (!before) return false;
    const start = occurrenceStartMs(entry);
    if (start <= input.nowMs) return false;
    const fireAt = start - before * 60_000;
    return fireAt > input.sinceMs && fireAt <= input.nowMs;
  });
}

/** The parts of an entry a channel notice mentions. */
export type NoticeEntry = Pick<
  CalendarOccurrence,
  "title" | "date" | "time" | "endDate" | "endTime" | "note"
>;

/** "10월 12일 (월) 15:00 ~ 17:00" for a message about an entry. */
export function entryWhenText(entry: NoticeEntry): string {
  const day = (date: string) => {
    const [year, month, dayOfMonth] = date.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][
      new Date(year, month - 1, dayOfMonth).getDay()
    ];
    return `${month}월 ${dayOfMonth}일 (${weekday})`;
  };
  const end = entry.endDate ?? entry.date;
  if (end === entry.date) {
    if (!entry.time) return `${day(entry.date)} 하루 종일`;
    return `${day(entry.date)} ${entry.time}${entry.endTime ? ` ~ ${entry.endTime}` : ""}`;
  }
  return `${day(entry.date)}${entry.time ? ` ${entry.time}` : ""} ~ ${day(end)}${entry.endTime ? ` ${entry.endTime}` : ""}`;
}

/** The text posted to a channel about an entry. */
export function channelNoticeText(entry: NoticeEntry, lead: string): string {
  const lines = [`📅 ${lead}: ${entry.title}`, entryWhenText(entry)];
  if (entry.note) lines.push(entry.note);
  return lines.join("\n");
}

/**
 * The reminders that came due after `sinceMs` and up to `nowMs`, for entries
 * `pubkey` attends that have not started yet. One per entry: when several
 * came due together (the app was closed), only the nearest to the start.
 */
export function dueReminders(input: {
  entries: CalendarOccurrence[];
  overrides: ReminderOverrides;
  pubkey: string;
  sinceMs: number;
  nowMs: number;
}): DueReminder[] {
  const due: DueReminder[] = [];
  for (const entry of input.entries) {
    if (entry.deleted || !isAttendee(entry, input.pubkey)) continue;
    const start = occurrenceStartMs(entry);
    if (start <= input.nowMs) continue;
    const offsets = reminderOffsets(entry, input.overrides)
      .filter((offset) => {
        const fireAt = start - offset * 60_000;
        return fireAt > input.sinceMs && fireAt <= input.nowMs;
      })
      .sort((a, b) => a - b);
    const nearest = offsets[0];
    if (nearest !== undefined) due.push({ entry, offset: nearest });
  }
  return due;
}
