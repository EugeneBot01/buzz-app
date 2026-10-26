import type { CalendarEntry, CalendarMonth } from "./teamCalendar";

/**
 * Team patch: one-way copy of the team calendar into a Google Calendar.
 *
 * The app does not sign in to Google. The owner of the Google calendar
 * deploys a small Apps Script web app (`GOOGLE_APPS_SCRIPT` below) that
 * writes to their calendar, and pastes its URL and a shared secret into one
 * member's Buzz. That member's app sends every change it sees; the script
 * keeps the Buzz id → Google event id map. Settings stay on that device.
 */

/** What the script is asked to do with one entry. */
export type GoogleSyncOp =
  | {
      op: "upsert";
      id: string;
      title: string;
      date: string;
      time?: string | undefined;
      endDate?: string | undefined;
      endTime?: string | undefined;
      note?: string | undefined;
      repeat?: { every: string; until?: string | undefined } | undefined;
    }
  | { op: "delete"; id: string };

/** Entry id → `updatedAt` of the version last sent. */
export type PushedVersions = Record<string, number>;

/** Most operations sent in one request. */
export const MAX_OPS_PER_PUSH = 40;

/** The newest version of each entry across documents, deletions included. */
export function newestVersions(docs: CalendarMonth[]): CalendarEntry[] {
  const byId = new Map<string, CalendarEntry>();
  for (const doc of docs) {
    for (const entry of Object.values(doc)) {
      const current = byId.get(entry.id);
      // A moved entry leaves a deletion behind in its old month with the same
      // time as the live copy: the live copy wins the tie.
      if (
        !current ||
        entry.updatedAt > current.updatedAt ||
        (entry.updatedAt === current.updatedAt &&
          current.deleted &&
          !entry.deleted)
      )
        byId.set(entry.id, entry);
    }
  }
  return [...byId.values()];
}

/**
 * The operations that bring Google up to date with `entries`, oldest change
 * first, at most `MAX_OPS_PER_PUSH`. A deletion of an entry never sent is
 * skipped (and needs no record).
 */
export function pendingOps(
  entries: CalendarEntry[],
  pushed: PushedVersions,
): { ops: GoogleSyncOp[]; versions: PushedVersions } {
  const ops: GoogleSyncOp[] = [];
  const versions: PushedVersions = {};
  const changed = entries
    .filter((entry) => pushed[entry.id] !== entry.updatedAt)
    .filter((entry) => !entry.deleted || pushed[entry.id] !== undefined)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  for (const entry of changed.slice(0, MAX_OPS_PER_PUSH)) {
    versions[entry.id] = entry.updatedAt;
    if (entry.deleted) {
      ops.push({ op: "delete", id: entry.id });
      continue;
    }
    const op: GoogleSyncOp = {
      op: "upsert",
      id: entry.id,
      title: entry.title,
      date: entry.date,
    };
    if (entry.time) op.time = entry.time;
    if (entry.endDate) op.endDate = entry.endDate;
    if (entry.endTime) op.endTime = entry.endTime;
    if (entry.note) op.note = entry.note;
    if (entry.repeat) op.repeat = { ...entry.repeat };
    ops.push(op);
  }
  return { ops, versions };
}

/** Parses the stored record of sent versions; anything malformed is dropped. */
export function parsePushed(raw: string | null): PushedVersions {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return {};
    const result: PushedVersions = {};
    for (const [id, at] of Object.entries(value as Record<string, unknown>))
      if (typeof at === "number" && Number.isFinite(at)) result[id] = at;
    return result;
  } catch {
    return {};
  }
}

/** True for the URL of a deployed Apps Script web app. */
export function isAppsScriptUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
    url.trim(),
  );
}

/**
 * The Apps Script the calendar owner deploys (Extensions → Apps Script in a
 * Google account that can edit the shared calendar; Deploy → New deployment →
 * Web app, execute as "Me", access "Anyone"). `CALENDAR_ID` and `SECRET` are
 * filled in by the owner; the same secret goes into Buzz.
 */
export const GOOGLE_APPS_SCRIPT = `const CALENDAR_ID = "여기에_캘린더_ID@group.calendar.google.com";
const SECRET = "여기에_비밀문구";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return reply({ ok: false, error: "secret" });
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const map = PropertiesService.getScriptProperties();
  const done = [];
  for (const op of body.ops || []) {
    const key = "buzz:" + op.id;
    const old = map.getProperty(key);
    if (old) {
      try {
        const series = calendar.getEventSeriesById(old);
        if (series) series.deleteEventSeries();
      } catch (err) {}
      map.deleteProperty(key);
    }
    if (op.op === "upsert") {
      const made = create(calendar, op);
      map.setProperty(key, made.getId());
    }
    done.push(op.id);
  }
  return reply({ ok: true, done: done });
}

function create(calendar, op) {
  const description = (op.note || "") + "\\n\\n(Buzz 팀 캘린더에서 자동 추가)";
  const options = { description: description.trim() };
  const day = (date, time) => {
    const [y, m, d] = date.split("-").map(Number);
    const [h, mi] = (time || "00:00").split(":").map(Number);
    return new Date(y, m - 1, d, h, mi);
  };
  const end = op.endDate || op.date;
  const rule = recurrence(op.repeat);
  if (!op.time) {
    const start = day(op.date);
    const last = day(end);
    last.setDate(last.getDate() + 1);
    if (rule) return calendar.createAllDayEventSeries(op.title, start, rule, options);
    return calendar.createAllDayEvent(op.title, start, last, options);
  }
  const start = day(op.date, op.time);
  const stop = op.endTime ? day(end, op.endTime) : new Date(day(end, op.time).getTime() + 60 * 60 * 1000);
  if (rule) return calendar.createEventSeries(op.title, start, stop, rule, options);
  return calendar.createEvent(op.title, start, stop, options);
}

function recurrence(repeat) {
  if (!repeat) return null;
  const rule = CalendarApp.newRecurrence();
  let r;
  if (repeat.every === "daily") r = rule.addDailyRule();
  else if (repeat.every === "weekly") r = rule.addWeeklyRule();
  else if (repeat.every === "biweekly") r = rule.addWeeklyRule().interval(2);
  else r = rule.addMonthlyRule();
  if (repeat.until) {
    const [y, m, d] = repeat.until.split("-").map(Number);
    r.until(new Date(y, m - 1, d, 23, 59));
  }
  return rule;
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
`;
