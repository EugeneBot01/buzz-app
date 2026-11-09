import {
  type AvailabilityRule,
  MAX_PEOPLE,
  MAX_RULES_PER_PERSON,
  RULE_KINDS,
  type RuleKind,
  type TeamPerson,
  validateRule,
} from "./teamAvailability";
import {
  CALENDAR_COLORS,
  type CalendarColor,
  type CalendarEntry,
  DEPT_KEY_PATTERN,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  REPEAT_CHOICES,
  type RepeatEvery,
  validateRange,
} from "./teamCalendar";
import { PHASE_TONES, type PhaseTone, validatePlan } from "./teamSprint";
import type { CalendarEntryInput } from "./useTeamCalendar";
import type { PersonInput, SprintPlanInput } from "./useTeamSprint";

/**
 * The file the calendar imports and backs up to (team patch). One JSON file
 * can carry the sprint board settings, calendar entries and member
 * schedules; any part may be left out.
 *
 * Ids are kept, so importing the same file twice updates what the first
 * import made instead of adding everything again.
 */
export const IMPORT_FORMAT = "buzz-team-calendar";
export const IMPORT_VERSION = 1;
/** Most entries one file may carry. */
export const MAX_IMPORT_ENTRIES = 2_000;

export type CalendarImport = {
  plan: SprintPlanInput | null;
  entries: CalendarEntryInput[];
  people: PersonInput[];
};

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const str = (value: unknown) => (typeof value === "string" ? value : "");

function fail(message: string): never {
  throw new Error(message);
}

function readImportEntry(raw: unknown, index: number): CalendarEntryInput {
  const where = `일정 ${index + 1}번째`;
  if (!raw || typeof raw !== "object") fail(`${where} 형식이 맞지 않습니다.`);
  const value = raw as Record<string, unknown>;
  const title = str(value.title).trim();
  if (!title) fail(`${where}: 제목이 없습니다.`);
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id))
    fail(`${where} (${title}): id가 없거나 형식이 맞지 않습니다.`);
  const date = str(value.date);
  if (!DATE_PATTERN.test(date))
    fail(`${where} (${title}): 날짜를 확인해 주세요.`);
  const entry: CalendarEntryInput = {
    id: value.id,
    title: title.slice(0, MAX_TITLE_LENGTH),
    date,
  };
  const endDate = str(value.endDate);
  if (endDate) entry.endDate = endDate;
  const time = str(value.time);
  if (time) {
    if (!TIME_PATTERN.test(time))
      fail(`${where} (${title}): 시간을 확인해 주세요.`);
    entry.time = time;
  }
  const endTime = str(value.endTime);
  if (endTime) {
    if (!TIME_PATTERN.test(endTime))
      fail(`${where} (${title}): 종료 시간을 확인해 주세요.`);
    entry.endTime = endTime;
  }
  if (value.color !== undefined) {
    if (!(CALENDAR_COLORS as readonly unknown[]).includes(value.color))
      fail(`${where} (${title}): 색상 "${String(value.color)}"을 모릅니다.`);
    entry.color = value.color as CalendarColor;
  }
  const note = str(value.note).trim();
  if (note) entry.note = note.slice(0, MAX_NOTE_LENGTH);
  if (value.dept !== undefined) {
    if (typeof value.dept !== "string" || !DEPT_KEY_PATTERN.test(value.dept))
      fail(`${where} (${title}): 부서 코드를 확인해 주세요.`);
    entry.dept = value.dept;
  }
  if (value.milestone === true) entry.milestone = true;
  if (value.repeat !== undefined) {
    const repeat = value.repeat as Record<string, unknown> | null;
    if (
      !repeat ||
      !(REPEAT_CHOICES as readonly unknown[]).includes(repeat.every)
    )
      fail(`${where} (${title}): 반복 설정을 확인해 주세요.`);
    entry.repeat = { every: repeat.every as RepeatEvery };
    const until = str(repeat.until);
    if (until) {
      if (!DATE_PATTERN.test(until))
        fail(`${where} (${title}): 반복 종료 날짜를 확인해 주세요.`);
      entry.repeat.until = until;
    }
  }
  const problem = validateRange(entry);
  if (problem) fail(`${where} (${title}): ${problem}`);
  return entry;
}

function readImportRule(raw: unknown, who: string, index: number) {
  const where = `${who}님의 ${index + 1}번째 일정`;
  if (!raw || typeof raw !== "object") fail(`${where} 형식이 맞지 않습니다.`);
  const value = raw as Record<string, unknown>;
  if (!(RULE_KINDS as readonly unknown[]).includes(value.kind))
    fail(`${where}: 종류(busy/available/tentative)를 확인해 주세요.`);
  const rule: AvailabilityRule = {
    id: ID_PATTERN.test(str(value.id)) ? str(value.id) : `r${index + 1}`,
    kind: value.kind as RuleKind,
    startDate: str(value.startDate),
    endDate: str(value.endDate) || str(value.startDate),
    weekday:
      typeof value.weekday === "number" && Number.isInteger(value.weekday)
        ? value.weekday
        : null,
    start: typeof value.start === "number" ? value.start : 0,
    end: typeof value.end === "number" ? value.end : 1_440,
    title: str(value.title).trim(),
    exclude: Array.isArray(value.exclude)
      ? value.exclude.filter(
          (day): day is string =>
            typeof day === "string" && DATE_PATTERN.test(day),
        )
      : [],
  };
  const problem = validateRule(rule);
  if (problem) fail(`${where} (${rule.title || "제목 없음"}): ${problem}`);
  return rule;
}

function readImportPerson(raw: unknown, index: number): PersonInput {
  const where = `팀원 ${index + 1}번째`;
  if (!raw || typeof raw !== "object") fail(`${where} 형식이 맞지 않습니다.`);
  const value = raw as Record<string, unknown>;
  const name = str(value.name).trim();
  if (!name) fail(`${where}: 이름이 없습니다.`);
  if (typeof value.id !== "string" || !ID_PATTERN.test(value.id))
    fail(`${where} (${name}): id가 없거나 형식이 맞지 않습니다.`);
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  if (rawRules.length > MAX_RULES_PER_PERSON)
    fail(`${name}님의 일정이 ${MAX_RULES_PER_PERSON}개를 넘습니다.`);
  const rules = rawRules.map((rule, ruleIndex) =>
    readImportRule(rule, name, ruleIndex),
  );
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) fail(`${name}님의 일정 id "${rule.id}"가 겹칩니다.`);
    ids.add(rule.id);
  }
  const person: PersonInput = { id: value.id, name, rules };
  const role = str(value.role).trim();
  if (role) person.role = role;
  if (typeof value.pubkey === "string" && /^[0-9a-f]{64}$/.test(value.pubkey))
    person.pubkey = value.pubkey;
  return person;
}

function readImportPlan(raw: unknown): SprintPlanInput {
  if (!raw || typeof raw !== "object")
    fail("스프린트 설정 형식이 맞지 않습니다.");
  const value = raw as Record<string, unknown>;
  const list = (field: unknown) => (Array.isArray(field) ? field : []);
  const plan: SprintPlanInput = {
    title: str(value.title).trim(),
    start: str(value.start),
    weeks: Number(value.weeks),
    phases: list(value.phases).map((phase) => {
      const item = (phase ?? {}) as Record<string, unknown>;
      return {
        label: str(item.label).trim(),
        weeks: Number(item.weeks),
        tone: (PHASE_TONES as readonly unknown[]).includes(item.tone)
          ? (item.tone as PhaseTone)
          : "other",
      };
    }),
    depts: list(value.depts).map((dept) => {
      const item = (dept ?? {}) as Record<string, unknown>;
      const next: SprintPlanInput["depts"][number] = {
        key: str(item.key),
        label: str(item.label).trim(),
      };
      if ((CALENDAR_COLORS as readonly unknown[]).includes(item.color))
        next.color = item.color as CalendarColor;
      return next;
    }),
    keyDates: list(value.keyDates).map((keyDate) => {
      const item = (keyDate ?? {}) as Record<string, unknown>;
      return { label: str(item.label).trim(), date: str(item.date) };
    }),
  };
  const note = str(value.note).trim();
  if (note) plan.note = note;
  const problem = validatePlan(plan);
  if (problem) fail(`스프린트 설정: ${problem}`);
  return plan;
}

/** Reads an import file. Throws an Error with a Korean message when it is wrong. */
export function parseCalendarImport(content: string): CalendarImport {
  let json: unknown;
  try {
    json = JSON.parse(content.replace(/^﻿/, ""));
  } catch {
    fail("JSON 파일이 아니거나 내용이 깨져 있습니다.");
  }
  if (!json || typeof json !== "object") fail("파일 형식이 맞지 않습니다.");
  const value = json as Record<string, unknown>;
  if (value.format !== IMPORT_FORMAT)
    fail(`"${IMPORT_FORMAT}" 형식의 파일이 아닙니다.`);
  if (value.version !== IMPORT_VERSION)
    fail(`이 앱이 모르는 파일 버전입니다 (${String(value.version)}).`);
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  if (rawEntries.length > MAX_IMPORT_ENTRIES)
    fail(`일정이 ${MAX_IMPORT_ENTRIES}개를 넘습니다.`);
  const entries = rawEntries.map(readImportEntry);
  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (entryIds.has(entry.id as string))
      fail(`일정 id "${entry.id}"가 겹칩니다.`);
    entryIds.add(entry.id as string);
  }
  const rawPeople = Array.isArray(value.people) ? value.people : [];
  if (rawPeople.length > MAX_PEOPLE) fail(`팀원이 ${MAX_PEOPLE}명을 넘습니다.`);
  const people = rawPeople.map(readImportPerson);
  const personIds = new Set<string>();
  for (const person of people) {
    if (personIds.has(person.id)) fail(`팀원 id "${person.id}"가 겹칩니다.`);
    personIds.add(person.id);
  }
  const plan = value.plan === undefined ? null : readImportPlan(value.plan);
  if (!plan && entries.length === 0 && people.length === 0)
    fail("가져올 내용이 없습니다.");
  return { plan, entries, people };
}

/** The import/backup file of what the calendar holds now. */
export function buildCalendarBackup(input: {
  plan: SprintPlanInput | null;
  entries: CalendarEntry[];
  people: TeamPerson[];
}): string {
  const entries = input.entries.map((entry) => {
    const out: Record<string, unknown> = {
      id: entry.id,
      title: entry.title,
      date: entry.date,
    };
    if (entry.endDate) out.endDate = entry.endDate;
    if (entry.time) out.time = entry.time;
    if (entry.endTime) out.endTime = entry.endTime;
    if (entry.color) out.color = entry.color;
    if (entry.note) out.note = entry.note;
    if (entry.dept) out.dept = entry.dept;
    if (entry.milestone) out.milestone = true;
    if (entry.repeat) out.repeat = entry.repeat;
    return out;
  });
  const people = input.people.map((person) => {
    const out: Record<string, unknown> = {
      id: person.id,
      name: person.name,
      rules: person.rules,
    };
    if (person.role) out.role = person.role;
    if (person.pubkey) out.pubkey = person.pubkey;
    return out;
  });
  const plan = input.plan
    ? {
        title: input.plan.title,
        start: input.plan.start,
        weeks: input.plan.weeks,
        phases: input.plan.phases,
        depts: input.plan.depts,
        keyDates: input.plan.keyDates,
        ...(input.plan.note ? { note: input.plan.note } : {}),
      }
    : undefined;
  return `${JSON.stringify(
    {
      format: IMPORT_FORMAT,
      version: IMPORT_VERSION,
      ...(plan ? { plan } : {}),
      entries,
      people,
    },
    null,
    2,
  )}\n`;
}
