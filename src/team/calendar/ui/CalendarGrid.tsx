import { ChevronLeft, ChevronRight } from "../compat/icons";
import * as React from "react";

import { type TeamPerson, busyCountOn } from "../lib/teamAvailability";
import {
  type CalendarOccurrence,
  entriesOnDate,
  monthGrid,
  occurrenceKey,
  shiftMonth,
  weekSegments,
} from "../lib/teamCalendar";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Checkbox } from "../compat/ui";
import { type ColorChoice, colorBar } from "./EntryForm";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** Bars drawn under the day number; more are counted as "+N" in the cell. */
const MAX_LANES = 3;

/** The seven days of each of the grid's six weeks. */
export function weeksOf<T>(cells: T[]): T[][] {
  const weeks: T[][] = [];
  for (let start = 0; start < cells.length; start += 7)
    weeks.push(cells.slice(start, start + 7));
  return weeks;
}

export function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${year}년 ${value}월`;
}

export function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/** The month view's grid (team patch), with bars for multi-day entries. */
export function CalendarGrid({
  month,
  entries,
  selectedDate,
  today,
  mineOnly,
  showPeople,
  people,
  status,
  colorOfDept,
  onMonth,
  onSelectDate,
  onMineOnly,
  onShowPeople,
}: {
  month: string;
  /** Occurrences already expanded for the grid's six weeks. */
  entries: CalendarOccurrence[];
  selectedDate: string;
  today: string;
  mineOnly: boolean;
  showPeople: boolean;
  people: TeamPerson[];
  status: "loading" | "ready" | "error";
  colorOfDept: (key: string | undefined) => ColorChoice;
  onMonth: (month: string) => void;
  onSelectDate: (date: string) => void;
  onMineOnly: (value: boolean) => void;
  onShowPeople: (value: boolean) => void;
}) {
  const weeks = React.useMemo(() => weeksOf(monthGrid(month)), [month]);

  return (
    <section aria-label="달력" className="min-w-0 flex-1">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <Button
          aria-label="이전 달"
          onClick={() => onMonth(shiftMonth(month, -1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3
          aria-live="polite"
          className="min-w-28 text-center text-sm font-semibold"
          data-testid="team-calendar-month"
        >
          {monthLabel(month)}
        </h3>
        <Button
          aria-label="다음 달"
          onClick={() => onMonth(shiftMonth(month, 1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <label className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-xs">
          <Checkbox
            checked={showPeople}
            data-testid="team-calendar-show-people"
            onCheckedChange={(checked) => onShowPeople(checked === true)}
          />
          팀원 일정 표시
        </label>
        <label className="mx-2 flex items-center gap-1.5 whitespace-nowrap text-xs">
          <Checkbox
            checked={mineOnly}
            data-testid="team-calendar-mine-only"
            onCheckedChange={(checked) => onMineOnly(checked === true)}
          />
          내 일정만
        </label>
        <Button
          onClick={() => onSelectDate(today)}
          size="sm"
          type="button"
          variant="outline"
        >
          오늘
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-muted">
        {WEEKDAYS.map((weekday, index) => (
          <div
            className={cn(
              "py-1",
              index === 0 && "text-[#ef4444cc]",
              index === 6 && "text-[#3b82f6cc]",
            )}
            key={weekday}
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-border/60">
        {weeks.map((week) => {
          const bars = weekSegments(
            entries,
            week.map((cell) => cell.date),
          );
          const shown = bars.filter((bar) => bar.lane < MAX_LANES);
          const hidden = week.map(
            (_, column) =>
              bars.filter(
                (bar) =>
                  bar.lane >= MAX_LANES &&
                  bar.startColumn <= column &&
                  column < bar.startColumn + bar.span,
              ).length,
          );
          return (
            <div className="relative" key={week[0]?.date}>
              <div className="grid grid-cols-7 gap-px">
                {week.map((cell, column) => {
                  const count = entriesOnDate(entries, cell.date).length;
                  const busy = showPeople ? busyCountOn(people, cell.date) : 0;
                  const isSelected = cell.date === selectedDate;
                  return (
                    <button
                      aria-label={`${dateLabel(cell.date)}, 일정 ${count}개${
                        busy ? `, 종일 불가 ${busy}명` : ""
                      }`}
                      aria-pressed={isSelected}
                      className={cn(
                        "border-0 rounded-none cursor-pointer flex h-20 min-w-0 flex-col items-stretch gap-0.5 bg-surface p-1 text-left transition-colors hover:bg-soft focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                        !cell.inMonth && "text-muted",
                        isSelected && "bg-hover hover:bg-hover",
                      )}
                      data-testid={`team-calendar-day-${cell.date}`}
                      key={cell.date}
                      onClick={() => onSelectDate(cell.date)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                            cell.date === today &&
                              "bg-[var(--primary)] font-semibold text-on-primary",
                          )}
                        >
                          {cell.day}
                        </span>
                        <span className="flex items-center gap-1">
                          {busy ? (
                            <span
                              className="rounded bg-[#ef444426] px-1 text-xs font-medium text-[#b91c1c] dark:text-[#fca5a5]"
                              data-testid="team-calendar-busy-badge"
                              title={`팀원 ${busy}명이 이 날 종일 불가예요`}
                            >
                              종일불가 {busy}
                            </span>
                          ) : null}
                          {hidden[column] ? (
                            <span className="px-0.5 text-xs text-muted">
                              +{hidden[column]}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Bars sit over the day buttons; clicks go through to them. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-6 grid auto-rows-[1rem] grid-cols-7 gap-x-px gap-y-0.5"
              >
                {shown.map((bar) => (
                  <span
                    className={cn(
                      "truncate text-xs leading-4 ",
                      bar.continuesBefore
                        ? "rounded-l-none pl-1.5"
                        : "ml-0.5 rounded-l pl-1",
                      bar.continuesAfter
                        ? "rounded-r-none"
                        : "mr-0.5 rounded-r",
                    )}
                    data-testid="team-calendar-bar"
                    key={`${occurrenceKey(bar.entry)}-${week[0]?.date}`}
                    style={{
                      ...colorBar(
                        bar.entry.color ?? colorOfDept(bar.entry.dept),
                      ),
                      gridColumn: `${bar.startColumn + 1} / span ${bar.span}`,
                      gridRow: bar.lane + 1,
                    }}
                  >
                    {bar.entry.milestone ? "◆ " : ""}
                    {bar.entry.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs text-muted">
        {status === "loading" ? "일정을 불러오는 중…" : null}
        {status === "error"
          ? "일정을 불러오지 못했습니다. 연결을 확인해 주세요."
          : null}
      </p>
    </section>
  );
}
