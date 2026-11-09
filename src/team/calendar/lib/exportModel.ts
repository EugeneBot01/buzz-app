import {
  type CalendarColor,
  type CalendarEntry,
  entriesOnDate,
  entryEndDate,
  expandRepeats,
  monthGrid,
} from "./teamCalendar";
import {
  type PhaseTone,
  type SprintPlan,
  UNASSIGNED_ROW,
  dDayLabel,
  phaseOfWeeks,
  shortDate,
  sprintCells,
  sprintRows,
  sprintWeeks,
} from "./teamSprint";

/**
 * What an export draws, independent of the file format (team patch). Both
 * views become "board pages": a grid with optional row labels down the side,
 * column headers across the top and short items in every cell. PNG, PDF and
 * Word all render these pages, so the three files always agree.
 */
export type BoardItem = {
  text: string;
  /** A deadline/event (◆) rather than work over a period (•). */
  milestone: boolean;
  color?: CalendarColor | undefined;
};

export type BoardColumn = {
  label: string;
  sub?: string | undefined;
  /** This week / today. */
  highlight?: boolean | undefined;
};

export type BoardCell = {
  items: BoardItem[];
  /** Day number of a month cell. */
  day?: string | undefined;
  /** A day outside the month. */
  muted?: boolean | undefined;
  today?: boolean | undefined;
  /** The production column of a sprint board. */
  accent?: boolean | undefined;
};

export type BoardRow = {
  label: string;
  sub?: string | undefined;
  cells: BoardCell[];
};

export type BoardPage = {
  title: string;
  subtitle?: string | undefined;
  note?: string | undefined;
  /** Phase bands over the columns (sprint board only). */
  bands?: Array<{ label: string; span: number; tone: PhaseTone | "none" }>;
  columns: BoardColumn[];
  rows: BoardRow[];
  /** Whether the first column holds row labels. */
  rowLabels: boolean;
  /** Small counters shown at the top right ("D-36 프로덕션"). */
  counters?: Array<{ value: string; label: string; hot?: boolean | undefined }>;
};

/** Columns of a sprint page printed on paper (wider boards are split). */
export const SPRINT_WEEKS_PER_PAGE = 8;

export type SprintExportOptions = {
  plan: SprintPlan;
  entries: CalendarEntry[];
  /** First and last week (0-based, inclusive) to include. */
  fromWeek: number;
  toWeek: number;
  today: string;
  /** Split into pages of `SPRINT_WEEKS_PER_PAGE` weeks (paper formats). */
  paginate: boolean;
};

export function sprintPages(options: SprintExportOptions): BoardPage[] {
  const { plan, entries, today } = options;
  const weeks = sprintWeeks(plan);
  const from = Math.max(0, Math.min(options.fromWeek, plan.weeks - 1));
  const to = Math.max(from, Math.min(options.toWeek, plan.weeks - 1));
  const cells = sprintCells(plan, entries);
  const rows = sprintRows(plan, entries);
  const phases = phaseOfWeeks(plan);
  const prodWeeks = new Set(
    phases
      .map((phase, index) => (phase?.tone === "prod" ? index : -1))
      .filter((index) => index >= 0),
  );
  const colorOf = new Map(plan.depts.map((dept) => [dept.key, dept.color]));
  const counters = plan.keyDates.map((keyDate, index) => ({
    value: dDayLabel(keyDate.date, today),
    label: `${keyDate.label} ${shortDate(keyDate.date)}`,
    hot: index === 0,
  }));

  const chunks: Array<[number, number]> = [];
  const size = options.paginate ? SPRINT_WEEKS_PER_PAGE : to - from + 1;
  for (let start = from; start <= to; start += size)
    chunks.push([start, Math.min(to, start + size - 1)]);

  return chunks.map(([first, last], pageIndex) => {
    const shown = weeks.slice(first, last + 1);
    const bands: NonNullable<BoardPage["bands"]> = [];
    for (const week of shown) {
      const phase = phases[week.index] ?? null;
      const label = phase?.label ?? "";
      const tone = phase?.tone ?? "none";
      const previous = bands[bands.length - 1];
      if (previous && previous.label === label && previous.tone === tone)
        previous.span += 1;
      else bands.push({ label, span: 1, tone });
    }
    return {
      title:
        chunks.length > 1
          ? `${plan.title} (${pageIndex + 1}/${chunks.length})`
          : plan.title,
      subtitle: `${shown[0]?.id} ${shortDate(shown[0]?.start ?? plan.start)} ~ ${
        shown[shown.length - 1]?.id
      } ${shortDate(shown[shown.length - 1]?.end ?? plan.start)}`,
      note: plan.note,
      bands,
      counters,
      rowLabels: true,
      columns: shown.map((week) => ({
        label: week.id,
        sub: `${shortDate(week.start)}–${shortDate(week.end)}`,
        highlight: week.start <= today && today <= week.end,
      })),
      rows: rows.map((row) => ({
        label: row.key === UNASSIGNED_ROW ? "기타" : row.key,
        sub: row.label,
        cells: shown.map((week) => ({
          accent: prodWeeks.has(week.index),
          items: (cells.get(row.key)?.[week.index] ?? []).map((item) => ({
            text: item.label,
            milestone: item.milestone,
            color:
              item.entry.color ??
              colorOf.get(item.entry.dept ?? "") ??
              undefined,
          })),
        })),
      })),
    };
  });
}

const timeLabel = (entry: CalendarEntry) =>
  entry.time
    ? entry.endTime
      ? `${entry.time}–${entry.endTime}`
      : entry.time
    : "";

/** One page per month (`YYYY-MM`), Sunday first, like the month view. */
export function calendarPages(input: {
  title: string;
  months: string[];
  entries: CalendarEntry[];
  today: string;
  deptLabel?: (key: string) => string | undefined;
}): BoardPage[] {
  return input.months.map((month) => {
    const grid = monthGrid(month);
    const first = grid[0]?.date ?? `${month}-01`;
    const last = grid[grid.length - 1]?.date ?? `${month}-28`;
    const shown = expandRepeats(input.entries, first, last);
    const weeks: (typeof grid)[] = [];
    for (let start = 0; start < grid.length; start += 7)
      weeks.push(grid.slice(start, start + 7));
    // Drop a trailing week that is entirely next month.
    while (
      weeks.length > 4 &&
      weeks[weeks.length - 1]?.every((cell) => !cell.inMonth)
    )
      weeks.pop();
    const [year, value] = month.split("-").map(Number);
    return {
      title: `${year}년 ${value}월`,
      subtitle: input.title,
      rowLabels: false,
      columns: ["일", "월", "화", "수", "목", "금", "토"].map((label) => ({
        label,
      })),
      rows: weeks.map((week) => ({
        label: "",
        cells: week.map((cell, column) => ({
          day: String(cell.day),
          muted: !cell.inMonth,
          today: cell.date === input.today,
          // A multi-day entry is written once per week row: on its first day,
          // or on Sunday when it carries on from the week before.
          items: entriesOnDate(shown, cell.date)
            .filter(
              (entry) =>
                entry.date === cell.date ||
                (column === 0 && entry.date < cell.date),
            )
            .map((entry) => {
              const end = entryEndDate(entry);
              const multi = entry.date !== end;
              const dept = entry.dept
                ? input.deptLabel?.(entry.dept)
                : undefined;
              const parts = [
                multi && entry.date !== cell.date ? "↳" : "",
                multi ? "" : timeLabel(entry),
                entry.title,
                multi ? `(${shortDate(entry.date)}–${shortDate(end)})` : "",
                dept ? `[${dept}]` : "",
              ].filter(Boolean);
              return {
                text: parts.join(" "),
                milestone: entry.milestone === true,
                color: entry.color,
              };
            }),
        })),
      })),
    };
  });
}

const csvField = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Entries between `from` and `to` as CSV (UTF-8 with BOM so Excel reads the
 * Korean right), one row per occurrence.
 */
export function entriesCsv(input: {
  entries: CalendarEntry[];
  from: string;
  to: string;
  deptLabel?: (key: string) => string | undefined;
}): string {
  const header = [
    "시작 날짜",
    "종료 날짜",
    "시작 시간",
    "종료 시간",
    "제목",
    "부서",
    "종류",
    "메모",
  ];
  const lines = [header.join(",")];
  const shown = expandRepeats(input.entries, input.from, input.to).filter(
    (entry) => entry.date <= input.to && entryEndDate(entry) >= input.from,
  );
  for (const entry of shown) {
    lines.push(
      [
        entry.date,
        entryEndDate(entry),
        entry.time ?? "",
        entry.endTime ?? "",
        entry.title,
        entry.dept ? (input.deptLabel?.(entry.dept) ?? entry.dept) : "",
        entry.milestone ? "마감·이벤트" : entry.repeat ? "반복" : "작업",
        entry.note ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
