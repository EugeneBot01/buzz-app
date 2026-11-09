import type { RelayEvent } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";

import {
  CALENDAR_COLORS,
  type CalendarColor,
  type CalendarEntry,
  type CalendarOccurrence,
  DEPT_KEY_PATTERN,
  addDays,
  daysBetween,
  entryEndDate,
  expandRepeats,
  monthOfDate,
  shiftMonth,
} from "./teamCalendar";

/**
 * Sprint board (team patch): the team calendar seen as a production master
 * plan, departments down the side and weekly sprints across the top.
 *
 * The board has no entries of its own. Every item on it is a team calendar
 * entry that carries a department (`dept`), so the sprint board and the month
 * view always show the same data: an edit in one is an edit in the other.
 *
 * What the board needs besides entries (title, first day, number of weeks,
 * phases, departments, a note and key dates) is the "plan". It is shared the
 * same way as the calendar: each member publishes a copy at their own
 * `(pubkey, kind 30078, d)` coordinate and the newest copy wins as a whole.
 */
export const TEAM_SPRINT_D_TAG = "team-sprint";

export const MAX_SPRINT_WEEKS = 26;
export const MAX_DEPTS = 30;
export const MAX_PHASES = 8;
export const MAX_KEY_DATES = 6;
export const MAX_PLAN_TITLE_LENGTH = 80;
export const MAX_PLAN_NOTE_LENGTH = 400;
export const MAX_LABEL_LENGTH = 24;

/** How a phase band is tinted. */
export const PHASE_TONES = ["pre", "prod", "post", "other"] as const;
export type PhaseTone = (typeof PHASE_TONES)[number];

export type SprintPhase = { label: string; weeks: number; tone: PhaseTone };
export type SprintDept = {
  key: string;
  label: string;
  color?: CalendarColor | undefined;
};
export type SprintKeyDate = { label: string; date: string };

export type SprintPlan = {
  title: string;
  /** First day of week 1, `YYYY-MM-DD` (a Monday on the master plan). */
  start: string;
  weeks: number;
  phases: SprintPhase[];
  depts: SprintDept[];
  note?: string | undefined;
  keyDates: SprintKeyDate[];
  updatedAt: number;
  updatedBy: string;
};

/** Row key of entries without a (known) department. */
export const UNASSIGNED_ROW = "";

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isPubkey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const isColor = (value: unknown): value is CalendarColor =>
  typeof value === "string" &&
  (CALENDAR_COLORS as readonly string[]).includes(value);

/** The departments of the PARATKD master plan; a starting point for a new plan. */
export const DEFAULT_DEPTS: SprintDept[] = [
  { key: "ALL", label: "전 부서", color: "red" },
  { key: "DIRECTOR", label: "연출팀", color: "purple" },
  { key: "PRODUCE", label: "제작부", color: "orange" },
  { key: "CHOREO", label: "안무팀", color: "pink" },
  { key: "CAMERA", label: "촬영팀", color: "blue" },
  { key: "MUSIC", label: "음악팀", color: "teal" },
  { key: "ART", label: "미술팀", color: "yellow" },
  { key: "POST", label: "포스트", color: "indigo" },
  { key: "AI", label: "AI", color: "cyan" },
  { key: "CLIENT", label: "클라이언트", color: "brown" },
  { key: "MEET", label: "정기회의", color: "gray" },
];

/** The Monday on or before `date`. */
export function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** A plan nobody has saved yet: 8 weeks from this week's Monday. */
export function defaultPlan(today: string, pubkey: string): SprintPlan {
  return {
    title: "스프린트 보드",
    start: mondayOf(today),
    weeks: 8,
    phases: [
      { label: "PRE-PRODUCTION", weeks: 6, tone: "pre" },
      { label: "PRODUCTION", weeks: 1, tone: "prod" },
      { label: "POST-PRODUCTION", weeks: 1, tone: "post" },
    ],
    depts: DEFAULT_DEPTS.map((dept) => ({ ...dept })),
    keyDates: [],
    updatedAt: 0,
    updatedBy: pubkey,
  };
}

/** Why `plan` cannot be saved (a message for the person), or `null`. */
export function validatePlan(
  plan: Omit<SprintPlan, "updatedAt" | "updatedBy">,
): string | null {
  if (!plan.title.trim()) return "보드 이름을 입력해 주세요.";
  if (!DATE_PATTERN.test(plan.start)) return "시작 날짜를 확인해 주세요.";
  if (
    !Number.isInteger(plan.weeks) ||
    plan.weeks < 1 ||
    plan.weeks > MAX_SPRINT_WEEKS
  )
    return `스프린트는 1~${MAX_SPRINT_WEEKS}주로 정해 주세요.`;
  if (plan.depts.length === 0) return "부서를 하나 이상 넣어 주세요.";
  if (plan.depts.length > MAX_DEPTS)
    return `부서는 ${MAX_DEPTS}개까지 넣을 수 있습니다.`;
  const keys = new Set<string>();
  for (const dept of plan.depts) {
    if (!DEPT_KEY_PATTERN.test(dept.key))
      return `부서 코드 "${dept.key}"는 영문 대문자·숫자·_·-로 24자 이내여야 합니다.`;
    if (keys.has(dept.key)) return `부서 코드 "${dept.key}"가 겹칩니다.`;
    keys.add(dept.key);
    if (!dept.label.trim()) return "부서 이름을 입력해 주세요.";
  }
  if (plan.phases.length > MAX_PHASES)
    return `단계는 ${MAX_PHASES}개까지 넣을 수 있습니다.`;
  let phaseWeeks = 0;
  for (const phase of plan.phases) {
    if (!phase.label.trim()) return "단계 이름을 입력해 주세요.";
    if (!Number.isInteger(phase.weeks) || phase.weeks < 1)
      return "단계마다 1주 이상이어야 합니다.";
    phaseWeeks += phase.weeks;
  }
  if (phaseWeeks > plan.weeks)
    return `단계 주 수의 합(${phaseWeeks}주)이 전체 ${plan.weeks}주보다 많습니다.`;
  if (plan.keyDates.length > MAX_KEY_DATES)
    return `주요 날짜는 ${MAX_KEY_DATES}개까지 넣을 수 있습니다.`;
  for (const keyDate of plan.keyDates) {
    if (!keyDate.label.trim() || !DATE_PATTERN.test(keyDate.date))
      return "주요 날짜의 이름과 날짜를 확인해 주세요.";
  }
  return null;
}

/** A stored plan if it is well-formed, else `null`. */
export function readPlan(raw: unknown): SprintPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.start !== "string" || !DATE_PATTERN.test(value.start))
    return null;
  if (
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    value.updatedAt <= 0 ||
    !isPubkey(value.updatedBy)
  )
    return null;
  const weeks = Number(value.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_SPRINT_WEEKS)
    return null;
  const depts: SprintDept[] = [];
  const keys = new Set<string>();
  for (const rawDept of Array.isArray(value.depts) ? value.depts : []) {
    if (!rawDept || typeof rawDept !== "object") continue;
    const dept = rawDept as Record<string, unknown>;
    if (typeof dept.key !== "string" || !DEPT_KEY_PATTERN.test(dept.key))
      continue;
    if (keys.has(dept.key)) continue;
    const label = text(dept.label, MAX_LABEL_LENGTH);
    if (!label) continue;
    keys.add(dept.key);
    const next: SprintDept = { key: dept.key, label };
    if (isColor(dept.color)) next.color = dept.color;
    depts.push(next);
    if (depts.length >= MAX_DEPTS) break;
  }
  const phases: SprintPhase[] = [];
  let phaseWeeks = 0;
  for (const rawPhase of Array.isArray(value.phases) ? value.phases : []) {
    if (!rawPhase || typeof rawPhase !== "object") continue;
    const phase = rawPhase as Record<string, unknown>;
    const label = text(phase.label, MAX_LABEL_LENGTH);
    const phaseLength = Number(phase.weeks);
    if (!label || !Number.isInteger(phaseLength) || phaseLength < 1) continue;
    if (phaseWeeks + phaseLength > weeks) break;
    phaseWeeks += phaseLength;
    const tone = (PHASE_TONES as readonly unknown[]).includes(phase.tone)
      ? (phase.tone as PhaseTone)
      : "other";
    phases.push({ label, weeks: phaseLength, tone });
    if (phases.length >= MAX_PHASES) break;
  }
  const keyDates: SprintKeyDate[] = [];
  for (const rawKey of Array.isArray(value.keyDates) ? value.keyDates : []) {
    if (!rawKey || typeof rawKey !== "object") continue;
    const keyDate = rawKey as Record<string, unknown>;
    const label = text(keyDate.label, MAX_LABEL_LENGTH);
    if (
      !label ||
      typeof keyDate.date !== "string" ||
      !DATE_PATTERN.test(keyDate.date)
    )
      continue;
    keyDates.push({ label, date: keyDate.date });
    if (keyDates.length >= MAX_KEY_DATES) break;
  }
  const plan: SprintPlan = {
    title: text(value.title, MAX_PLAN_TITLE_LENGTH) || "스프린트 보드",
    start: value.start,
    weeks,
    phases,
    depts,
    keyDates,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
  };
  const note = text(value.note, MAX_PLAN_NOTE_LENGTH);
  if (note) plan.note = note;
  return plan;
}

export function encodePlan(plan: SprintPlan): string {
  return JSON.stringify({ v: 1, plan });
}

export function decodePlan(content: string): SprintPlan | null {
  try {
    const json = JSON.parse(content) as { plan?: unknown | undefined } | null;
    return readPlan(json?.plan);
  } catch {
    return null;
  }
}

/** True when `candidate` replaces `current` (later edit, then higher pubkey). */
export function planWins(
  candidate: SprintPlan,
  current: SprintPlan | null,
): boolean {
  if (!current) return true;
  if (candidate.updatedAt !== current.updatedAt)
    return candidate.updatedAt > current.updatedAt;
  return candidate.updatedBy > current.updatedBy;
}

export function teamSprintDTag(relayUrl: string): string {
  return `${TEAM_SPRINT_D_TAG}:${normalizeRelayUrl(relayUrl)}`;
}

/** The newest plan among every member's event, and this member's own one. */
export function mergePlanEvents(
  events: RelayEvent[],
  dTag: string,
  pubkey: string,
): {
  merged: SprintPlan | null;
  own: SprintPlan | null;
  ownCreatedAt: number;
} {
  let merged: SprintPlan | null = null;
  let own: SprintPlan | null = null;
  let ownCreatedAt = 0;
  for (const event of events) {
    const d = event.tags.filter((tag) => tag[0] === "d");
    if (d.length !== 1 || d[0]?.[1] !== dTag) continue;
    const copy = decodePlan(event.content);
    if (event.pubkey === pubkey && event.created_at >= ownCreatedAt) {
      ownCreatedAt = event.created_at;
      own = copy;
    }
    if (copy && planWins(copy, merged)) merged = copy;
  }
  return { merged, own, ownCreatedAt };
}

/** The newer of two plans (`base` itself when `other` is not newer). */
export function mergePlan(
  base: SprintPlan | null,
  other: SprintPlan | null,
): SprintPlan | null {
  return other && planWins(other, base) ? other : base;
}

export type SprintWeek = {
  index: number;
  /** `W01`, `W02`, ... */
  id: string;
  start: string;
  end: string;
};

export const weekId = (index: number) =>
  `W${String(index + 1).padStart(2, "0")}`;

export function sprintWeeks(plan: Pick<SprintPlan, "start" | "weeks">) {
  return Array.from(
    { length: plan.weeks },
    (_, index): SprintWeek => ({
      index,
      id: weekId(index),
      start: addDays(plan.start, index * 7),
      end: addDays(plan.start, index * 7 + 6),
    }),
  );
}

/** Last day of the last sprint. */
export const planEnd = (plan: Pick<SprintPlan, "start" | "weeks">) =>
  addDays(plan.start, plan.weeks * 7 - 1);

/** The sprint `date` falls in, or -1 when it is outside the plan. */
export function weekIndexOf(
  plan: Pick<SprintPlan, "start" | "weeks">,
  date: string,
): number {
  const offset = daysBetween(plan.start, date);
  if (offset < 0) return -1;
  const index = Math.floor(offset / 7);
  return index < plan.weeks ? index : -1;
}

/**
 * The months the board reads: every month the plan touches plus the one
 * before (an entry is stored in the month it starts in and may run into the
 * plan from there).
 */
export function planMonths(plan: Pick<SprintPlan, "start" | "weeks">) {
  const first = shiftMonth(monthOfDate(plan.start), -1);
  const last = monthOfDate(planEnd(plan));
  const months: string[] = [];
  for (let month = first; month <= last; month = shiftMonth(month, 1))
    months.push(month);
  return months;
}

/** The phase band of each week (`null` for weeks after the last phase). */
export function phaseOfWeeks(plan: SprintPlan): Array<SprintPhase | null> {
  const result: Array<SprintPhase | null> = [];
  for (const phase of plan.phases)
    for (let week = 0; week < phase.weeks; week++) result.push(phase);
  while (result.length < plan.weeks) result.push(null);
  return result.slice(0, plan.weeks);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekdayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/** `M/D` of a `YYYY-MM-DD` date. */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

/**
 * How an entry reads in one sprint cell, in the master plan's own style:
 * a weekly meeting is "월 14:30 기획", a one-day item starts with its date
 * ("10/4 키스탭 확정"), an item that does not fill the whole week ends with
 * its days ("편집 1차 (12/14–12/17)"), and a week-long task is its title.
 */
export function sprintItemLabel(
  entry: CalendarOccurrence,
  week: Pick<SprintWeek, "start" | "end">,
): string {
  const end = entryEndDate(entry);
  if (entry.repeat && entry.date === end) {
    return [weekdayOf(entry.date), entry.time, entry.title]
      .filter(Boolean)
      .join(" ");
  }
  if (entry.date === end) {
    return [shortDate(entry.date), entry.time, entry.title]
      .filter(Boolean)
      .join(" ");
  }
  if (entry.date === week.start && end === week.end) return entry.title;
  return `${entry.title} (${shortDate(entry.date)}–${shortDate(end)})`;
}

export type SprintCellItem = {
  entry: CalendarOccurrence;
  label: string;
  milestone: boolean;
};

export type SprintRow = {
  key: string;
  label: string;
  color?: CalendarColor | undefined;
};

/** The board's rows: the plan's departments, then "부서 미지정" if needed. */
export function sprintRows(
  plan: SprintPlan,
  entries: CalendarEntry[],
): SprintRow[] {
  const rows: SprintRow[] = plan.depts.map((dept) => ({ ...dept }));
  const known = new Set(plan.depts.map((dept) => dept.key));
  const start = plan.start;
  const end = planEnd(plan);
  const hasLoose = expandRepeats(entries, start, end).some(
    (entry) =>
      (!entry.dept || !known.has(entry.dept)) &&
      entry.date <= end &&
      entryEndDate(entry) >= start,
  );
  if (hasLoose) rows.push({ key: UNASSIGNED_ROW, label: "부서 미지정" });
  return rows;
}

/**
 * Items of every cell: `cells[rowKey][weekIndex]`. An entry shows in every
 * week it covers (a 12/20–12/22 edit shows in both of its weeks), in its
 * department's row; an entry without a known department goes to the
 * "부서 미지정" row so nothing on the calendar is missing from the board.
 */
export function sprintCells(
  plan: SprintPlan,
  entries: CalendarEntry[],
): Map<string, SprintCellItem[][]> {
  const weeks = sprintWeeks(plan);
  const known = new Set(plan.depts.map((dept) => dept.key));
  const cells = new Map<string, SprintCellItem[][]>();
  const rowOf = (key: string) => {
    let row = cells.get(key);
    if (!row) {
      row = weeks.map(() => []);
      cells.set(key, row);
    }
    return row;
  };
  for (const dept of plan.depts) rowOf(dept.key);
  const occurrences = expandRepeats(entries, plan.start, planEnd(plan));
  for (const entry of occurrences) {
    const key =
      entry.dept && known.has(entry.dept) ? entry.dept : UNASSIGNED_ROW;
    const end = entryEndDate(entry);
    for (const week of weeks) {
      if (end < week.start || entry.date > week.end) continue;
      rowOf(key)[week.index]?.push({
        entry,
        label: sprintItemLabel(entry, week),
        milestone: entry.milestone === true,
      });
    }
  }
  return cells;
}

/** "D-36", "D-DAY" or "D+3" for `date` seen from `today`. */
export function dDayLabel(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${-days}`;
}
