import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Pencil,
  Plus,
  Trash2,
} from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import {
  type CalendarOccurrence,
  entriesOnDate,
  entryEndDate,
  expandRepeats,
  isAttendee,
  monthGrid,
  monthOfDate,
  occurrenceKey,
  shiftMonth,
  todayKey,
  weekSegments,
} from "../lib/teamCalendar";
import {
  REMINDER_CHOICES,
  channelNoticeText,
  reminderLabel,
  reminderOffsets,
} from "../lib/teamReminders";
import { inputOfEntry, useTeamCalendarRange } from "../lib/useTeamCalendar";
import { useReminderOverrides } from "../lib/useTeamCalendarReminders";
import { postChannelNotice } from "../lib/channelNotice";
import { useNoticeChannels } from "../lib/useNoticeChannels";
import { useTeamMembers } from "../lib/useTeamMembers";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Checkbox } from "../compat/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../compat/ui";
import {
  COLOR_STYLES,
  type Draft,
  EntryForm,
  REPEAT_LABELS,
  copyDraftOf,
  draftError,
  draftOf,
  emptyDraft,
  inputOfDraft,
} from "./EntryForm";
import { DigestPanel } from "./DigestPanel";
import { GoogleSyncSection } from "./GoogleSyncSection";
import { type PollPick, PollsPanel } from "./PollsPanel";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** Bars drawn under the day number; more are counted as "+N" in the cell. */
const MAX_LANES = 3;

/** The seven days of each of the grid's six weeks. */
function weeksOf<T>(cells: T[]): T[][] {
  const weeks: T[][] = [];
  for (let start = 0; start < cells.length; start += 7)
    weeks.push(cells.slice(start, start + 7));
  return weeks;
}

function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return `${year}년 ${value}월`;
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function shortDateLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** When an entry happens: its time, or its first and last day for a span. */
function rangeLabel(entry: CalendarOccurrence): string {
  const end = entryEndDate(entry);
  if (end === entry.date) {
    if (!entry.time) return "하루 종일";
    return entry.endTime ? `${entry.time} ~ ${entry.endTime}` : entry.time;
  }
  const from = `${shortDateLabel(entry.date)}${entry.time ? ` ${entry.time}` : ""}`;
  const to = `${shortDateLabel(end)}${entry.endTime ? ` ${entry.endTime}` : ""}`;
  return `${from} ~ ${to}`;
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
 * Team calendar (team patch): a month grid every member of the community
 * shares, plus meeting-date polls. Any member can add, edit, or delete.
 */
export function TeamCalendarDialog({
  open,
  onOpenChange,
  pubkey,
  relayUrl,
}: TeamCalendarDialogProps) {
  const [tab, setTab] = React.useState<
    "calendar" | "polls" | "digest" | "google"
  >("calendar");
  const [selectedDate, setSelectedDate] = React.useState(() => todayKey());
  const [month, setMonth] = React.useState(() => monthOfDate(todayKey()));
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [unsaved, setUnsaved] = React.useState(false);
  const [mineOnly, setMineOnly] = React.useState(false);
  // Deleting takes two clicks on the same entry (no native confirm dialog).
  const [confirmingKey, setConfirmingKey] = React.useState<string | null>(null);
  const [remindersFor, setRemindersFor] = React.useState<string | null>(null);
  // The entry "복사" picked up; "붙여넣기" opens a copy of it on the selected day.
  const [copied, setCopied] = React.useState<CalendarOccurrence | null>(null);
  const channels = useNoticeChannels();

  const { entries, status, saveEntry, deleteEntry, retry } =
    useTeamCalendarRange(pubkey, relayUrl, month);
  const { members, nameOf } = useTeamMembers();
  const { overrides, setEntryOffsets } = useReminderOverrides(pubkey, relayUrl);

  const weeks = React.useMemo(() => weeksOf(monthGrid(month)), [month]);
  const today = todayKey();
  const shownEntries = React.useMemo(() => {
    const first = weeks[0]?.[0]?.date ?? `${month}-01`;
    const last = weeks[5]?.[6]?.date ?? `${month}-28`;
    const all = expandRepeats(entries, first, last);
    return mineOnly ? all.filter((entry) => isAttendee(entry, pubkey)) : all;
  }, [entries, weeks, month, mineOnly, pubkey]);
  const selectedEntries = entriesOnDate(shownEntries, selectedDate);

  const goToMonth = (next: string) => {
    setMonth(next);
    setDraft(null);
    // Keep a day of the visible month selected.
    setSelectedDate((current) =>
      monthOfDate(current) === next
        ? current
        : monthOfDate(today) === next
          ? today
          : `${next}-01`,
    );
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setDraft(null);
    setConfirmingKey(null);
    setRemindersFor(null);
    if (monthOfDate(date) !== month) setMonth(monthOfDate(date));
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
      () => saveEntry(input),
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
    setConfirmingKey(null);
    void run(() => deleteEntry(entry.id), "일정을 삭제하지 못했습니다.");
  };

  /** Removes one occurrence of a repeating entry. */
  const skipOccurrence = (entry: CalendarOccurrence) => {
    const series = entries.find((candidate) => candidate.id === entry.id);
    if (saving || !series?.repeat) return;
    setConfirmingKey(null);
    void run(
      () =>
        saveEntry({
          ...inputOfEntry(series),
          skip: [...(series.skip ?? []), entry.date],
        }),
      "일정을 삭제하지 못했습니다.",
    );
  };

  const pickFromPoll = (pick: PollPick) => {
    setTab("calendar");
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

  const attendeeLabel = (entry: CalendarOccurrence) =>
    entry.attendees
      ? `참석: ${entry.attendees.map(nameOf).join(", ")}`
      : "참석: 팀 전체";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-4xl"
        data-no-translate=""
        data-testid="team-calendar-dialog"
      >
        <DialogHeader>
          <DialogTitle>팀 캘린더</DialogTitle>
          <DialogDescription>
            이 커뮤니티의 모든 멤버가 함께 보고 고칠 수 있는 일정입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1" role="tablist">
          {(
            [
              ["calendar", "달력"],
              ["polls", "모임 날짜 투표"],
              ["digest", "주간 공지"],
              ["google", "구글 캘린더"],
            ] as const
          ).map(([value, label]) => (
            <Button
              aria-selected={tab === value}
              data-testid={`team-calendar-tab-${value}`}
              key={value}
              onClick={() => setTab(value)}
              role="tab"
              size="sm"
              type="button"
              variant={tab === value ? "secondary" : "ghost"}
            >
              {label}
            </Button>
          ))}
        </div>

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
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            <section aria-label="달력" className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-1">
                <Button
                  aria-label="이전 달"
                  onClick={() => goToMonth(shiftMonth(month, -1))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3
                  aria-live="polite"
                  className="min-w-28 text-center text-sm font-semibold"
                >
                  {monthLabel(month)}
                </h3>
                <Button
                  aria-label="다음 달"
                  onClick={() => goToMonth(shiftMonth(month, 1))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <label className="ml-auto mr-2 flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={mineOnly}
                    data-testid="team-calendar-mine-only"
                    onCheckedChange={(checked) => setMineOnly(checked === true)}
                  />
                  내 일정만
                </label>
                <Button
                  onClick={() => selectDate(today)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  오늘
                </Button>
              </div>

              <div className="grid grid-cols-7 text-center text-xs text-muted">
                {WEEKDAYS.map((weekday) => (
                  <div className="py-1" key={weekday}>
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-line">
                {weeks.map((week) => {
                  const bars = weekSegments(
                    shownEntries,
                    week.map((cell) => cell.date),
                  );
                  const shown = bars.filter((bar) => bar.lane < MAX_LANES);
                  // Bars that did not fit, counted on each day they cover.
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
                          const count = entriesOnDate(
                            shownEntries,
                            cell.date,
                          ).length;
                          const isSelected = cell.date === selectedDate;
                          return (
                            <button
                              aria-label={`${dateLabel(cell.date)}, 일정 ${count}개`}
                              aria-pressed={isSelected}
                              className={cn(
                                "flex h-20 min-w-0 flex-col items-stretch gap-0.5 bg-surface p-1 text-left transition-colors hover:bg-soft focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                                !cell.inMonth && "text-muted/50",
                                isSelected && "bg-hover hover:bg-hover",
                              )}
                              data-testid={`team-calendar-day-${cell.date}`}
                              key={cell.date}
                              onClick={() => selectDate(cell.date)}
                              type="button"
                            >
                              <span className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                                    cell.date === today &&
                                      "bg-[var(--primary)] font-semibold text-on-primary",
                                  )}
                                >
                                  {cell.day}
                                </span>
                                {hidden[column] ? (
                                  <span className="px-1 text-2xs text-muted">
                                    +{hidden[column]}
                                  </span>
                                ) : null}
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
                              "truncate text-2xs leading-4 text-ink",
                              COLOR_STYLES[bar.entry.color ?? ""].bar,
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
                              gridColumn: `${bar.startColumn + 1} / span ${bar.span}`,
                              gridRow: bar.lane + 1,
                            }}
                          >
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

            <section
              aria-label={`${dateLabel(selectedDate)} 일정`}
              className="flex w-full shrink-0 flex-col gap-3 md:w-72"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {dateLabel(selectedDate)}
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

              {unsaved ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-danger bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs">
                  <span>저장되지 않은 변경이 있습니다.</span>
                  <Button
                    disabled={saving}
                    onClick={() => void run(retry, "다시 저장하지 못했습니다.")}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    다시 저장
                  </Button>
                </div>
              ) : null}

              {draft ? (
                <EntryForm
                  channels={channels}
                  draft={draft}
                  members={members}
                  onCancel={() => setDraft(null)}
                  onChange={setDraft}
                  onSubmit={() => void submitDraft()}
                  saving={saving}
                />
              ) : selectedEntries.length === 0 ? (
                <p className="text-sm text-muted">이 날에는 일정이 없습니다.</p>
              ) : (
                <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                  {selectedEntries.map((entry) => {
                    const key = occurrenceKey(entry);
                    const offsets = reminderOffsets(entry, overrides);
                    const mine = isAttendee(entry, pubkey);
                    return (
                      <li
                        className="rounded-lg border border-line px-3 py-2"
                        data-testid="team-calendar-entry"
                        key={key}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-start gap-1.5 break-words text-sm font-medium">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                  COLOR_STYLES[entry.color ?? ""].dot,
                                )}
                              />
                              {entry.title}
                            </p>
                            <p className="text-xs text-muted">
                              {rangeLabel(entry)}
                              {entry.repeat
                                ? ` · ${REPEAT_LABELS[entry.repeat.every]} 반복`
                                : ""}
                            </p>
                          </div>
                          <Button
                            aria-label={`${entry.title} 복사`}
                            data-testid="team-calendar-copy"
                            onClick={() => {
                              setCopied(entry);
                              toast("일정을 복사했습니다.", {
                                description:
                                  '붙여넣을 날짜를 누른 뒤 "붙여넣기"를 누르세요.',
                              });
                            }}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Copy />
                          </Button>
                          <Button
                            aria-label={`${entry.title} 수정`}
                            disabled={saving}
                            onClick={() => setDraft(draftOf(entry))}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil />
                          </Button>
                          <Button
                            aria-label={`${entry.title} 삭제`}
                            disabled={saving}
                            onClick={() =>
                              setConfirmingKey(
                                confirmingKey === key ? null : key,
                              )
                            }
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        {confirmingKey === key ? (
                          <div className="mt-1 flex flex-wrap justify-end gap-1">
                            {entry.repeat ? (
                              <Button
                                disabled={saving}
                                onClick={() => skipOccurrence(entry)}
                                size="xs"
                                type="button"
                                variant="outline"
                              >
                                이 날만 삭제
                              </Button>
                            ) : null}
                            <Button
                              aria-label={`${entry.title} 삭제 확인`}
                              disabled={saving}
                              onClick={() => removeEntry(entry)}
                              size="xs"
                              type="button"
                              variant="destructive"
                            >
                              {entry.repeat ? "반복 전체 삭제" : "삭제 확인"}
                            </Button>
                          </div>
                        ) : null}
                        <p className="mt-1 break-words text-xs text-muted">
                          {attendeeLabel(entry)}
                        </p>
                        {entry.note ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">
                            {entry.note}
                          </p>
                        ) : null}
                        {mine ? (
                          <div className="mt-1 text-xs text-muted">
                            <button
                              className="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-hidden"
                              data-testid="team-calendar-reminders-toggle"
                              onClick={() =>
                                setRemindersFor(
                                  remindersFor === key ? null : key,
                                )
                              }
                              type="button"
                            >
                              내 알림:{" "}
                              {offsets.length === 0
                                ? "없음"
                                : offsets.map(reminderLabel).join(", ")}
                            </button>
                            {remindersFor === key ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {REMINDER_CHOICES.map((choice) => {
                                  const on = offsets.includes(choice);
                                  return (
                                    <Button
                                      aria-pressed={on}
                                      key={choice}
                                      onClick={() =>
                                        setEntryOffsets(
                                          entry.id,
                                          on
                                            ? offsets.filter(
                                                (offset) => offset !== choice,
                                              )
                                            : [...offsets, choice],
                                        )
                                      }
                                      size="xs"
                                      type="button"
                                      variant={on ? "secondary" : "outline"}
                                    >
                                      {reminderLabel(choice)}
                                    </Button>
                                  );
                                })}
                                <Button
                                  onClick={() =>
                                    setEntryOffsets(entry.id, null)
                                  }
                                  size="xs"
                                  type="button"
                                  variant="ghost"
                                >
                                  기본값으로
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
