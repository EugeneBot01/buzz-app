import { Copy, Pencil, Trash2 } from "../compat/icons";
import * as React from "react";

import {
  type DayAvailability,
  RULE_KIND_SHORT,
  ruleTimeLabel,
} from "../lib/teamAvailability";
import {
  type CalendarOccurrence,
  entryEndDate,
  isAttendee,
  occurrenceKey,
} from "../lib/teamCalendar";
import {
  REMINDER_CHOICES,
  reminderLabel,
  reminderOffsets,
} from "../lib/teamReminders";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { KIND_BADGE } from "./AvailabilityPanel";
import { type ColorChoice, colorDot, REPEAT_LABELS } from "./EntryForm";

function shortDateLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** When an entry happens: its time, or its first and last day for a span. */
export function rangeLabel(entry: CalendarOccurrence): string {
  const end = entryEndDate(entry);
  if (end === entry.date) {
    if (!entry.time) return "하루 종일";
    return entry.endTime ? `${entry.time} ~ ${entry.endTime}` : entry.time;
  }
  const from = `${shortDateLabel(entry.date)}${entry.time ? ` ${entry.time}` : ""}`;
  const to = `${shortDateLabel(end)}${entry.endTime ? ` ${entry.endTime}` : ""}`;
  return `${from} ~ ${to}`;
}

/** The selected day's entries and, optionally, who is unavailable that day. */
export function DayPanel({
  entries,
  availability,
  pubkey,
  saving,
  overrides,
  nameOf,
  deptLabel,
  colorOfDept,
  onEdit,
  onCopy,
  onRemove,
  onSkip,
  onReminders,
}: {
  entries: CalendarOccurrence[];
  /** `null` when member schedules are not shown. */
  availability: DayAvailability[] | null;
  pubkey: string;
  saving: boolean;
  overrides: Parameters<typeof reminderOffsets>[1];
  nameOf: (pubkey: string) => string;
  deptLabel: (key: string) => string | undefined;
  colorOfDept: (key: string | undefined) => ColorChoice;
  onEdit: (entry: CalendarOccurrence) => void;
  onCopy: (entry: CalendarOccurrence) => void;
  onRemove: (entry: CalendarOccurrence) => void;
  onSkip: (entry: CalendarOccurrence) => void;
  onReminders: (entryId: string, offsets: number[] | null) => void;
}) {
  // Deleting takes two clicks on the same entry (no native confirm dialog).
  const [confirmingKey, setConfirmingKey] = React.useState<string | null>(null);
  const [remindersFor, setRemindersFor] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          이 날에는 일정이 없습니다.
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {entries.map((entry) => {
            const key = occurrenceKey(entry);
            const offsets = reminderOffsets(entry, overrides);
            const mine = isAttendee(entry, pubkey);
            const dept = entry.dept ? deptLabel(entry.dept) : undefined;
            return (
              <li
                className="rounded-lg border border-border/60 px-3 py-2"
                data-testid="team-calendar-entry"
                key={key}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-start gap-1.5 break-words text-sm font-medium">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={colorDot(entry.color ?? colorOfDept(entry.dept))}
                      />
                      <span>
                        {entry.milestone ? (
                          <span className="mr-1 text-orange-11 ">◆</span>
                        ) : null}
                        {entry.title}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rangeLabel(entry)}
                      {entry.repeat
                        ? ` · ${REPEAT_LABELS[entry.repeat.every]} 반복`
                        : ""}
                      {dept
                        ? ` · ${dept}`
                        : entry.dept
                          ? ` · ${entry.dept}`
                          : ""}
                    </p>
                  </div>
                  <Button
                    aria-label={`${entry.title} 복사`}
                    data-testid="team-calendar-copy"
                    onClick={() => onCopy(entry)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Copy />
                  </Button>
                  <Button
                    aria-label={`${entry.title} 수정`}
                    disabled={saving}
                    onClick={() => onEdit(entry)}
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
                      setConfirmingKey(confirmingKey === key ? null : key)
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
                        onClick={() => {
                          setConfirmingKey(null);
                          onSkip(entry);
                        }}
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
                      onClick={() => {
                        setConfirmingKey(null);
                        onRemove(entry);
                      }}
                      size="xs"
                      type="button"
                      variant="destructive"
                    >
                      {entry.repeat ? "반복 전체 삭제" : "삭제 확인"}
                    </Button>
                  </div>
                ) : null}
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {entry.attendees
                    ? `참석: ${entry.attendees.map(nameOf).join(", ")}`
                    : "참석: 팀 전체"}
                </p>
                {entry.note ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {entry.note}
                  </p>
                ) : null}
                {mine ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <button
                      className="border-0 rounded-none p-0 cursor-pointer underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-hidden"
                      data-testid="team-calendar-reminders-toggle"
                      onClick={() =>
                        setRemindersFor(remindersFor === key ? null : key)
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
                                onReminders(
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
                          onClick={() => onReminders(entry.id, null)}
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
      {availability ? (
        <section aria-label="이 날 팀원 일정" data-testid="day-availability">
          <h4 className="mb-1 text-xs font-semibold">
            팀원 일정{" "}
            <span className="font-normal text-muted-foreground">
              불가{" "}
              {availability.filter((item) => item.status === "busy").length}명 ·
              조율{" "}
              {
                availability.filter((item) => item.status === "tentative")
                  .length
              }
              명
            </span>
          </h4>
          {availability.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              이 날 등록된 팀원 일정이 없습니다 (모두 가능).
            </p>
          ) : (
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-xs">
              {availability.map((item) => (
                <li className="flex items-start gap-2" key={item.person.id}>
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1 text-xs font-semibold",
                      KIND_BADGE[item.status],
                    )}
                  >
                    {item.allDayBusy ? "종일" : RULE_KIND_SHORT[item.status]}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{item.person.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {item.rules
                        .map(
                          (rule) =>
                            `${ruleTimeLabel(rule)} ${RULE_KIND_SHORT[rule.kind]}(${rule.title})`,
                        )
                        .join(", ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
