import type * as React from "react";

import {
  type CalendarColor,
  type CalendarOccurrence,
  CALENDAR_COLORS,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  NOTIFY_BEFORE_CHOICES,
  type RepeatEvery,
  REPEAT_CHOICES,
  addDays,
  daysBetween,
  entryEndDate,
  validateRange,
} from "../lib/teamCalendar";
import { reminderLabel } from "../lib/teamReminders";
import type { CalendarEntryInput } from "../lib/useTeamCalendar";
import type { TeamMember } from "../lib/useTeamMembers";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import { Textarea } from "../compat/ui";
import { MemberPicker } from "./MemberPicker";

/** An empty color is the default look. */
export type ColorChoice = CalendarColor | "";

// Tailwind only keeps class names it can read in full, so they are spelled out.
export const COLOR_STYLES: Record<
  ColorChoice,
  { label: string; bar: string; dot: string }
> = {
  "": {
    label: "기본",
    bar: "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]",
    dot: "bg-[var(--primary)]",
  },
  red: { label: "빨강", bar: "bg-red-500/25", dot: "bg-red-500" },
  orange: { label: "주황", bar: "bg-orange-500/25", dot: "bg-orange-500" },
  green: { label: "초록", bar: "bg-green-500/25", dot: "bg-green-500" },
  blue: { label: "파랑", bar: "bg-blue-500/25", dot: "bg-blue-500" },
  purple: { label: "보라", bar: "bg-purple-500/25", dot: "bg-purple-500" },
  pink: { label: "분홍", bar: "bg-pink-500/25", dot: "bg-pink-500" },
  gray: { label: "회색", bar: "bg-gray-500/25", dot: "bg-gray-500" },
  yellow: { label: "노랑", bar: "bg-yellow-500/30", dot: "bg-yellow-400" },
  lime: { label: "연두", bar: "bg-lime-500/25", dot: "bg-lime-500" },
  teal: { label: "청록", bar: "bg-teal-500/25", dot: "bg-teal-500" },
  cyan: { label: "하늘", bar: "bg-cyan-500/25", dot: "bg-cyan-500" },
  indigo: { label: "남색", bar: "bg-indigo-500/25", dot: "bg-indigo-500" },
  brown: { label: "갈색", bar: "bg-amber-800/30", dot: "bg-amber-800" },
};
const COLOR_CHOICES: ColorChoice[] = ["", ...CALENDAR_COLORS];

export const REPEAT_LABELS: Record<RepeatEvery, string> = {
  daily: "매일",
  weekly: "매주",
  biweekly: "2주마다",
  monthly: "매월",
};

export type Draft = {
  id?: string | undefined;
  title: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  color: ColorChoice;
  note: string;
  repeat: RepeatEvery | "";
  until: string;
  everyone: boolean;
  attendees: string[];
  skip?: string[] | undefined;
  sourceEventId?: string | undefined;
  /** Channel told about the entry ("" = none) and its reminder lead (0 = none). */
  notifyChannelId: string;
  notifyBefore: number;
  /** Also post to the channel right when the entry is saved. */
  notifyNow: boolean;
};

export const emptyDraft = (date: string): Draft => ({
  title: "",
  date,
  time: "",
  endDate: date,
  endTime: "",
  color: "",
  note: "",
  repeat: "",
  until: "",
  everyone: true,
  attendees: [],
  notifyChannelId: "",
  notifyBefore: 0,
  notifyNow: false,
});

/** The draft that edits `entry` (for a repeating entry: the whole series). */
export function draftOf(entry: CalendarOccurrence): Draft {
  const start = entry.seriesDate ?? entry.date;
  const span = daysBetween(entry.date, entryEndDate(entry));
  return {
    id: entry.id,
    title: entry.title,
    date: start,
    time: entry.time ?? "",
    endDate: addDays(start, span),
    endTime: entry.endTime ?? "",
    color: entry.color ?? "",
    note: entry.note ?? "",
    repeat: entry.repeat?.every ?? "",
    until: entry.repeat?.until ?? "",
    everyone: !entry.attendees,
    attendees: entry.attendees ?? [],
    skip: entry.skip,
    sourceEventId: entry.sourceEventId,
    notifyChannelId: entry.notify?.channelId ?? "",
    notifyBefore: entry.notify?.before ?? 0,
    notifyNow: false,
  };
}

/**
 * A draft that makes a copy of `entry` starting on `date`: same length, time,
 * color, attendees, note and channel. A copy is a one-off entry even when the
 * original repeats, and it is a new entry (no id, no source message).
 */
export function copyDraftOf(entry: CalendarOccurrence, date: string): Draft {
  const span = daysBetween(entry.date, entryEndDate(entry));
  return {
    ...draftOf(entry),
    id: undefined,
    date,
    endDate: addDays(date, span),
    repeat: "",
    until: "",
    skip: undefined,
    sourceEventId: undefined,
  };
}

const repeatOf = (draft: Draft) =>
  draft.repeat
    ? { every: draft.repeat, until: draft.until || undefined }
    : undefined;

/** Why the draft cannot be saved (a message for the person), or `null`. */
export function draftError(draft: Draft): string | null {
  const range = validateRange({
    date: draft.date,
    time: draft.time || undefined,
    endDate: draft.endDate || undefined,
    endTime: draft.endTime || undefined,
    repeat: repeatOf(draft),
  });
  if (range) return range;
  if (!draft.everyone && draft.attendees.length === 0)
    return "참석자를 한 명 이상 골라 주세요.";
  return null;
}

export function inputOfDraft(draft: Draft): CalendarEntryInput {
  return {
    id: draft.id,
    title: draft.title.trim(),
    date: draft.date,
    time: draft.time || undefined,
    endDate: draft.endDate || undefined,
    endTime: draft.endTime || undefined,
    color: draft.color || undefined,
    note: draft.note.trim() || undefined,
    attendees: draft.everyone ? undefined : draft.attendees,
    repeat: repeatOf(draft),
    skip: draft.repeat ? draft.skip : undefined,
    sourceEventId: draft.sourceEventId,
    notify: draft.notifyChannelId
      ? {
          channelId: draft.notifyChannelId,
          before: draft.notifyBefore || undefined,
        }
      : undefined,
  };
}

/** The end date once the start moves to `date`: an entry keeps its length. */
function endAfterStartMove(draft: Draft, date: string): string {
  if (!date || !draft.date || !draft.endDate) return date || draft.endDate;
  return addDays(date, Math.max(0, daysBetween(draft.date, draft.endDate)));
}

export const SELECT_CLASS =
  "h-9 rounded-md border border-input-line bg-surface px-2 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

/** The add/edit form of one calendar entry. */
export function EntryForm({
  draft,
  members,
  channels,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  members: TeamMember[];
  /** Channels a notice can go to; the section is hidden when there are none. */
  channels: Array<{ id: string; name: string }>;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const error = draftError(draft);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      className="flex max-h-[min(36rem,62vh)] flex-col gap-2 overflow-y-auto pr-1"
      data-testid="team-calendar-form"
      onSubmit={submit}
    >
      <label className="flex flex-col gap-1 text-xs">
        제목
        <Input
          autoFocus
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
          placeholder="예: 기획 회의"
          required
          value={draft.title}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          시작 날짜
          <Input
            onChange={(event) => {
              const date = event.target.value;
              onChange({
                ...draft,
                date,
                endDate: endAfterStartMove(draft, date),
              });
            }}
            required
            type="date"
            value={draft.date}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs">
          시작 시간 (선택)
          <Input
            onChange={(event) =>
              onChange({
                ...draft,
                time: event.target.value,
                // An end time means nothing without a start time.
                endTime: event.target.value ? draft.endTime : "",
              })
            }
            type="time"
            value={draft.time}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          종료 날짜
          <Input
            min={draft.date || undefined}
            onChange={(event) =>
              onChange({ ...draft, endDate: event.target.value })
            }
            required
            type="date"
            value={draft.endDate}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs">
          종료 시간 (선택)
          <Input
            disabled={!draft.time}
            onChange={(event) =>
              onChange({ ...draft, endTime: event.target.value })
            }
            type="time"
            value={draft.endTime}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          반복
          <select
            className={SELECT_CLASS}
            data-testid="team-calendar-repeat"
            onChange={(event) =>
              onChange({
                ...draft,
                repeat: event.target.value as RepeatEvery | "",
              })
            }
            value={draft.repeat}
          >
            <option value="">반복 안 함</option>
            {REPEAT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {REPEAT_LABELS[choice]}
              </option>
            ))}
          </select>
        </label>
        {draft.repeat ? (
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            반복 종료 (선택)
            <Input
              min={draft.date || undefined}
              onChange={(event) =>
                onChange({ ...draft, until: event.target.value })
              }
              type="date"
              value={draft.until}
            />
          </label>
        ) : null}
      </div>
      {error ? (
        <p
          className="text-xs text-danger"
          data-testid="team-calendar-range-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <fieldset className="flex min-w-0 flex-col gap-1 text-xs">
        <legend className="mb-1">색상</legend>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_CHOICES.map((choice) => {
            const { label, dot } = COLOR_STYLES[choice];
            const checked = draft.color === choice;
            return (
              <button
                aria-label={label}
                aria-pressed={checked}
                className={cn(
                  "h-5 w-5 rounded-full border-2 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  dot,
                  checked ? "border-ink" : "border-transparent",
                )}
                data-testid={`team-calendar-color-${choice || "default"}`}
                key={choice || "default"}
                onClick={() => onChange({ ...draft, color: choice })}
                title={label}
                type="button"
              />
            );
          })}
        </div>
      </fieldset>
      <MemberPicker
        everyone={draft.everyone}
        members={members}
        onChange={({ everyone, selected }) =>
          onChange({ ...draft, everyone, attendees: selected })
        }
        selected={draft.attendees}
      />
      {channels.length > 0 ? (
        <fieldset className="flex min-w-0 flex-col gap-1 text-xs">
          <legend className="mb-1">채널 알림 (선택)</legend>
          <select
            aria-label="알릴 채널"
            className={SELECT_CLASS}
            data-testid="team-calendar-notify-channel"
            onChange={(event) =>
              onChange({ ...draft, notifyChannelId: event.target.value })
            }
            value={draft.notifyChannelId}
          >
            <option value="">알리지 않음</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
          {draft.notifyChannelId ? (
            <>
              <label className="flex items-center gap-2">
                <input
                  checked={draft.notifyNow}
                  data-testid="team-calendar-notify-now"
                  onChange={(event) =>
                    onChange({ ...draft, notifyNow: event.target.checked })
                  }
                  type="checkbox"
                />
                저장할 때 이 채널에 일정 알리기
              </label>
              <label className="flex items-center gap-2">
                일정 전에 채널에 알림
                <select
                  className={SELECT_CLASS}
                  data-testid="team-calendar-notify-before"
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      notifyBefore: Number(event.target.value),
                    })
                  }
                  value={draft.notifyBefore}
                >
                  <option value={0}>안 함</option>
                  {NOTIFY_BEFORE_CHOICES.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {reminderLabel(minutes)}
                    </option>
                  ))}
                </select>
              </label>
              {draft.notifyBefore ? (
                <p className="text-muted">
                  일정 전 알림은 이 일정을 마지막으로 저장한 사람의 Buzz가 켜져
                  있을 때 그 사람 이름으로 올라갑니다.
                </p>
              ) : null}
            </>
          ) : null}
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-xs">
        메모 (선택)
        <Textarea
          maxLength={MAX_NOTE_LENGTH}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
          rows={2}
          value={draft.note}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button
          disabled={saving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          취소
        </Button>
        <Button
          disabled={saving || draft.title.trim().length === 0 || error !== null}
          size="sm"
          type="submit"
        >
          {draft.id ? "수정 저장" : "저장"}
        </Button>
      </div>
    </form>
  );
}
