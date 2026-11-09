import {
  CalendarDays,
  ClipboardPaste,
  Download,
  KanbanSquare,
  Plus,
  Upload,
  X,
} from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import { postChannelNotice } from "../lib/channelNotice";
import { availabilityOn } from "../lib/teamAvailability";
import {
  type CalendarColor,
  type CalendarOccurrence,
  entriesOnDate,
  expandRepeats,
  isAttendee,
  monthGrid,
  monthOfDate,
  monthsAround,
  todayKey,
} from "../lib/teamCalendar";
import { channelNoticeText } from "../lib/teamReminders";
import {
  type SprintWeek,
  defaultPlan,
  planMonths,
  weekId,
  weekIndexOf,
} from "../lib/teamSprint";
import { inputOfEntry, useTeamCalendarMonths } from "../lib/useTeamCalendar";
import { useReminderOverrides } from "../lib/useTeamCalendarReminders";
import { useNoticeChannels } from "../lib/useNoticeChannels";
import { useTeamMembers } from "../lib/useTeamMembers";
import { useTeamAvailability, useTeamSprintPlan } from "../lib/useTeamSprint";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../compat/ui";
import { AvailabilityPanel } from "./AvailabilityPanel";
import { CalendarGrid, dateLabel, weeksOf } from "./CalendarGrid";
import { DayPanel } from "./DayPanel";
import { DigestPanel } from "./DigestPanel";
import {
  type Draft,
  EntryForm,
  copyDraftOf,
  draftError,
  draftOf,
  emptyDraft,
  inputOfDraft,
} from "./EntryForm";
import { ExportPanel } from "./ExportPanel";
import { GoogleSyncSection } from "./GoogleSyncSection";
import { ImportPanel } from "./ImportPanel";
import { type PollPick, PollsPanel } from "./PollsPanel";
import { SprintBoard } from "./SprintBoard";
import { SprintPlanForm } from "./SprintPlanForm";

type Tab = "board" | "people" | "polls" | "digest" | "google";
type View = "sprint" | "calendar";
type Panel = "export" | "import" | "plan" | null;

const VIEW_KEY = "buzz-team-calendar-view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "calendar"
      ? "calendar"
      : "sprint";
  } catch {
    return "sprint";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type TeamCalendarDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
  relayUrl: string;
};

/**
 * Team calendar (team patch): the community's shared schedule shown two
 * ways that always agree — a sprint board (departments × weeks, the
 * production master plan's layout) and a month calendar — plus member
 * schedules, meeting-date polls, the weekly digest and Google push.
 */
export function TeamCalendarDialog({
  open,
  onOpenChange,
  pubkey,
  relayUrl,
}: TeamCalendarDialogProps) {
  const today = todayKey();
  const [tab, setTab] = React.useState<Tab>("board");
  const [view, setViewState] = React.useState<View>(readView);
  const [panel, setPanel] = React.useState<Panel>(null);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [month, setMonth] = React.useState(() => monthOfDate(today));
  const [draft, setDraftState] = React.useState<Draft | null>(null);
  // The occurrence the open draft edits (for deleting it from the sprint board).
  const [editing, setEditing] = React.useState<CalendarOccurrence | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const setDraft = (next: Draft | null) => {
    setDraftState(next);
    setConfirmDelete(false);
    if (!next?.id) setEditing(null);
  };
  const [saving, setSaving] = React.useState(false);
  const [unsaved, setUnsaved] = React.useState(false);
  const [mineOnly, setMineOnly] = React.useState(false);
  const [showPeople, setShowPeople] = React.useState(true);
  // The entry "복사" picked up; "붙여넣기" opens a copy of it on the selected day.
  const [copied, setCopied] = React.useState<CalendarOccurrence | null>(null);
  const channels = useNoticeChannels();

  const setView = (next: View) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Remembering the view is a convenience only.
    }
  };

  const sprint = useTeamSprintPlan(pubkey, relayUrl);
  const plan = React.useMemo(
    () => sprint.plan ?? defaultPlan(today, pubkey),
    [sprint.plan, today, pubkey],
  );
  const availability = useTeamAvailability(pubkey, relayUrl);
  const { members, nameOf } = useTeamMembers();
  const { overrides, setEntryOffsets } = useReminderOverrides(pubkey, relayUrl);

  // Both views read the same months, so an edit in one shows in the other.
  const wantedMonths = React.useMemo(
    () => [...new Set([...planMonths(plan), ...monthsAround(month)])],
    [plan, month],
  );
  const calendar = useTeamCalendarMonths(pubkey, relayUrl, wantedMonths);
  const entries = React.useMemo(
    () =>
      mineOnly
        ? calendar.entries.filter((entry) => isAttendee(entry, pubkey))
        : calendar.entries,
    [calendar.entries, mineOnly, pubkey],
  );

  const deptColor = React.useMemo(
    () => new Map(plan.depts.map((dept) => [dept.key, dept.color])),
    [plan.depts],
  );
  const colorOfDept = (key: string | undefined): CalendarColor | "" =>
    (key ? deptColor.get(key) : undefined) ?? "";
  const deptLabel = (key: string) =>
    plan.depts.find((dept) => dept.key === key)?.label;

  const gridWeeks = React.useMemo(() => weeksOf(monthGrid(month)), [month]);
  const monthEntries = React.useMemo(() => {
    const first = gridWeeks[0]?.[0]?.date ?? `${month}-01`;
    const last = gridWeeks[5]?.[6]?.date ?? `${month}-28`;
    return expandRepeats(entries, first, last);
  }, [entries, gridWeeks, month]);
  const selectedEntries = entriesOnDate(
    expandRepeats(entries, selectedDate, selectedDate),
    selectedDate,
  );

  /** Selecting a day moves both views: the month view and the sprint week. */
  const selectDate = (date: string) => {
    setSelectedDate(date);
    setDraft(null);
    if (monthOfDate(date) !== month) setMonth(monthOfDate(date));
  };

  const goToMonth = (next: string) => {
    setMonth(next);
    setDraft(null);
    setSelectedDate((current) =>
      monthOfDate(current) === next
        ? current
        : monthOfDate(today) === next
          ? today
          : `${next}-01`,
    );
  };

  const run = async (action: () => Promise<void>, failure: string) => {
    setSaving(true);
    try {
      await action();
      setUnsaved(false);
      return true;
    } catch (error) {
      setUnsaved(true);
      toast.error(errorMessage(error, failure));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitDraft = async () => {
    if (!draft || saving) return;
    if (draft.title.trim().length === 0 || draftError(draft)) return;
    const input = inputOfDraft(draft);
    const saved = await run(
      () => calendar.saveEntry(input),
      "일정을 저장하지 못했습니다.",
    );
    if (!saved) return;
    if (draft.notifyNow && input.notify?.channelId) {
      // The entry is saved either way; a failed post only loses the notice.
      void postChannelNotice(
        relayUrl,
        input.notify.channelId,
        channelNoticeText(input, draft.id ? "일정 변경" : "새 일정"),
      ).catch(() => toast.error("채널에 일정을 알리지 못했습니다."));
    }
    setDraft(null);
    selectDate(input.date);
  };

  /** Removes the whole entry (for a repeating entry: every occurrence). */
  const removeEntry = (entry: CalendarOccurrence) => {
    if (saving) return;
    if (draft?.id === entry.id) setDraft(null);
    void run(
      () => calendar.deleteEntry(entry.id),
      "일정을 삭제하지 못했습니다.",
    );
  };

  /** Removes one occurrence of a repeating entry. */
  const skipOccurrence = (entry: CalendarOccurrence) => {
    const series = calendar.entries.find(
      (candidate) => candidate.id === entry.id,
    );
    if (saving || !series?.repeat) return;
    void run(
      () =>
        calendar.saveEntry({
          ...inputOfEntry(series),
          skip: [...(series.skip ?? []), entry.date],
        }),
      "일정을 삭제하지 못했습니다.",
    );
  };

  const pickFromPoll = (pick: PollPick) => {
    setTab("board");
    setView("calendar");
    selectDate(pick.date);
    setDraft({
      ...emptyDraft(pick.date),
      title: pick.title,
      time: pick.time ?? "",
      endTime: pick.time ? (pick.endTime ?? "") : "",
      everyone: false,
      attendees: pick.attendees,
    });
  };

  /** "+ 추가" in a sprint cell: a week-long task of that department. */
  const addInSprint = (deptKey: string, week: SprintWeek) => {
    setSelectedDate(week.start);
    if (monthOfDate(week.start) !== month) setMonth(monthOfDate(week.start));
    setDraft({ ...emptyDraft(week.start), endDate: week.end, dept: deptKey });
  };

  const editEntry = (entry: CalendarOccurrence) => {
    setSelectedDate(entry.date);
    if (monthOfDate(entry.date) !== month) setMonth(monthOfDate(entry.date));
    setDraft(draftOf(entry));
    setEditing(entry);
  };

  const copyEntry = (entry: CalendarOccurrence) => {
    setCopied(entry);
    toast("일정을 복사했습니다.", {
      description: '붙여넣을 날짜를 누른 뒤 "붙여넣기"를 누르세요.',
    });
  };

  const people = availability.people;
  const dayAvailability = showPeople
    ? availabilityOn(people, selectedDate)
    : null;
  const selectedWeek = weekIndexOf(plan, selectedDate);

  const unsavedBanner = unsaved ? (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
      <span>저장되지 않은 변경이 있습니다.</span>
      <Button
        disabled={saving}
        onClick={() => void run(calendar.retry, "다시 저장하지 못했습니다.")}
        size="xs"
        type="button"
        variant="outline"
      >
        다시 저장
      </Button>
    </div>
  ) : null;

  const entryForm = draft ? (
    <EntryForm
      channels={channels}
      depts={plan.depts}
      draft={draft}
      members={members}
      onCancel={() => setDraft(null)}
      onChange={setDraft}
      onSubmit={() => void submitDraft()}
      saving={saving}
    />
  ) : null;

  const panelTitle =
    panel === "export"
      ? "배포 · 파일로 내보내기"
      : panel === "import"
        ? "가져오기"
        : panel === "plan"
          ? "스프린트 보드 설정"
          : "";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[94vh] w-[min(96vw,1500px)] max-w-[min(96vw,1500px)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-[min(96vw,1500px)]"
        data-no-translate=""
        data-testid="team-calendar-dialog"
      >
        <DialogHeader>
          <DialogTitle>팀 캘린더</DialogTitle>
          <DialogDescription>
            스프린트 보드와 달력은 같은 일정을 두 가지로 보여 줍니다. 한쪽에서
            고치면 다른 쪽에도 바로 반영돼요. 이 커뮤니티의 모든 멤버가 함께
            보고 고칠 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div
            aria-label="보기 방식"
            className="flex rounded-lg bg-muted p-0.5"
            role="tablist"
          >
            {(
              [
                ["sprint", "스프린트", KanbanSquare],
                ["calendar", "달력", CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => {
              const active = tab === "board" && view === value;
              return (
                <button
                  aria-selected={active}
                  className={cn(
                    "border-0 cursor-pointer flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                    active &&
                      "bg-background font-semibold text-foreground shadow-sm",
                  )}
                  data-testid={`team-calendar-view-${value}`}
                  key={value}
                  onClick={() => {
                    setTab("board");
                    setView(value);
                    setPanel((current) =>
                      current === "plan" ? null : current,
                    );
                  }}
                  role="tab"
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="tablist">
            {(
              [
                ["people", "팀원 일정"],
                ["polls", "모임 날짜 투표"],
                ["digest", "주간 공지"],
                ["google", "구글 캘린더"],
              ] as const
            ).map(([value, label]) => (
              <Button
                aria-selected={tab === value}
                data-testid={`team-calendar-tab-${value}`}
                key={value}
                onClick={() => {
                  setTab(value);
                  setPanel(null);
                }}
                role="tab"
                size="sm"
                type="button"
                variant={tab === value ? "secondary" : "ghost"}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              data-testid="team-calendar-import"
              onClick={() => setPanel(panel === "import" ? null : "import")}
              size="sm"
              type="button"
              variant={panel === "import" ? "secondary" : "outline"}
            >
              <Upload className="h-4 w-4" />
              가져오기
            </Button>
            <Button
              data-testid="team-calendar-export"
              onClick={() => setPanel(panel === "export" ? null : "export")}
              size="sm"
              type="button"
              variant={panel === "export" ? "secondary" : "default"}
            >
              <Download className="h-4 w-4" />
              배포
            </Button>
          </div>
        </div>

        {panel ? (
          <section
            aria-label={panelTitle}
            className="rounded-xl border border-border/70 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{panelTitle}</h3>
              <Button
                aria-label="닫기"
                onClick={() => setPanel(null)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </div>
            {panel === "export" ? (
              <ExportPanel
                initialView={view}
                month={month}
                onClose={() => setPanel(null)}
                people={people}
                plan={plan}
                pubkey={pubkey}
                relayUrl={relayUrl}
                today={today}
              />
            ) : panel === "import" ? (
              <ImportPanel
                hasPlan={sprint.plan !== null}
                onClose={() => setPanel(null)}
                onSavePeople={availability.savePeople}
                onImported={() => {
                  // Wait a moment so months opened for a new plan read too.
                  window.setTimeout(() => {
                    calendar.refresh();
                    sprint.refresh();
                    availability.refresh();
                  }, 300);
                }}
                onSavePlan={sprint.savePlan}
                pubkey={pubkey}
                relayUrl={relayUrl}
              />
            ) : (
              <SprintPlanForm
                initial={plan}
                onCancel={() => setPanel(null)}
                onSubmit={(next) =>
                  void run(
                    () => sprint.savePlan(next),
                    "설정을 저장하지 못했습니다.",
                  ).then((ok) => {
                    if (ok) setPanel(null);
                  })
                }
                saving={saving}
              />
            )}
          </section>
        ) : null}

        {tab === "google" ? (
          <GoogleSyncSection pubkey={pubkey} relayUrl={relayUrl} />
        ) : tab === "digest" ? (
          <DigestPanel pubkey={pubkey} relayUrl={relayUrl} />
        ) : tab === "polls" ? (
          <PollsPanel
            members={members}
            nameOf={nameOf}
            onPick={pickFromPoll}
            pubkey={pubkey}
            relayUrl={relayUrl}
          />
        ) : tab === "people" ? (
          <AvailabilityPanel
            members={members}
            nameOf={nameOf}
            onDelete={availability.deletePerson}
            onSave={(person) => availability.savePeople([person])}
            people={people}
            pubkey={pubkey}
            status={availability.status}
            today={today}
          />
        ) : view === "sprint" ? (
          <div className="flex flex-col gap-4 @3xl:flex-row">
            <div className="min-w-0 flex-1">
              <SprintBoard
                editingId={draft?.id}
                entries={entries}
                isDefaultPlan={
                  sprint.plan === null && sprint.status !== "loading"
                }
                onAdd={addInSprint}
                onEdit={editEntry}
                onEditPlan={() => setPanel("plan")}
                onSelectWeek={(week) => selectDate(week.start)}
                plan={plan}
                selectedDate={selectedDate}
                status={calendar.status}
                today={today}
              />
            </div>
            {draft || unsaved ? (
              <aside
                aria-label="일정 편집"
                className="flex w-full shrink-0 flex-col gap-3 @3xl:w-80"
              >
                {draft ? (
                  <h3
                    className="text-sm font-semibold"
                    data-testid="sprint-editor-title"
                  >
                    {draft.id ? "일정 수정" : "일정 추가"}
                    {draft.dept
                      ? ` · ${deptLabel(draft.dept) ?? draft.dept}`
                      : ""}
                    {selectedWeek >= 0 ? ` · ${weekId(selectedWeek)}` : ""}
                  </h3>
                ) : null}
                {unsavedBanner}
                {entryForm}
                {draft?.id && editing?.id === draft.id ? (
                  <div className="flex flex-wrap justify-end gap-1 border-t border-border/60 pt-2">
                    {confirmDelete ? (
                      <>
                        {editing.repeat ? (
                          <Button
                            disabled={saving}
                            onClick={() => {
                              skipOccurrence(editing);
                              setDraft(null);
                            }}
                            size="xs"
                            type="button"
                            variant="outline"
                          >
                            이 날만 삭제
                          </Button>
                        ) : null}
                        <Button
                          data-testid="sprint-delete-confirm"
                          disabled={saving}
                          onClick={() => removeEntry(editing)}
                          size="xs"
                          type="button"
                          variant="destructive"
                        >
                          {editing.repeat ? "반복 전체 삭제" : "삭제 확인"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        data-testid="sprint-delete"
                        disabled={saving}
                        onClick={() => setConfirmDelete(true)}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        이 일정 삭제
                      </Button>
                    )}
                  </div>
                ) : null}
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4 @3xl:flex-row">
            <CalendarGrid
              colorOfDept={colorOfDept}
              entries={monthEntries}
              mineOnly={mineOnly}
              month={month}
              onMineOnly={setMineOnly}
              onMonth={goToMonth}
              onSelectDate={selectDate}
              onShowPeople={setShowPeople}
              people={people}
              selectedDate={selectedDate}
              showPeople={showPeople}
              status={calendar.statusOf(monthsAround(month))}
              today={today}
            />
            <section
              aria-label={`${dateLabel(selectedDate)} 일정`}
              className="flex w-full shrink-0 flex-col gap-3 @3xl:w-80"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {dateLabel(selectedDate)}
                  {selectedWeek >= 0 ? (
                    <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                      {weekId(selectedWeek)}
                    </span>
                  ) : null}
                </h3>
                {draft || !copied ? null : (
                  <Button
                    aria-label={`${copied.title} 붙여넣기`}
                    data-testid="team-calendar-paste"
                    onClick={() => setDraft(copyDraftOf(copied, selectedDate))}
                    size="sm"
                    title={`"${copied.title}"을(를) 이 날에 붙여넣기`}
                    type="button"
                    variant="outline"
                  >
                    <ClipboardPaste className="h-4 w-4" />
                    붙여넣기
                  </Button>
                )}
                {draft ? null : (
                  <Button
                    data-testid="team-calendar-add"
                    onClick={() => setDraft(emptyDraft(selectedDate))}
                    size="sm"
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    일정 추가
                  </Button>
                )}
              </div>
              {unsavedBanner}
              {draft ? (
                entryForm
              ) : (
                <DayPanel
                  availability={dayAvailability}
                  colorOfDept={colorOfDept}
                  deptLabel={deptLabel}
                  entries={selectedEntries}
                  nameOf={nameOf}
                  onCopy={copyEntry}
                  onEdit={editEntry}
                  onReminders={setEntryOffsets}
                  onRemove={removeEntry}
                  onSkip={skipOccurrence}
                  overrides={overrides}
                  pubkey={pubkey}
                  saving={saving}
                />
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
