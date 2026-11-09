import { Plus, Settings2 } from "../compat/icons";
import * as React from "react";

import type { CalendarEntry, CalendarOccurrence } from "../lib/teamCalendar";
import {
  type SprintPlan,
  type SprintWeek,
  UNASSIGNED_ROW,
  dDayLabel,
  phaseOfWeeks,
  shortDate,
  sprintCells,
  sprintRows,
  sprintWeeks,
  weekIndexOf,
} from "../lib/teamSprint";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { colorDot } from "./EntryForm";

const PHASE_CLASS = {
  pre: "bg-blue-3",
  prod: "bg-orange-4 font-semibold text-orange-11 ",
  post: "bg-green-3",
  other: "bg-muted",
} as const;

type SprintBoardProps = {
  plan: SprintPlan;
  /** True while nobody has saved settings yet (the default plan is shown). */
  isDefaultPlan: boolean;
  entries: CalendarEntry[];
  today: string;
  /** The day selected in either view; its week is outlined. */
  selectedDate: string;
  /** The entry being edited, outlined on the board. */
  editingId?: string | undefined;
  status: "loading" | "ready" | "error";
  onSelectWeek: (week: SprintWeek) => void;
  onAdd: (deptKey: string, week: SprintWeek) => void;
  onEdit: (entry: CalendarOccurrence) => void;
  onEditPlan: () => void;
};

/**
 * The sprint board (team patch): departments down the side, weekly sprints
 * across, in the layout of the team's production master plan. Every item is
 * a team calendar entry, so the month view shows the same items.
 */
export function SprintBoard({
  plan,
  isDefaultPlan,
  entries,
  today,
  selectedDate,
  editingId,
  status,
  onSelectWeek,
  onAdd,
  onEdit,
  onEditPlan,
}: SprintBoardProps) {
  const weeks = React.useMemo(() => sprintWeeks(plan), [plan]);
  const phases = React.useMemo(() => phaseOfWeeks(plan), [plan]);
  const cells = React.useMemo(
    () => sprintCells(plan, entries),
    [plan, entries],
  );
  const rows = React.useMemo(() => sprintRows(plan, entries), [plan, entries]);
  const currentWeek = weekIndexOf(plan, today);
  const selectedWeek = weekIndexOf(plan, selectedDate);
  const colorOf = React.useMemo(
    () => new Map(plan.depts.map((dept) => [dept.key, dept.color])),
    [plan.depts],
  );

  const bands: Array<{ label: string; span: number; tone: string }> = [];
  for (const phase of phases) {
    const label = phase?.label ?? "";
    const tone = phase?.tone ?? "none";
    const previous = bands[bands.length - 1];
    if (previous && previous.label === label && previous.tone === tone)
      previous.span += 1;
    else bands.push({ label, span: 1, tone });
  }

  // Bring the selected (else this) week into view when the board opens or
  // the selection moves to a week that is off screen.
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const focusWeek = selectedWeek >= 0 ? selectedWeek : currentWeek;
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || focusWeek < 0) return;
    const header = scroller.querySelector<HTMLElement>(
      `[data-week-index="${focusWeek}"]`,
    );
    if (!header) return;
    const label = scroller.querySelector<HTMLElement>("[data-sprint-label]");
    const left = header.offsetLeft - (label?.offsetWidth ?? 0) - 8;
    const right = header.offsetLeft + header.offsetWidth;
    if (
      left < scroller.scrollLeft ||
      right > scroller.scrollLeft + scroller.clientWidth
    )
      scroller.scrollTo?.({ left: Math.max(0, left), behavior: "smooth" });
  }, [focusWeek]);

  return (
    <section aria-label="스프린트 보드" className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold" data-testid="sprint-title">
            {plan.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {weeks[0]?.id} {shortDate(plan.start)} ~{" "}
            {weeks[weeks.length - 1]?.id}{" "}
            {shortDate(weeks[weeks.length - 1]?.end ?? plan.start)} · 칸을
            누르면 일정이 추가되고, 항목을 누르면 고칠 수 있어요. 달력에도 바로
            반영됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          {plan.keyDates.map((keyDate, index) => (
            <div
              className="min-w-24 rounded-md border border-border/70 px-2.5 py-1"
              data-testid="sprint-counter"
              key={`${keyDate.label}-${keyDate.date}`}
            >
              <p
                className={cn(
                  "font-mono text-base font-semibold leading-tight tabular-nums",
                  index === 0 && "text-orange-11 ",
                )}
              >
                {dDayLabel(keyDate.date, today)}
              </p>
              <p className="text-xs text-muted-foreground">
                {keyDate.label} {shortDate(keyDate.date)}
              </p>
            </div>
          ))}
          {currentWeek >= 0 ? (
            <div className="min-w-24 rounded-md border border-border/70 px-2.5 py-1">
              <p className="font-mono text-base font-semibold leading-tight">
                {weeks[currentWeek]?.id}
              </p>
              <p className="text-xs text-muted-foreground">
                이번 주 {shortDate(weeks[currentWeek]?.start ?? today)}–
                {shortDate(weeks[currentWeek]?.end ?? today)}
              </p>
            </div>
          ) : null}
          <Button
            className="h-auto self-stretch"
            data-testid="sprint-settings"
            onClick={onEditPlan}
            size="sm"
            type="button"
            variant="outline"
          >
            <Settings2 className="h-4 w-4" />
            보드 설정
          </Button>
        </div>
      </header>

      {isDefaultPlan ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          아직 저장된 보드 설정이 없어 기본값(이번 주부터 8주)으로 보여 줍니다.
          "보드 설정"에서 기간·단계·부서를 정하거나, "가져오기"로 마스터 플랜
          파일을 불러오세요.
        </p>
      ) : null}
      {plan.note ? (
        <p
          className="rounded-md border border-border/70 border-l-4 border-l-orange-500 px-3 py-1.5 text-xs"
          data-testid="sprint-note"
        >
          {plan.note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-bold text-orange-11">◆</span> 하루짜리
          마감·이벤트
        </span>
        <span>• 기간 작업</span>
        <span>
          <span className="rounded-sm bg-amber-9 px-1 font-semibold text-amber-12">
            노란 열
          </span>{" "}
          이번 주
        </span>
        <span>
          <span className="rounded-sm px-1 ring-2 ring-primary ring-inset">
            테두리
          </span>{" "}
          선택한 주 (달력과 같이 움직여요)
        </span>
      </div>

      <div
        className="max-h-[min(60vh,40rem)] overflow-auto rounded-lg border border-border/70"
        ref={scrollerRef}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 h-7 w-28 min-w-28 border-b border-r border-border/70 bg-muted px-2 font-mono text-xs font-medium tracking-wider text-muted-foreground"
                data-sprint-label=""
                scope="col"
              >
                PHASE
              </th>
              {bands.map((band, index) => (
                <th
                  className={cn(
                    "sticky top-0 z-20 h-7 border-b border-r border-border/70 bg-background px-2 font-mono text-xs uppercase tracking-wider",
                    band.tone !== "none" &&
                      PHASE_CLASS[band.tone as keyof typeof PHASE_CLASS],
                  )}
                  colSpan={band.span}
                  // biome-ignore lint/suspicious/noArrayIndexKey: bands are positional
                  key={index}
                  scope="colgroup"
                >
                  {band.label}
                </th>
              ))}
            </tr>
            <tr>
              <th
                className="sticky left-0 top-7 z-30 border-b border-r border-border/70 bg-muted px-2 py-1.5 font-mono text-xs font-medium tracking-wider text-muted-foreground"
                scope="col"
              >
                SPRINT
              </th>
              {weeks.map((week) => {
                const isNow = week.index === currentWeek;
                const isSelected = week.index === selectedWeek;
                return (
                  <th
                    className={cn(
                      "sticky top-7 z-20 w-44 min-w-44 border-b border-r border-border/70 bg-muted p-0 font-normal",
                      isNow && "bg-amber-9 text-amber-12",
                    )}
                    data-week-index={week.index}
                    key={week.id}
                    scope="col"
                  >
                    <button
                      aria-label={`${week.id} ${shortDate(week.start)}부터 ${shortDate(week.end)}까지 선택`}
                      aria-pressed={isSelected}
                      className={cn(
                        "border-0 rounded-none cursor-pointer flex w-full items-baseline gap-1.5 px-2 py-1.5 text-left hover:bg-foreground/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isSelected && "ring-2 ring-inset ring-primary",
                      )}
                      data-testid={`sprint-week-${week.id}`}
                      onClick={() => onSelectWeek(week)}
                      type="button"
                    >
                      <span className="font-mono text-xs font-semibold">
                        {week.id}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          isNow ? "text-amber-12" : "text-muted-foreground",
                        )}
                      >
                        {shortDate(week.start)}–{shortDate(week.end)}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key || "unassigned"}>
                <th
                  className="sticky left-0 z-10 border-b border-r border-border/70 bg-muted px-2 py-1.5 align-top"
                  scope="row"
                >
                  <span className="block font-mono text-xs font-medium tracking-wider text-muted-foreground">
                    {row.key === UNASSIGNED_ROW ? "ETC" : row.key}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    {row.color ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={colorDot(row.color)}
                      />
                    ) : null}
                    {row.label}
                  </span>
                </th>
                {weeks.map((week) => {
                  const items = cells.get(row.key)?.[week.index] ?? [];
                  const isNow = week.index === currentWeek;
                  const isSelected = week.index === selectedWeek;
                  const isProd = phases[week.index]?.tone === "prod";
                  return (
                    <td
                      className={cn(
                        "group/cell border-b border-r border-border/70 p-0 align-top",
                        isNow && "bg-amber-3",
                        isProd && "border-x-2 border-x-orange-500/60",
                        isSelected && "bg-primary/5",
                      )}
                      data-testid={`sprint-cell-${row.key || "ETC"}-${week.id}`}
                      key={week.id}
                    >
                      <div className="flex min-h-11 flex-col gap-0.5 p-1">
                        {items.map((item) => {
                          const color =
                            item.entry.color ??
                            colorOf.get(item.entry.dept ?? "");
                          return (
                            <button
                              className={cn(
                                "border-0 cursor-pointer grid grid-cols-[0.75rem_1fr] gap-1 rounded px-1 py-0.5 text-left leading-snug hover:bg-foreground/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                                editingId === item.entry.id &&
                                  "bg-primary/10 ring-1 ring-primary",
                              )}
                              data-testid="sprint-item"
                              key={`${item.entry.id}@${item.entry.date}`}
                              onClick={() => onEdit(item.entry)}
                              title={`${item.label}\n누르면 고칠 수 있어요.`}
                              type="button"
                            >
                              {item.milestone ? (
                                <span
                                  aria-hidden="true"
                                  className="text-center font-bold text-orange-11 "
                                >
                                  ◆
                                </span>
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="mx-auto mt-1.5 h-1.5 w-1.5 rounded-full"
                                  style={
                                    color
                                      ? colorDot(color)
                                      : { background: "var(--muted)" }
                                  }
                                />
                              )}
                              <span
                                className={cn(
                                  "break-words",
                                  item.milestone && "font-semibold",
                                )}
                              >
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          aria-label={`${row.label} ${week.id}에 일정 추가`}
                          className="border-0 cursor-pointer flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground opacity-0 hover:bg-foreground/5 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-hover/cell:opacity-100"
                          data-testid="sprint-add"
                          onClick={() => onAdd(row.key, week)}
                          type="button"
                        >
                          <Plus className="h-3 w-3" />
                          추가
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {status === "loading" ? "일정을 불러오는 중…" : null}
        {status === "error"
          ? "일정을 불러오지 못했습니다. 연결을 확인해 주세요."
          : null}
      </p>
    </section>
  );
}
