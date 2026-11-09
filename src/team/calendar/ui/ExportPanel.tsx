import { Download } from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import { buildCalendarBackup } from "../lib/calendarImport";
import { pagesToPdf, pagesToPng } from "../lib/exportCanvas";
import { buildDocx, fileSafe } from "../lib/exportFormats";
import {
  type BoardPage,
  calendarPages,
  entriesCsv,
  sprintPages,
} from "../lib/exportModel";
import type { TeamPerson } from "../lib/teamAvailability";
import { addDays, shiftMonth } from "../lib/teamCalendar";
import {
  type SprintPlan,
  planEnd,
  planMonths,
  sprintWeeks,
} from "../lib/teamSprint";
import { type ExportKind, saveExportFile } from "../lib/saveExport";
import { fetchEntriesForMonths } from "../lib/useTeamCalendar";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import { SELECT_CLASS } from "./EntryForm";

type View = "sprint" | "calendar";

const FORMATS: Array<{ kind: ExportKind; label: string; hint: string }> = [
  { kind: "png", label: "PNG 이미지", hint: "한 장의 이미지 (메신저 공유용)" },
  { kind: "pdf", label: "PDF", hint: "A4 가로, 인쇄용" },
  { kind: "docx", label: "Word (DOCX)", hint: "표로 들어가서 고칠 수 있어요" },
  { kind: "csv", label: "CSV (엑셀)", hint: "일정 목록" },
  { kind: "json", label: "백업 (JSON)", hint: "다시 가져오기용 전체 백업" },
];

const MAX_EXPORT_MONTHS = 12;

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (
    let month = from;
    month <= to && months.length < MAX_EXPORT_MONTHS;
    month = shiftMonth(month, 1)
  )
    months.push(month);
  return months;
}

/**
 * "배포" (team patch): saves the sprint board or the month calendar as PNG,
 * PDF or Word, the entries as CSV, or everything as a backup file.
 */
export function ExportPanel({
  pubkey,
  relayUrl,
  plan,
  people,
  initialView,
  month,
  today,
  onClose,
}: {
  pubkey: string;
  relayUrl: string;
  plan: SprintPlan;
  people: TeamPerson[];
  initialView: View;
  month: string;
  today: string;
  onClose: () => void;
}) {
  const weeks = sprintWeeks(plan);
  const [view, setView] = React.useState<View>(initialView);
  const [kind, setKind] = React.useState<ExportKind>("png");
  const [fromWeek, setFromWeek] = React.useState(0);
  const [toWeek, setToWeek] = React.useState(plan.weeks - 1);
  const [fromMonth, setFromMonth] = React.useState(month);
  const [toMonth, setToMonth] = React.useState(month);
  const [busy, setBusy] = React.useState(false);

  const deptLabel = (key: string) =>
    plan.depts.find((dept) => dept.key === key)?.label;
  const months = monthsBetween(fromMonth, toMonth);
  const rangeError =
    view === "sprint"
      ? fromWeek > toWeek
        ? "끝 주가 시작 주보다 빠릅니다."
        : null
      : !fromMonth || !toMonth || fromMonth > toMonth
        ? "끝 달이 시작 달보다 빠릅니다."
        : shiftMonth(fromMonth, MAX_EXPORT_MONTHS - 1) < toMonth
          ? `한 번에 ${MAX_EXPORT_MONTHS}개월까지 내보낼 수 있습니다.`
          : null;

  const filename = () => {
    const base =
      view === "sprint"
        ? `${plan.title} ${weeks[fromWeek]?.id}-${weeks[toWeek]?.id}`
        : `팀 캘린더 ${fromMonth}${toMonth !== fromMonth ? `~${toMonth}` : ""}`;
    return `${fileSafe(kind === "json" ? `${plan.title} 백업 ${today}` : base)}.${kind}`;
  };

  const build = async (): Promise<Uint8Array> => {
    const neededMonths =
      kind === "json" || view === "sprint" ? planMonths(plan) : months;
    const fetchMonths =
      view === "calendar" && kind !== "json"
        ? [shiftMonth(months[0] ?? month, -1), ...months]
        : neededMonths;
    const entries = await fetchEntriesForMonths(pubkey, relayUrl, fetchMonths);
    if (kind === "json") {
      return new TextEncoder().encode(
        buildCalendarBackup({ plan, entries, people }),
      );
    }
    if (kind === "csv") {
      const from =
        view === "sprint"
          ? (weeks[fromWeek]?.start ?? plan.start)
          : `${months[0]}-01`;
      const to =
        view === "sprint"
          ? (weeks[toWeek]?.end ?? planEnd(plan))
          : addDays(
              `${shiftMonth(months[months.length - 1] ?? month, 1)}-01`,
              -1,
            );
      return new TextEncoder().encode(
        entriesCsv({ entries, from, to, deptLabel }),
      );
    }
    const pages: BoardPage[] =
      view === "sprint"
        ? sprintPages({
            plan,
            entries,
            fromWeek,
            toWeek,
            today,
            paginate: kind !== "png",
          })
        : calendarPages({
            title: plan.title,
            months,
            entries,
            today,
            deptLabel,
          });
    if (kind === "png") return pagesToPng(pages);
    if (kind === "pdf") return pagesToPdf(pages);
    return buildDocx(pages);
  };

  const run = async () => {
    if (busy || rangeError) return;
    setBusy(true);
    try {
      const bytes = await build();
      const saved = await saveExportFile(bytes, filename(), kind);
      if (saved)
        toast.success("파일을 저장했습니다.", { description: filename() });
    } catch (error) {
      toast.error("파일을 만들지 못했습니다.", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs" data-testid="export-panel">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">1. 어떤 모양으로</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["sprint", "스프린트 보드", "부서 × 주차 표 (마스터 플랜 형식)"],
              ["calendar", "달력", "월별 달력"],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              aria-pressed={view === value}
              className={cn(
                "border-0 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors hover:bg-soft",
                view === value
                  ? "border-[var(--primary)] bg-[var(--surface-accent)]"
                  : "border-line",
              )}
              data-testid={`export-view-${value}`}
              disabled={kind === "json"}
              key={value}
              onClick={() => setView(value)}
              type="button"
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">2. 범위</legend>
        {kind === "json" ? (
          <p className="text-muted">
            백업은 보드 설정, 보드 기간의 모든 일정, 반복 일정, 팀원 일정을 한
            파일로 담습니다.
          </p>
        ) : view === "sprint" ? (
          <div className="flex items-center gap-2">
            <select
              aria-label="시작 주"
              className={SELECT_CLASS}
              data-testid="export-from-week"
              onChange={(event) => setFromWeek(Number(event.target.value))}
              value={fromWeek}
            >
              {weeks.map((week) => (
                <option key={week.id} value={week.index}>
                  {week.id} ({week.start.slice(5)})
                </option>
              ))}
            </select>
            ~
            <select
              aria-label="끝 주"
              className={SELECT_CLASS}
              data-testid="export-to-week"
              onChange={(event) => setToWeek(Number(event.target.value))}
              value={toWeek}
            >
              {weeks.map((week) => (
                <option key={week.id} value={week.index}>
                  {week.id} ({week.end.slice(5)})
                </option>
              ))}
            </select>
            <Button
              onClick={() => {
                setFromWeek(0);
                setToWeek(plan.weeks - 1);
              }}
              size="xs"
              type="button"
              variant="ghost"
            >
              전체
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              aria-label="시작 달"
              className="w-40"
              data-testid="export-from-month"
              onChange={(event) => setFromMonth(event.target.value)}
              type="month"
              value={fromMonth}
            />
            ~
            <Input
              aria-label="끝 달"
              className="w-40"
              data-testid="export-to-month"
              onChange={(event) => setToMonth(event.target.value)}
              type="month"
              value={toMonth}
            />
          </div>
        )}
        {rangeError && kind !== "json" ? (
          <p className="text-danger" role="alert">
            {rangeError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold">3. 파일 형식</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {FORMATS.map((format) => (
            <button
              aria-pressed={kind === format.kind}
              className={cn(
                "border-0 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors hover:bg-soft",
                kind === format.kind
                  ? "border-[var(--primary)] bg-[var(--surface-accent)]"
                  : "border-line",
              )}
              data-testid={`export-kind-${format.kind}`}
              key={format.kind}
              onClick={() => setKind(format.kind)}
              type="button"
            >
              <span className="block text-sm font-semibold">
                {format.label}
              </span>
              <span className="text-muted">{format.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="min-w-0 truncate text-muted">{filename()}</p>
        <div className="flex gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            닫기
          </Button>
          <Button
            data-testid="export-run"
            disabled={busy || (rangeError !== null && kind !== "json")}
            onClick={() => void run()}
            size="sm"
            type="button"
          >
            <Download className="h-4 w-4" />
            {busy ? "만드는 중…" : "다운로드"}
          </Button>
        </div>
      </div>
    </div>
  );
}
