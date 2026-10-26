import type { RelayEvent } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";

/**
 * Team calendar (team patch): one calendar every member of a community sees
 * and any member can edit.
 *
 * Same sharing model as team sections: nobody can overwrite another member's
 * event, so each member publishes their merged copy of a month as a plaintext
 * kind 30078 event at their own `(pubkey, d)` coordinate, and readers merge
 * every member's copy. An entry is last-writer-wins as a whole (`updatedAt`,
 * then `updatedBy`); a deletion is an entry with `deleted: true` so it also
 * wins over older copies.
 *
 * The `d` tag names the community (relay URL) and the month, so a calendar
 * never shows up in another community on a shared host and one busy month
 * cannot push the whole calendar over the relay's event size limit.
 */
export const TEAM_CALENDAR_D_TAG = "team-calendar";

/** Most member events merged per read. */
export const MAX_TEAM_CALENDAR_AUTHORS = 200;
/** Relay event size ceiling, with headroom for the envelope. */
export const MAX_TEAM_CALENDAR_CONTENT_BYTES = 60_000;

export const MAX_TITLE_LENGTH = 120;
export const MAX_NOTE_LENGTH = 1_000;

/**
 * Longest entry, in days. An entry is stored in the month it starts in and the
 * calendar reads the month before and after the visible one, so a span this
 * short can never start outside what is read (a 28-day span that starts in
 * month M-2 ends before month M begins).
 */
export const MAX_SPAN_DAYS = 28;

/** Bar colors an entry can have. No color is the default look. */
export const CALENDAR_COLORS = [
  "red",
  "orange",
  "green",
  "blue",
  "purple",
  "pink",
  "gray",
  "yellow",
  "lime",
  "teal",
  "cyan",
  "indigo",
  "brown",
] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

const isCalendarColor = (value: unknown): value is CalendarColor =>
  typeof value === "string" &&
  (CALENDAR_COLORS as readonly string[]).includes(value);

/** Minutes before the start a channel can be reminded at. */
export const NOTIFY_BEFORE_CHOICES = [10, 30, 60, 180, 1_440] as const;

/**
 * A channel that hears about an entry. `before` (minutes) asks for a reminder
 * message in that channel ahead of the start; it is posted by the app of the
 * member who last saved the entry (`updatedBy`), while that app is running.
 */
export type CalendarNotify = { channelId: string; before?: number | undefined };

function readNotify(raw: unknown): CalendarNotify | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.channelId !== "string" ||
    value.channelId.length === 0 ||
    value.channelId.length > 64
  )
    return null;
  const notify: CalendarNotify = { channelId: value.channelId };
  if ((NOTIFY_BEFORE_CHOICES as readonly unknown[]).includes(value.before))
    notify.before = value.before as number;
  return notify;
}

/** How often a repeating entry comes back. */
export const REPEAT_CHOICES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
] as const;
export type RepeatEvery = (typeof REPEAT_CHOICES)[number];
export type CalendarRepeat = {
  every: RepeatEvery;
  /** Last day an occurrence may start on, `YYYY-MM-DD`; absent = no end. */
  until?: string | undefined;
};

/**
 * The document repeating entries live in. A repeating entry shows in every
 * month, so it cannot be stored in the month it starts in.
 */
export const REPEAT_DOC = "repeat";
/** Most members listed on one entry, and most skipped days of a series. */
export const MAX_ATTENDEES = 200;
export const MAX_SKIPPED_DAYS = 200;

export type CalendarEntry = {
  id: string;
  title: string;
  /** Local start date, `YYYY-MM-DD`. */
  date: string;
  /** Optional local start time, `HH:MM` (24h). */
  time?: string | undefined;
  /** Last day of a multi-day entry, `YYYY-MM-DD`; absent for a one-day entry. */
  endDate?: string | undefined;
  /** Optional local end time on the last day, `HH:MM`; needs `time`. */
  endTime?: string | undefined;
  color?: CalendarColor | undefined;
  note?: string | undefined;
  /** Pubkeys of the members this entry is for; absent = the whole team. */
  attendees?: string[] | undefined;
  /** Set on a repeating entry (stored in the `REPEAT_DOC` document). */
  repeat?: CalendarRepeat | undefined;
  /** Start days of occurrences removed from a repeating entry. */
  skip?: string[] | undefined;
  /** Id of the chat message this entry was made from. */
  sourceEventId?: string | undefined;
  /** A channel that is told about this entry (see `CalendarNotify`). */
  notify?: CalendarNotify | undefined;
  /** Milliseconds since epoch of the last edit. */
  updatedAt: number;
  /** Pubkey of the member who made the last edit. */
  updatedBy: string;
  deleted?: true | undefined;
};

/** Every entry of one month by id, deletions included. */
export type CalendarMonth = Record<string, CalendarEntry>;

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM` for a year and a 1-based month. */
export const monthKey = (year: number, month: number) =>
  `${year}-${pad(month)}`;

/** `YYYY-MM-DD` for a year, a 1-based month and a day. */
export const dateKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** The month (`YYYY-MM`) a `YYYY-MM-DD` date falls in. */
export const monthOfDate = (date: string) => date.slice(0, 7);

/** Local today as `YYYY-MM-DD`. */
export function todayKey(now: Date = new Date()): string {
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const dayNumber = (date: string) => {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // UTC so a daylight-saving change never makes a day 23 or 25 hours long.
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) =>
  dayNumber(to) - dayNumber(from);

/** The date `count` days after (or, when negative, before) `date`. */
export function addDays(date: string, count: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(Date.UTC(year, month - 1, day + count));
  return dateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** The last day of an entry (its start day for a one-day entry). */
export const entryEndDate = (entry: CalendarEntry) =>
  entry.endDate ?? entry.date;

/** The months a month view reads: the one before, the month itself, the next. */
export const monthsAround = (month: string) =>
  [shiftMonth(month, -1), month, shiftMonth(month, 1)] as const;

/** The month before (`step = -1`) or after (`step = 1`) a `YYYY-MM` key. */
export function shiftMonth(month: string, step: number): string {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (value - 1) + step;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

/**
 * The 42 day cells (6 weeks, Sunday first) of a month grid. Days outside the
 * month are included so every row is full.
 */
export function monthGrid(
  month: string,
): Array<{ date: string; day: number; inMonth: boolean }> {
  const [year, value] = month.split("-").map(Number) as [number, number];
  const first = new Date(year, value - 1, 1);
  const cells: Array<{ date: string; day: number; inMonth: boolean }> = [];
  for (let offset = 0; offset < 42; offset++) {
    const cell = new Date(year, value - 1, 1 - first.getDay() + offset);
    cells.push({
      date: dateKey(cell.getFullYear(), cell.getMonth() + 1, cell.getDate()),
      day: cell.getDate(),
      inMonth: cell.getMonth() === value - 1,
    });
  }
  return cells;
}

/** The document an entry is stored in: its start month, or `REPEAT_DOC`. */
export const docOfEntry = (entry: {
  date: string;
  repeat?: CalendarRepeat | undefined;
}) => (entry.repeat ? REPEAT_DOC : monthOfDate(entry.date));

const isDocKey = (key: string) => key === REPEAT_DOC || MONTH_PATTERN.test(key);

/** True when the entry is for `pubkey` (an entry without a list is for all). */
export const isAttendee = (entry: CalendarEntry, pubkey: string) =>
  !entry.attendees || entry.attendees.includes(pubkey);

/** The `d` tag of one community's calendar for one month (or `REPEAT_DOC`). */
export function teamCalendarDTag(relayUrl: string, month: string): string {
  return `${TEAM_CALENDAR_D_TAG}:${normalizeRelayUrl(relayUrl)}:${month}`;
}

const isPubkey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function readRepeat(raw: unknown, start: string): CalendarRepeat | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!(REPEAT_CHOICES as readonly unknown[]).includes(value.every))
    return null;
  const repeat: CalendarRepeat = { every: value.every as RepeatEvery };
  if (
    typeof value.until === "string" &&
    DATE_PATTERN.test(value.until) &&
    value.until >= start
  )
    repeat.until = value.until;
  return repeat;
}

/** A stored entry if it is well-formed and belongs to `month`, else `null`. */
function readEntry(
  id: string,
  raw: unknown,
  month: string,
): CalendarEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (id.length === 0 || id.length > 64) return null;
  if (typeof value.date !== "string" || !DATE_PATTERN.test(value.date))
    return null;
  if (month !== REPEAT_DOC && monthOfDate(value.date) !== month) return null;
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0
  )
    return null;
  if (!isPubkey(value.updatedBy)) return null;
  const title =
    typeof value.title === "string"
      ? value.title.trim().slice(0, MAX_TITLE_LENGTH)
      : "";
  const deleted = value.deleted === true;
  if (!deleted && title.length === 0) return null;
  const entry: CalendarEntry = {
    id,
    title,
    date: value.date,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
  };
  if (typeof value.time === "string" && TIME_PATTERN.test(value.time))
    entry.time = value.time;
  // A bad range is dropped, not the entry: it still shows on its start day.
  if (
    typeof value.endDate === "string" &&
    DATE_PATTERN.test(value.endDate) &&
    daysBetween(value.date, value.endDate) > 0 &&
    daysBetween(value.date, value.endDate) < MAX_SPAN_DAYS
  ) {
    entry.endDate = value.endDate;
  }
  if (
    entry.time &&
    typeof value.endTime === "string" &&
    TIME_PATTERN.test(value.endTime)
  )
    entry.endTime = value.endTime;
  if (isCalendarColor(value.color)) entry.color = value.color;
  if (typeof value.note === "string" && value.note.trim().length > 0)
    entry.note = value.note.trim().slice(0, MAX_NOTE_LENGTH);
  if (Array.isArray(value.attendees)) {
    const attendees = [...new Set(value.attendees.filter(isPubkey))];
    // An empty list would be an entry for nobody; treat it as the whole team.
    if (attendees.length > 0)
      entry.attendees = attendees.slice(0, MAX_ATTENDEES).sort();
  }
  if (month === REPEAT_DOC) {
    const repeat = readRepeat(value.repeat, value.date);
    // A live entry in the repeat document must repeat.
    if (!repeat && !deleted) return null;
    if (repeat) entry.repeat = repeat;
    if (Array.isArray(value.skip)) {
      const skip = [
        ...new Set(
          value.skip.filter(
            (day): day is string =>
              typeof day === "string" && DATE_PATTERN.test(day),
          ),
        ),
      ];
      if (skip.length > 0) entry.skip = skip.sort().slice(-MAX_SKIPPED_DAYS);
    }
  }
  const notify = readNotify(value.notify);
  if (notify) entry.notify = notify;
  if (
    typeof value.sourceEventId === "string" &&
    /^[0-9a-f]{64}$/.test(value.sourceEventId)
  )
    entry.sourceEventId = value.sourceEventId;
  if (deleted) entry.deleted = true;
  return entry;
}

/** Parses one member's month document. Malformed entries are skipped. */
export function decodeMonth(content: string, month: string): CalendarMonth {
  if (!isDocKey(month)) return {};
  let json: unknown = null;
  try {
    json = JSON.parse(content);
  } catch {
    return {};
  }
  if (!json || typeof json !== "object") return {};
  const entries = (json as { entries?: unknown | undefined }).entries;
  if (!entries || typeof entries !== "object") return {};
  const result: CalendarMonth = {};
  for (const [id, raw] of Object.entries(entries as Record<string, unknown>)) {
    const entry = readEntry(id, raw, month);
    if (entry) result[id] = entry;
  }
  return result;
}

export function encodeMonth(month: CalendarMonth): string {
  const entries: Record<string, Omit<CalendarEntry, "id">> = {};
  for (const id of Object.keys(month).sort()) {
    const { id: _id, ...rest } = month[id] as CalendarEntry;
    entries[id] = rest;
  }
  return JSON.stringify({ v: 1, entries });
}

/** How many of the range and color fields an entry carries. */
const richness = (entry: CalendarEntry) =>
  (entry.endDate ? 1 : 0) +
  (entry.endTime ? 1 : 0) +
  (entry.color ? 1 : 0) +
  (entry.attendees ? 1 : 0) +
  (entry.sourceEventId ? 1 : 0) +
  (entry.notify ? 1 : 0);

/**
 * True when `candidate` replaces `current` (later edit, then higher pubkey).
 * For the very same edit, the copy that kept the range and color wins: an app
 * from before those fields existed republishes entries without them, and its
 * copy must not hide the real one.
 */
function wins(candidate: CalendarEntry, current: CalendarEntry): boolean {
  if (candidate.updatedAt !== current.updatedAt)
    return candidate.updatedAt > current.updatedAt;
  if (candidate.updatedBy !== current.updatedBy)
    return candidate.updatedBy > current.updatedBy;
  if (candidate.deleted !== current.deleted)
    return candidate.deleted === true && current.deleted !== true;
  return richness(candidate) > richness(current);
}

/** Merges month copies entry by entry. Returns `base` when nothing changed. */
export function mergeMonths(
  base: CalendarMonth,
  ...others: CalendarMonth[]
): CalendarMonth {
  let result = base;
  for (const other of others) {
    for (const [id, entry] of Object.entries(other)) {
      const current = result[id];
      if (current && !wins(entry, current)) continue;
      if (result === base) result = { ...base };
      result[id] = entry;
    }
  }
  return result;
}

/** True when `local` holds an entry (or a newer edit) that `remote` lacks. */
export function hasNewerEntries(
  local: CalendarMonth,
  remote: CalendarMonth,
): boolean {
  return Object.values(local).some((entry) => {
    const current = remote[entry.id];
    return !current || wins(entry, current);
  });
}

const byDisplayOrder = (a: CalendarEntry, b: CalendarEntry) =>
  a.date.localeCompare(b.date) ||
  (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
  a.title.localeCompare(b.title) ||
  a.id.localeCompare(b.id);

/** Live entries, ordered by date, then timed before all-day by time, then title. */
export function liveEntries(month: CalendarMonth): CalendarEntry[] {
  return Object.values(month)
    .filter((entry) => !entry.deleted)
    .sort(byDisplayOrder);
}

/**
 * Live entries of several months as one list. An entry that was moved to
 * another month leaves a deletion behind in the old one, so months are not
 * merged by id (the deletion would hide the moved entry); deletions are just
 * dropped, and if an interrupted move left a live copy in both months the
 * newer one is kept.
 */
export function combineMonths(months: CalendarMonth[]): CalendarEntry[] {
  const byId = new Map<string, CalendarEntry>();
  for (const month of months) {
    for (const entry of Object.values(month)) {
      if (entry.deleted) continue;
      const current = byId.get(entry.id);
      if (!current || entry.updatedAt > current.updatedAt)
        byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort(byDisplayOrder);
}

/**
 * One showing of an entry. For a repeating entry `date`/`endDate` are those of
 * this occurrence and `seriesDate` is the day the series itself starts.
 */
export type CalendarOccurrence = CalendarEntry & {
  seriesDate?: string | undefined;
};

/** A stable key for one occurrence (an entry id repeats across occurrences). */
export const occurrenceKey = (entry: CalendarOccurrence) =>
  `${entry.id}@${entry.date}`;

/** The start day of occurrence `index` (0 = the series start), or `null`. */
function occurrenceStart(
  start: string,
  every: RepeatEvery,
  index: number,
): string | null {
  if (every === "daily") return addDays(start, index);
  if (every === "weekly") return addDays(start, index * 7);
  if (every === "biweekly") return addDays(start, index * 14);
  const [year, month, day] = start.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const target = shiftMonth(monthKey(year, month), index);
  const date = `${target}-${pad(day)}`;
  // A month without that day (the 31st in a 30-day month) has no occurrence.
  return addDays(date, 0) === date ? date : null;
}

/**
 * `entries` with every repeating entry replaced by its occurrences that touch
 * `from`..`to` (inclusive). One-off entries are passed through.
 */
export function expandRepeats(
  entries: CalendarEntry[],
  from: string,
  to: string,
): CalendarOccurrence[] {
  const result: CalendarOccurrence[] = [];
  for (const entry of entries) {
    if (!entry.repeat) {
      result.push(entry);
      continue;
    }
    const span = daysBetween(entry.date, entryEndDate(entry));
    const last =
      entry.repeat.until && entry.repeat.until < to ? entry.repeat.until : to;
    const step = { daily: 1, weekly: 7, biweekly: 14, monthly: 31 }[
      entry.repeat.every
    ];
    // Skip ahead to just before the window instead of walking from the start.
    let index = Math.max(
      0,
      Math.floor((daysBetween(entry.date, from) - span) / step) - 1,
    );
    // Bounded: a window is a few months at most.
    for (let guard = 0; guard < 500; guard++, index++) {
      const start = occurrenceStart(entry.date, entry.repeat.every, index);
      if (start === null) continue;
      if (start > last) break;
      if (addDays(start, span) < from) continue;
      if (entry.skip?.includes(start)) continue;
      const occurrence: CalendarOccurrence = {
        ...entry,
        date: start,
        seriesDate: entry.date,
      };
      if (entry.endDate) occurrence.endDate = addDays(start, span);
      result.push(occurrence);
    }
  }
  return result.sort(byDisplayOrder);
}

/** The entries that cover `date`, from the first day to the last. */
export function entriesOnDate<T extends CalendarEntry>(
  entries: T[],
  date: string,
): T[] {
  return entries.filter(
    (entry) => entry.date <= date && date <= entryEndDate(entry),
  );
}

/** One entry's bar within one week row of the month grid. */
export type WeekSegment<T extends CalendarEntry = CalendarEntry> = {
  entry: T;
  /** Column of the first day shown in this week, 0 (Sunday) to 6. */
  startColumn: number;
  /** Days shown in this week. */
  span: number;
  /** The entry started in an earlier week. */
  continuesBefore: boolean;
  /** The entry goes on into a later week. */
  continuesAfter: boolean;
  /** Row of the bar under the day numbers, 0 first. */
  lane: number;
};

/**
 * The bars of one week (`week` is its seven dates, Sunday first). Longer and
 * earlier-starting entries get the upper lanes, and a bar takes the first lane
 * that is free for all its days.
 */
export function weekSegments<T extends CalendarEntry>(
  entries: T[],
  week: string[],
): WeekSegment<T>[] {
  const first = week[0] as string;
  const last = week[6] as string;
  const segments: Omit<WeekSegment<T>, "lane">[] = [];
  for (const entry of entries) {
    const end = entryEndDate(entry);
    if (end < first || entry.date > last) continue;
    const startColumn = Math.max(0, daysBetween(first, entry.date));
    const endColumn = Math.min(6, daysBetween(first, end));
    segments.push({
      entry,
      startColumn,
      span: endColumn - startColumn + 1,
      continuesBefore: entry.date < first,
      continuesAfter: end > last,
    });
  }
  segments.sort(
    (a, b) =>
      a.startColumn - b.startColumn ||
      b.span - a.span ||
      byDisplayOrder(a.entry, b.entry),
  );
  const laneEnds: number[] = [];
  return segments.map((segment) => {
    let lane = laneEnds.findIndex((end) => end < segment.startColumn);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.startColumn + segment.span - 1;
    return { ...segment, lane };
  });
}

/** The fields of an entry that decide when it starts and ends. */
export type CalendarRangeInput = {
  date: string;
  time?: string | undefined;
  endDate?: string | undefined;
  endTime?: string | undefined;
  repeat?: CalendarRepeat | undefined;
};

/** Shortest gap between two occurrences, in days. */
const REPEAT_GAP_DAYS: Record<RepeatEvery, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 28,
};

/** Why `range` cannot be saved (a message for the person), or `null`. */
export function validateRange(range: CalendarRangeInput): string | null {
  if (!DATE_PATTERN.test(range.date)) return "시작 날짜를 확인해 주세요.";
  const endDate = range.endDate || range.date;
  if (!DATE_PATTERN.test(endDate)) return "종료 날짜를 확인해 주세요.";
  const span = daysBetween(range.date, endDate);
  if (span < 0) return "종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
  if (span >= MAX_SPAN_DAYS)
    return `일정은 최대 ${MAX_SPAN_DAYS}일까지 잡을 수 있습니다.`;
  if (range.endTime && !range.time)
    return "종료 시간을 정하려면 시작 시간도 정해 주세요.";
  if (span === 0 && range.time && range.endTime && range.endTime <= range.time)
    return "종료 시간은 시작 시간보다 늦어야 합니다.";
  if (range.repeat) {
    if (span >= REPEAT_GAP_DAYS[range.repeat.every])
      return "반복 간격보다 긴 일정은 반복할 수 없습니다.";
    if (range.repeat.until && range.repeat.until < range.date)
      return "반복 종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
  }
  return null;
}

/** Live entries of one month grouped by `YYYY-MM-DD`. */
export function entriesByDate(
  month: CalendarMonth,
): Record<string, CalendarEntry[]> {
  const grouped: Record<string, CalendarEntry[]> = {};
  for (const entry of liveEntries(month)) {
    const list = grouped[entry.date];
    if (list) list.push(entry);
    else grouped[entry.date] = [entry];
  }
  return grouped;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * The document to publish for a month, or `null` when it cannot fit the
 * relay's size limit. Deletions are kept (they are what stops an older copy
 * from bringing an entry back); only when the month is over the limit are the
 * oldest deletions dropped to make room.
 */
export function encodeForPublish(month: CalendarMonth): string | null {
  let content = encodeMonth(month);
  if (byteLength(content) <= MAX_TEAM_CALENDAR_CONTENT_BYTES) return content;
  const trimmed: CalendarMonth = { ...month };
  const deletions = Object.values(month)
    .filter((entry) => entry.deleted)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  for (const entry of deletions) {
    delete trimmed[entry.id];
    content = encodeMonth(trimmed);
    if (byteLength(content) <= MAX_TEAM_CALENDAR_CONTENT_BYTES) return content;
  }
  return null;
}

/**
 * Every member's newest event for one month merged into one copy, plus the
 * `created_at` of `pubkey`'s own event (0 when they have none) so the next
 * publish can replace it.
 */
export function mergeMonthEvents(
  events: RelayEvent[],
  dTag: string,
  month: string,
  pubkey: string,
): { merged: CalendarMonth; ownCreatedAt: number; own: CalendarMonth } {
  const newest = new Map<string, RelayEvent>();
  for (const event of events) {
    const d = event.tags.filter((tag) => tag[0] === "d");
    if (d.length !== 1 || d[0]?.[1] !== dTag) continue;
    const current = newest.get(event.pubkey);
    // The relay's replaceable winner: later `created_at`, then lower id.
    if (
      current &&
      !(
        event.created_at > current.created_at ||
        (event.created_at === current.created_at && event.id < current.id)
      )
    )
      continue;
    newest.set(event.pubkey, event);
  }
  let merged: CalendarMonth = {};
  let own: CalendarMonth = {};
  let ownCreatedAt = 0;
  for (const event of newest.values()) {
    const copy = decodeMonth(event.content, month);
    merged = mergeMonths(merged, copy);
    if (event.pubkey === pubkey) {
      own = copy;
      ownCreatedAt = event.created_at;
    }
  }
  return { merged, ownCreatedAt, own };
}
