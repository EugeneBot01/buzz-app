import type { RelayEvent } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";
import { addDays, daysBetween } from "./teamCalendar";

/**
 * Meeting-date polls (team patch): someone proposes a span of days (and,
 * optionally, hours), every member ticks when they can make it, and the days
 * most people can make are counted.
 *
 * Same sharing model as the calendar: each member publishes one plaintext
 * kind 30078 event. It carries their merged copy of the poll definitions
 * (last-writer-wins, like calendar entries) and their own answers. An answer
 * is only ever read from its author's event, so nobody can answer for
 * someone else.
 */
export const TEAM_POLLS_D_TAG = "team-calendar-polls";

export const MAX_POLL_TITLE_LENGTH = 120;
/** Longest span of a poll, in days (date-only, and with hours). */
export const MAX_POLL_DAYS = 31;
export const MAX_SLOT_POLL_DAYS = 14;
/** A finished poll is dropped from published copies this long after its end. */
export const POLL_KEEP_DAYS = 30;
export const MAX_TEAM_POLLS_CONTENT_BYTES = 60_000;

export type DatePoll = {
  id: string;
  title: string;
  /** First and last candidate day, `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  /** Hours of the day to choose from (`from` inclusive, `to` exclusive). */
  hours?: { from: number; to: number } | undefined;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  deleted?: true | undefined;
};

export type PollAnswer = {
  /** Options the member can make (see `pollOptions`). */
  choices: string[];
  updatedAt: number;
};

export type PollDoc = {
  polls: Record<string, DatePoll>;
  /** This member's own answers by poll id. */
  answers: Record<string, PollAnswer>;
};

export const emptyPollDoc = (): PollDoc => ({ polls: {}, answers: {} });

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const OPTION_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]))?$/;
const isPubkey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isHour = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

export function teamPollsDTag(relayUrl: string): string {
  return `${TEAM_POLLS_D_TAG}:${normalizeRelayUrl(relayUrl)}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The option key of one hour of one day. */
export const slotKey = (date: string, hour: number) => `${date}T${pad(hour)}`;

/** The candidate days of a poll, first to last. */
export function pollDates(poll: DatePoll): string[] {
  const dates: string[] = [];
  const days = daysBetween(poll.startDate, poll.endDate);
  for (let offset = 0; offset <= days; offset++)
    dates.push(addDays(poll.startDate, offset));
  return dates;
}

/** The hours of a poll with hours (empty for a date-only poll). */
export function pollHours(poll: DatePoll): number[] {
  if (!poll.hours) return [];
  const hours: number[] = [];
  for (let hour = poll.hours.from; hour < poll.hours.to; hour++)
    hours.push(hour);
  return hours;
}

/** Everything a member can tick: days, or day-hours for a poll with hours. */
export function pollOptions(poll: DatePoll): string[] {
  const hours = pollHours(poll);
  const dates = pollDates(poll);
  if (hours.length === 0) return dates;
  return dates.flatMap((date) => hours.map((hour) => slotKey(date, hour)));
}

export type PollInput = {
  title: string;
  startDate: string;
  endDate: string;
  hours?: { from: number; to: number } | undefined;
};

/** Why a poll cannot be saved (a message for the person), or `null`. */
export function validatePoll(input: PollInput): string | null {
  if (input.title.trim().length === 0) return "투표 제목을 적어 주세요.";
  if (!DATE_PATTERN.test(input.startDate)) return "시작 날짜를 확인해 주세요.";
  if (!DATE_PATTERN.test(input.endDate)) return "종료 날짜를 확인해 주세요.";
  const span = daysBetween(input.startDate, input.endDate);
  if (span < 0) return "종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
  const limit = input.hours ? MAX_SLOT_POLL_DAYS : MAX_POLL_DAYS;
  if (span >= limit) return `후보 기간은 최대 ${limit}일까지 잡을 수 있습니다.`;
  if (input.hours) {
    const { from, to } = input.hours;
    if (!isHour(from) || !isHour(to) || from < 0 || to > 24 || from >= to)
      return "시간 범위를 확인해 주세요.";
  }
  return null;
}

function readPoll(id: string, raw: unknown): DatePoll | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (id.length === 0 || id.length > 64) return null;
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0
  )
    return null;
  if (!isPubkey(value.updatedBy) || !isPubkey(value.createdBy)) return null;
  if (typeof value.startDate !== "string" || typeof value.endDate !== "string")
    return null;
  const title =
    typeof value.title === "string"
      ? value.title.trim().slice(0, MAX_POLL_TITLE_LENGTH)
      : "";
  const deleted = value.deleted === true;
  const hoursRaw = value.hours as
    | { from?: unknown | undefined; to?: unknown | undefined }
    | undefined;
  const hours =
    hoursRaw && isHour(hoursRaw.from) && isHour(hoursRaw.to)
      ? { from: hoursRaw.from, to: hoursRaw.to }
      : undefined;
  const input: PollInput = {
    title: deleted ? "-" : title,
    startDate: value.startDate,
    endDate: value.endDate,
    hours,
  };
  if (validatePoll(input) !== null) return null;
  const poll: DatePoll = {
    id,
    title,
    startDate: value.startDate,
    endDate: value.endDate,
    createdBy: value.createdBy,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
  };
  if (hours) poll.hours = hours;
  if (deleted) poll.deleted = true;
  return poll;
}

function readAnswer(raw: unknown): PollAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt))
    return null;
  if (!Array.isArray(value.choices)) return null;
  const choices = [
    ...new Set(
      value.choices.filter(
        (choice): choice is string =>
          typeof choice === "string" && OPTION_PATTERN.test(choice),
      ),
    ),
  ].sort();
  return { choices, updatedAt: value.updatedAt };
}

/** Parses one member's document. Malformed parts are skipped. */
export function decodePollDoc(content: string): PollDoc {
  const doc = emptyPollDoc();
  let json: unknown = null;
  try {
    json = JSON.parse(content);
  } catch {
    return doc;
  }
  if (!json || typeof json !== "object") return doc;
  const { polls, answers } = json as {
    polls?: unknown | undefined;
    answers?: unknown | undefined;
  };
  if (polls && typeof polls === "object") {
    for (const [id, raw] of Object.entries(polls as Record<string, unknown>)) {
      const poll = readPoll(id, raw);
      if (poll) doc.polls[id] = poll;
    }
  }
  if (answers && typeof answers === "object") {
    for (const [id, raw] of Object.entries(
      answers as Record<string, unknown>,
    )) {
      const answer = readAnswer(raw);
      if (answer && id.length > 0 && id.length <= 64) doc.answers[id] = answer;
    }
  }
  return doc;
}

const pollWins = (candidate: DatePoll, current: DatePoll) =>
  candidate.updatedAt !== current.updatedAt
    ? candidate.updatedAt > current.updatedAt
    : candidate.updatedBy !== current.updatedBy
      ? candidate.updatedBy > current.updatedBy
      : candidate.deleted === true && current.deleted !== true;

/** Merges poll definitions. Returns `base` when nothing changed. */
export function mergePolls(
  base: Record<string, DatePoll>,
  ...others: Record<string, DatePoll>[]
): Record<string, DatePoll> {
  let result = base;
  for (const other of others) {
    for (const [id, poll] of Object.entries(other)) {
      const current = result[id];
      if (current && !pollWins(poll, current)) continue;
      if (result === base) result = { ...base };
      result[id] = poll;
    }
  }
  return result;
}

/** Live polls, the ones that end latest first. */
export function livePolls(polls: Record<string, DatePoll>): DatePoll[] {
  return Object.values(polls)
    .filter((poll) => !poll.deleted)
    .sort(
      (a, b) =>
        b.endDate.localeCompare(a.endDate) ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    );
}

/**
 * The document to publish: polls that ended more than `POLL_KEEP_DAYS` before
 * `today` are left out together with their answers, and answers are trimmed
 * to the options the poll still has. `null` when it cannot fit.
 */
export function encodePollDoc(doc: PollDoc, today: string): string | null {
  const cutoff = addDays(today, -POLL_KEEP_DAYS);
  const polls: Record<string, Omit<DatePoll, "id">> = {};
  const answers: Record<string, PollAnswer> = {};
  for (const id of Object.keys(doc.polls).sort()) {
    const poll = doc.polls[id] as DatePoll;
    if (poll.endDate < cutoff) continue;
    const { id: _id, ...rest } = poll;
    polls[id] = rest;
    const answer = doc.answers[id];
    if (!answer || poll.deleted) continue;
    const options = new Set(pollOptions(poll));
    answers[id] = {
      choices: answer.choices.filter((choice) => options.has(choice)),
      updatedAt: answer.updatedAt,
    };
  }
  const content = JSON.stringify({ v: 1, polls, answers });
  return new TextEncoder().encode(content).length <=
    MAX_TEAM_POLLS_CONTENT_BYTES
    ? content
    : null;
}

export type PollState = {
  polls: Record<string, DatePoll>;
  /** Each member's answers by pubkey, then poll id. */
  answersByMember: Record<string, Record<string, PollAnswer>>;
};

/**
 * Every member's newest event merged: poll definitions by last-writer-wins,
 * answers kept per author. Also `pubkey`'s own `created_at` (0 when none).
 */
export function mergePollEvents(
  events: RelayEvent[],
  dTag: string,
  pubkey: string,
): PollState & { ownCreatedAt: number } {
  const newest = new Map<string, RelayEvent>();
  for (const event of events) {
    const d = event.tags.filter((tag) => tag[0] === "d");
    if (d.length !== 1 || d[0]?.[1] !== dTag) continue;
    const current = newest.get(event.pubkey);
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
  let polls: Record<string, DatePoll> = {};
  const answersByMember: Record<string, Record<string, PollAnswer>> = {};
  let ownCreatedAt = 0;
  for (const event of newest.values()) {
    const doc = decodePollDoc(event.content);
    polls = mergePolls(polls, doc.polls);
    answersByMember[event.pubkey] = doc.answers;
    if (event.pubkey === pubkey) ownCreatedAt = event.created_at;
  }
  return { polls, answersByMember, ownCreatedAt };
}

export type PollTally = {
  /** Members who can make each option. */
  byOption: Record<string, string[]>;
  /** Members who answered (even with nothing ticked). */
  voters: string[];
  /** The options most members can make (empty when nobody ticked any). */
  best: string[];
  /** How many members can make the best options. */
  bestCount: number;
};

/** Counts a poll's answers. */
export function tallyPoll(
  poll: DatePoll,
  answersByMember: Record<string, Record<string, PollAnswer>>,
): PollTally {
  const options = pollOptions(poll);
  const byOption: Record<string, string[]> = {};
  for (const option of options) byOption[option] = [];
  const voters: string[] = [];
  for (const member of Object.keys(answersByMember).sort()) {
    const answer = answersByMember[member]?.[poll.id];
    if (!answer) continue;
    voters.push(member);
    for (const choice of answer.choices) byOption[choice]?.push(member);
  }
  let bestCount = 0;
  for (const option of options)
    bestCount = Math.max(bestCount, byOption[option]?.length ?? 0);
  const best =
    bestCount === 0
      ? []
      : options.filter((option) => byOption[option]?.length === bestCount);
  return { byOption, voters, best, bestCount };
}

/** A day, or a run of hours of a day (`from` inclusive, `to` exclusive). */
export type PollRange = {
  date: string;
  from?: number | undefined;
  to?: number | undefined;
};

/**
 * Options folded into ranges: hours of the same day that follow each other
 * become one range ("14시~17시"); a date-only option is a range by itself.
 */
export function mergeOptions(options: string[]): PollRange[] {
  const ranges: PollRange[] = [];
  for (const option of [...options].sort()) {
    const [date, hourText] = option.split("T") as [string, string | undefined];
    if (hourText === undefined) {
      ranges.push({ date });
      continue;
    }
    const hour = Number(hourText);
    const last = ranges[ranges.length - 1];
    if (last && last.date === date && last.to === hour) last.to = hour + 1;
    else ranges.push({ date, from: hour, to: hour + 1 });
  }
  return ranges;
}

export type RankedRange = PollRange & { members: string[] };

/**
 * The ranges the most members can make, best first: a range is a day (or a
 * run of hours of a day) that the very same members can make. Only ranges at
 * least one member ticked are listed, at most `limit` of them.
 */
export function rankPollRanges(
  poll: DatePoll,
  tally: PollTally,
  limit = 5,
): RankedRange[] {
  const ranked: RankedRange[] = [];
  let open: RankedRange | null = null;
  for (const option of pollOptions(poll)) {
    const members = tally.byOption[option] ?? [];
    const [date, hourText] = option.split("T") as [string, string | undefined];
    const hour = hourText === undefined ? undefined : Number(hourText);
    const continues =
      open !== null &&
      hour !== undefined &&
      open.date === date &&
      open.to === hour &&
      open.members.join() === members.join();
    if (continues && open) {
      open.to = (hour as number) + 1;
      continue;
    }
    open = null;
    if (members.length === 0) continue;
    open =
      hour === undefined
        ? { date, members }
        : { date, from: hour, to: hour + 1, members };
    ranked.push(open);
  }
  return ranked
    .sort(
      (a, b) =>
        b.members.length - a.members.length ||
        // Among equals, the longer stretch is the more useful one.
        (b.to ?? 0) - (b.from ?? 0) - ((a.to ?? 0) - (a.from ?? 0)) ||
        a.date.localeCompare(b.date) ||
        (a.from ?? 0) - (b.from ?? 0),
    )
    .slice(0, limit);
}
