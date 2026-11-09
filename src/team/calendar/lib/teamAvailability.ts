import type { RelayEvent } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";

import { daysBetween } from "./teamCalendar";

/**
 * Member schedules (team patch): when each person of the team can or cannot
 * work, the way the team's "빈칸" scheduling page collected it. A person has
 * rules; a rule is "불가" (busy), "가능" (available) or "조율 중"
 * (tentative), on one date or on the same weekday every week of a period,
 * for the whole day or between two times.
 *
 * People are records of their own (name and role) so people who are not in
 * Buzz can be listed too; a record can be linked to a Buzz member (`pubkey`),
 * which lets that member find "내 일정" at once.
 *
 * Shared like the calendar: every member publishes their merged copy of the
 * whole list at their own `(pubkey, kind 30078, d)` coordinate and readers
 * merge them, person by person, last writer wins. Anyone in the community can
 * edit anyone's schedule (as on the page this replaces).
 */
export const TEAM_AVAILABILITY_D_TAG = "team-availability";

export const RULE_KINDS = ["busy", "available", "tentative"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  busy: "참여 불가",
  available: "참여 가능",
  tentative: "조율 중",
};
export const RULE_KIND_SHORT: Record<RuleKind, string> = {
  busy: "불가",
  available: "가능",
  tentative: "조율",
};

export const MAX_PEOPLE = 100;
export const MAX_RULES_PER_PERSON = 200;
export const MAX_EXCLUDED_DAYS = 60;
export const MAX_NAME_LENGTH = 40;
export const MAX_ROLE_LENGTH = 40;
export const MAX_RULE_TITLE_LENGTH = 120;
/** Longest period of a weekly rule, in days (about a year). */
export const MAX_RULE_DAYS = 400;
/** Relay event size ceiling, with headroom for the envelope. */
export const MAX_AVAILABILITY_CONTENT_BYTES = 60_000;

export type AvailabilityRule = {
  id: string;
  kind: RuleKind;
  /** First day the rule applies, `YYYY-MM-DD`. */
  startDate: string;
  /** Last day the rule applies (= `startDate` for a one-day rule). */
  endDate: string;
  /** 0 (Sunday) to 6: only that weekday of the period. `null` = every day. */
  weekday: number | null;
  /** Minutes after midnight, 0 to 1440 (`end` > `start`). 0~1440 = all day. */
  start: number;
  end: number;
  title: string;
  /** Days of the period the rule does not apply on. */
  exclude: string[];
};

export type TeamPerson = {
  id: string;
  name: string;
  role?: string | undefined;
  /** The Buzz member this person is. */
  pubkey?: string | undefined;
  rules: AvailabilityRule[];
  updatedAt: number;
  updatedBy: string;
  deleted?: true | undefined;
};

export type PeopleById = Record<string, TeamPerson>;

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const isPubkey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const isMinute = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 1_440;

export const isAllDay = (rule: Pick<AvailabilityRule, "start" | "end">) =>
  rule.start === 0 && rule.end === 1_440;

/** Why a rule cannot be saved (a message for the person), or `null`. */
export function validateRule(
  rule: Omit<AvailabilityRule, "id">,
): string | null {
  if (!rule.title.trim()) return "어떤 일정인지 적어 주세요.";
  if (!DATE_PATTERN.test(rule.startDate)) return "날짜를 확인해 주세요.";
  if (!DATE_PATTERN.test(rule.endDate)) return "종료 날짜를 확인해 주세요.";
  const days = daysBetween(rule.startDate, rule.endDate);
  if (days < 0) return "종료 날짜는 시작 날짜보다 빠를 수 없습니다.";
  if (days > MAX_RULE_DAYS) return "기간은 1년 이내로 정해 주세요.";
  if (rule.weekday !== null && !(rule.weekday >= 0 && rule.weekday <= 6))
    return "요일을 확인해 주세요.";
  if (!isMinute(rule.start) || !isMinute(rule.end))
    return "시간을 확인해 주세요.";
  if (rule.end <= rule.start) return "종료 시간은 시작 시간보다 늦어야 합니다.";
  return null;
}

function readRule(raw: unknown): AvailabilityRule | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id)) return null;
  if (!(RULE_KINDS as readonly unknown[]).includes(value.kind)) return null;
  if (typeof value.startDate !== "string" || typeof value.endDate !== "string")
    return null;
  const weekday =
    typeof value.weekday === "number" && Number.isInteger(value.weekday)
      ? value.weekday
      : null;
  const exclude = Array.isArray(value.exclude)
    ? [
        ...new Set(
          value.exclude.filter(
            (day): day is string =>
              typeof day === "string" && DATE_PATTERN.test(day),
          ),
        ),
      ]
        .sort()
        .slice(0, MAX_EXCLUDED_DAYS)
    : [];
  const rule: AvailabilityRule = {
    id: value.id,
    kind: value.kind as RuleKind,
    startDate: value.startDate,
    endDate: value.endDate,
    weekday,
    start: value.start as number,
    end: value.end as number,
    title: text(value.title, MAX_RULE_TITLE_LENGTH),
    exclude,
  };
  return validateRule(rule) === null ? rule : null;
}

function readPerson(id: string, raw: unknown): TeamPerson | null {
  if (!ID_PATTERN.test(id) || !raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0 ||
    !isPubkey(value.updatedBy)
  )
    return null;
  const deleted = value.deleted === true;
  const name = text(value.name, MAX_NAME_LENGTH);
  if (!deleted && !name) return null;
  const person: TeamPerson = {
    id,
    name,
    rules: [],
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
  };
  const role = text(value.role, MAX_ROLE_LENGTH);
  if (role) person.role = role;
  if (isPubkey(value.pubkey)) person.pubkey = value.pubkey;
  if (Array.isArray(value.rules)) {
    const seen = new Set<string>();
    for (const rawRule of value.rules) {
      const rule = readRule(rawRule);
      if (!rule || seen.has(rule.id)) continue;
      seen.add(rule.id);
      person.rules.push(rule);
      if (person.rules.length >= MAX_RULES_PER_PERSON) break;
    }
  }
  if (deleted) {
    person.deleted = true;
    person.rules = [];
  }
  return person;
}

export function decodePeople(content: string): PeopleById {
  let json: unknown = null;
  try {
    json = JSON.parse(content);
  } catch {
    return {};
  }
  const people = (json as { people?: unknown | undefined } | null)?.people;
  if (!people || typeof people !== "object") return {};
  const result: PeopleById = {};
  for (const [id, raw] of Object.entries(people as Record<string, unknown>)) {
    const person = readPerson(id, raw);
    if (person) result[id] = person;
    if (Object.keys(result).length >= MAX_PEOPLE * 2) break;
  }
  return result;
}

/** A rule as stored: an empty `exclude` and a `null` weekday are left out. */
function compactRule(rule: AvailabilityRule): Record<string, unknown> {
  const { exclude, weekday, ...rest } = rule;
  const out: Record<string, unknown> = rest;
  if (weekday !== null) out.weekday = weekday;
  if (exclude.length > 0) out.exclude = exclude;
  return out;
}

export function encodePeople(people: PeopleById): string {
  const out: Record<string, unknown> = {};
  for (const id of Object.keys(people).sort()) {
    const { id: _id, rules, ...rest } = people[id] as TeamPerson;
    out[id] = { ...rest, rules: rules.map(compactRule) };
  }
  return JSON.stringify({ v: 1, people: out });
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/**
 * The document to publish, or `null` when it cannot fit. The oldest deleted
 * people are dropped first to make room.
 */
export function encodePeopleForPublish(people: PeopleById): string | null {
  let content = encodePeople(people);
  if (byteLength(content) <= MAX_AVAILABILITY_CONTENT_BYTES) return content;
  const trimmed = { ...people };
  const deletions = Object.values(people)
    .filter((person) => person.deleted)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  for (const person of deletions) {
    delete trimmed[person.id];
    content = encodePeople(trimmed);
    if (byteLength(content) <= MAX_AVAILABILITY_CONTENT_BYTES) return content;
  }
  return null;
}

function personWins(candidate: TeamPerson, current: TeamPerson): boolean {
  if (candidate.updatedAt !== current.updatedAt)
    return candidate.updatedAt > current.updatedAt;
  if (candidate.updatedBy !== current.updatedBy)
    return candidate.updatedBy > current.updatedBy;
  return candidate.deleted === true && current.deleted !== true;
}

/** Merges copies person by person. Returns `base` when nothing changed. */
export function mergePeople(
  base: PeopleById,
  ...others: PeopleById[]
): PeopleById {
  let result = base;
  for (const other of others) {
    for (const [id, person] of Object.entries(other)) {
      const current = result[id];
      if (current && !personWins(person, current)) continue;
      if (result === base) result = { ...base };
      result[id] = person;
    }
  }
  return result;
}

/** True when `local` has a person (or a newer edit) that `remote` lacks. */
export function hasNewerPeople(local: PeopleById, remote: PeopleById): boolean {
  return Object.values(local).some((person) => {
    const current = remote[person.id];
    return !current || personWins(person, current);
  });
}

export function teamAvailabilityDTag(relayUrl: string): string {
  return `${TEAM_AVAILABILITY_D_TAG}:${normalizeRelayUrl(relayUrl)}`;
}

/** Every member's newest copy merged, plus this member's own copy. */
export function mergePeopleEvents(
  events: RelayEvent[],
  dTag: string,
  pubkey: string,
): { merged: PeopleById; own: PeopleById; ownCreatedAt: number } {
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
  let merged: PeopleById = {};
  let own: PeopleById = {};
  let ownCreatedAt = 0;
  for (const event of newest.values()) {
    const copy = decodePeople(event.content);
    merged = mergePeople(merged, copy);
    if (event.pubkey === pubkey) {
      own = copy;
      ownCreatedAt = event.created_at;
    }
  }
  return { merged, own, ownCreatedAt };
}

/** Live people sorted by name (Korean order). */
export function livePeople(people: PeopleById): TeamPerson[] {
  return Object.values(people)
    .filter((person) => !person.deleted)
    .sort(
      (a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id),
    );
}

const weekdayOfDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** True when `rule` applies on `date`. */
export function ruleAppliesOn(rule: AvailabilityRule, date: string): boolean {
  if (date < rule.startDate || date > rule.endDate) return false;
  if (rule.weekday !== null && weekdayOfDate(date) !== rule.weekday)
    return false;
  return !rule.exclude.includes(date);
}

/** `HH:MM` of minutes after midnight (`24:00` for 1440). */
export function minuteLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes after midnight of `HH:MM` (`24:00` allowed), or `null`. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (Number(match[2]) > 59 || minutes > 1_440) return null;
  return minutes;
}

export function ruleTimeLabel(rule: AvailabilityRule): string {
  return isAllDay(rule)
    ? "종일"
    : `${minuteLabel(rule.start)}~${minuteLabel(rule.end)}`;
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

const short = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
};

/** "매주 화요일 · 10/20~12/8 · 00:00~21:00" or "10/26 · 종일". */
export function ruleWhenLabel(rule: AvailabilityRule): string {
  const parts: string[] = [];
  if (rule.weekday !== null) {
    parts.push(`매주 ${WEEKDAY_NAMES[rule.weekday]}요일`);
    parts.push(
      rule.startDate === rule.endDate
        ? short(rule.startDate)
        : `${short(rule.startDate)}~${short(rule.endDate)}`,
    );
  } else {
    parts.push(
      rule.startDate === rule.endDate
        ? short(rule.startDate)
        : `${short(rule.startDate)}~${short(rule.endDate)} 매일`,
    );
  }
  parts.push(ruleTimeLabel(rule));
  if (rule.exclude.length > 0)
    parts.push(`제외 ${rule.exclude.map(short).join(", ")}`);
  return parts.join(" · ");
}

export type DayAvailability = {
  person: TeamPerson;
  rules: AvailabilityRule[];
  /** The worst status of the day: any busy rule, else tentative, else available. */
  status: RuleKind;
  /** A busy rule covers the whole day. */
  allDayBusy: boolean;
};

/** Who has something on `date`, busiest first, then by name. */
export function availabilityOn(
  people: TeamPerson[],
  date: string,
): DayAvailability[] {
  const order: Record<RuleKind, number> = {
    busy: 0,
    tentative: 1,
    available: 2,
  };
  const result: DayAvailability[] = [];
  for (const person of people) {
    const rules = person.rules
      .filter((rule) => ruleAppliesOn(rule, date))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    if (rules.length === 0) continue;
    const status: RuleKind = rules.some((rule) => rule.kind === "busy")
      ? "busy"
      : rules.some((rule) => rule.kind === "tentative")
        ? "tentative"
        : "available";
    result.push({
      person,
      rules,
      status,
      allDayBusy: rules.some((rule) => rule.kind === "busy" && isAllDay(rule)),
    });
  }
  return result.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      a.person.name.localeCompare(b.person.name, "ko"),
  );
}

/**
 * How many people cannot work at all on `date` (a busy rule for the whole
 * day), for the badge on a day. Partly busy days are listed in the day panel.
 */
export function busyCountOn(people: TeamPerson[], date: string): number {
  return people.filter((person) =>
    person.rules.some(
      (rule) =>
        rule.kind === "busy" && isAllDay(rule) && ruleAppliesOn(rule, date),
    ),
  ).length;
}
