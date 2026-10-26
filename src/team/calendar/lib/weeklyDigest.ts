/**
 * Weekly calendar digest and same-day channel notices (team patch 55).
 *
 * Settings are one shared document per community (kind 30078,
 * `d = team-calendar:<relay>:digest`), last-writer-wins like calendar entries,
 * so every member's app agrees on where and when to post.
 *
 * There is no server: the first member app that is running at the scheduled
 * time posts, after a per-member delay, and only if the channel does not
 * already hold that week's (or day's) notice — the notice's first line is the
 * de-duplication key.
 */
import {
  type CalendarEntry,
  type CalendarOccurrence,
  addDays,
  daysBetween,
  teamCalendarDTag,
} from "./teamCalendar";
import { entryWhenText } from "./teamReminders";

export const DIGEST_DOC = "digest";

export type DigestSettings = {
  /** Weekly summary of the team calendar. */
  enabled: boolean;
  channelId: string | null;
  /** 0 = Sunday … 6 = Saturday (local time), like Date#getDay. */
  weekday: number;
  /** Local hour, 0–23. */
  hour: number;
  /** Morning notice "today's entries" to each entry's notice channel. */
  daily: boolean;
  updatedAt: number;
  updatedBy: string;
};

export const DEFAULT_DIGEST: DigestSettings = {
  enabled: false,
  channelId: null,
  weekday: 1,
  hour: 9,
  daily: false,
  updatedAt: 0,
  updatedBy: "",
};

/** Posting more than this late (e.g. app first opened on Thursday) is skipped. */
export const DIGEST_LATE_LIMIT_DAYS = 2;
/** The longest a member's app waits after the due time before posting. */
export const MAX_POST_DELAY_SECONDS = 120;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const digestDTag = (relayUrl: string) =>
  teamCalendarDTag(relayUrl, DIGEST_DOC);

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max
    ? value
    : fallback;

export function decodeDigest(content: string): DigestSettings | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.v !== 1 || typeof value.updatedAt !== "number") return null;
  return {
    enabled: value.enabled === true,
    channelId: typeof value.channelId === "string" ? value.channelId : null,
    weekday: clampInt(value.weekday, 0, 6, DEFAULT_DIGEST.weekday),
    hour: clampInt(value.hour, 0, 23, DEFAULT_DIGEST.hour),
    daily: value.daily === true,
    updatedAt: value.updatedAt,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : "",
  };
}

export const encodeDigest = (settings: DigestSettings) =>
  JSON.stringify({ v: 1, ...settings });

/** The newest settings (ties broken by author so every app picks the same). */
export function latestDigest(
  candidates: Array<DigestSettings | null>,
): DigestSettings {
  let best = DEFAULT_DIGEST;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (
      candidate.updatedAt > best.updatedAt ||
      (candidate.updatedAt === best.updatedAt &&
        candidate.updatedBy > best.updatedBy)
    )
      best = candidate;
  }
  return best;
}

const weekdayOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day).getDay();
};

/** Monday of the week containing `date`. */
export const weekStartOf = (date: string) =>
  addDays(date, -((weekdayOf(date) + 6) % 7));

const shortDay = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day} ${WEEKDAYS[weekdayOf(date)]}`;
};

/** First line of a weekly digest — also how an existing one is recognised. */
export const digestHeader = (weekStart: string) =>
  `📅 이번 주 팀 일정 (${shortDay(weekStart)} ~ ${shortDay(addDays(weekStart, 6))})`;

/** First line of a same-day notice. */
export const dailyHeader = (date: string) => `📌 오늘 일정 (${shortDay(date)})`;

const localMs = (date: string, hour: number) => {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day, hour, 0, 0).getTime();
};

/**
 * The week whose digest is due at `nowMs` (its Monday), or null. Due from the
 * scheduled weekday/hour of that week until DIGEST_LATE_LIMIT_DAYS later.
 */
export function dueDigestWeek(
  settings: DigestSettings,
  today: string,
  nowMs: number,
): string | null {
  if (!settings.enabled || !settings.channelId) return null;
  const weekStart = weekStartOf(today);
  const scheduledDay = addDays(weekStart, (settings.weekday + 6) % 7);
  const dueMs = localMs(scheduledDay, settings.hour);
  if (nowMs < dueMs) return null;
  if (daysBetween(scheduledDay, today) > DIGEST_LATE_LIMIT_DAYS) return null;
  return weekStart;
}

/** True once the same-day notices for `today` are due (same hour, same day). */
export const dailyNoticesDue = (
  settings: DigestSettings,
  today: string,
  nowMs: number,
) => settings.daily && nowMs >= localMs(today, settings.hour);

/** A stable per-member delay so not every running app posts at once. */
export function postDelaySeconds(pubkey: string): number {
  let hash = 0;
  for (const char of pubkey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % MAX_POST_DELAY_SECONDS;
}

const startsOn = (entry: CalendarOccurrence, from: string) =>
  entry.date < from ? from : entry.date;

const lineOf = (
  entry: CalendarOccurrence,
  nameOf: (pubkey: string) => string,
) => {
  const end = entry.endDate ?? entry.date;
  const when =
    end !== entry.date
      ? `${entry.time ?? ""}${entry.time ? " " : ""}~${shortDay(end)}${entry.endTime ? ` ${entry.endTime}` : ""}`
      : entry.time
        ? `${entry.time}${entry.endTime ? `~${entry.endTime}` : ""}`
        : "하루 종일";
  const who = entry.attendees?.length
    ? ` (${entry.attendees.map(nameOf).join(", ")})`
    : "";
  return `- ${when} ${entry.title}${who}`;
};

const byStart = (a: CalendarOccurrence, b: CalendarOccurrence) =>
  `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`);

const live = (entries: CalendarOccurrence[]) =>
  entries.filter((entry) => !entry.deleted);

/** The weekly digest text for the Monday `weekStart`. */
export function digestText(
  occurrences: CalendarOccurrence[],
  weekStart: string,
  nameOf: (pubkey: string) => string,
): string {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = live(occurrences)
    .filter(
      (entry) =>
        entry.date <= weekEnd && (entry.endDate ?? entry.date) >= weekStart,
    )
    .sort(byStart);
  const lines = [digestHeader(weekStart)];
  if (inWeek.length === 0) {
    lines.push("이번 주에 등록된 일정이 없습니다.");
    return lines.join("\n");
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(weekStart, offset);
    const todays = inWeek.filter((entry) => startsOn(entry, weekStart) === day);
    if (todays.length === 0) continue;
    lines.push(
      "",
      `**${shortDay(day)}**`,
      ...todays.map((entry) => lineOf(entry, nameOf)),
    );
  }
  return lines.join("\n");
}

export type DailyNotice = {
  channelId: string;
  text: string;
  mentions: string[];
};

/**
 * Same-day notices: entries happening on `today` that have a notice channel,
 * one message per channel, mentioning the attendees.
 */
export function dailyNotices(
  occurrences: CalendarOccurrence[],
  today: string,
  nameOf: (pubkey: string) => string,
): DailyNotice[] {
  const byChannel = new Map<string, CalendarOccurrence[]>();
  for (const entry of live(occurrences)) {
    const channelId = entry.notify?.channelId;
    if (!channelId) continue;
    if (entry.date > today || (entry.endDate ?? entry.date) < today) continue;
    byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), entry]);
  }
  return [...byChannel.entries()].map(([channelId, entries]) => {
    const sorted = entries.sort(byStart);
    const mentions = [
      ...new Set(sorted.flatMap((entry) => entry.attendees ?? [])),
    ];
    const lines = [dailyHeader(today)];
    for (const entry of sorted) {
      lines.push(`- ${entryWhenText(entry)} ${entry.title}`);
      const who = (entry.attendees ?? []).map((pubkey) => `@${nameOf(pubkey)}`);
      if (who.length) lines.push(`  ${who.join(" ")}`);
    }
    return { channelId, text: lines.join("\n"), mentions };
  });
}

/** True when `messages` (recent channel posts) already hold a notice starting with `header`. */
export const alreadyPosted = (
  messages: Array<{ content: string }>,
  header: string,
) => messages.some((message) => message.content.trimStart().startsWith(header));

/** Entries of the calendar to feed the digest (helper for typing). */
export type DigestSource = CalendarEntry[];
