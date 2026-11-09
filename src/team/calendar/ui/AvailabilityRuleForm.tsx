import { X } from "../compat/icons";
import * as React from "react";

import {
  type AvailabilityRule,
  MAX_EXCLUDED_DAYS,
  MAX_RULE_TITLE_LENGTH,
  RULE_KINDS,
  RULE_KIND_LABELS,
  type RuleKind,
  isAllDay,
  minuteLabel,
  parseMinute,
  validateRule,
} from "../lib/teamAvailability";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import { SELECT_CLASS } from "./EntryForm";

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

const KIND_TONE: Record<RuleKind, string> = {
  busy: "data-[on=true]:bg-red-4 data-[on=true]:text-red-11 dark:data-[on=true]:text-red-10",
  available:
    "data-[on=true]:bg-green-4 data-[on=true]:text-green-11 dark:data-[on=true]:text-green-10",
  tentative:
    "data-[on=true]:bg-amber-4 data-[on=true]:text-amber-11 dark:data-[on=true]:text-amber-10",
};

/** End-time choices: every half hour up to 24:00. */
const HALF_HOURS = Array.from({ length: 48 }, (_, index) => (index + 1) * 30);

export type RuleDraft = {
  id?: string | undefined;
  title: string;
  kind: RuleKind;
  weekly: boolean;
  startDate: string;
  endDate: string;
  weekday: number;
  allDay: boolean;
  start: string;
  end: string;
  exclude: string[];
};

export function emptyRuleDraft(date: string): RuleDraft {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return {
    title: "",
    kind: "busy",
    weekly: false,
    startDate: date,
    endDate: date,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    allDay: false,
    start: "09:00",
    end: "18:00",
    exclude: [],
  };
}

export function ruleDraftOf(rule: AvailabilityRule): RuleDraft {
  return {
    id: rule.id,
    title: rule.title,
    kind: rule.kind,
    weekly: rule.weekday !== null,
    startDate: rule.startDate,
    endDate: rule.endDate,
    weekday: rule.weekday ?? 0,
    allDay: isAllDay(rule),
    start: minuteLabel(rule.start),
    end: minuteLabel(rule.end),
    exclude: rule.exclude,
  };
}

/** The rule a draft saves, or a message saying what is wrong. */
export function ruleOfDraft(
  draft: RuleDraft,
): { rule: AvailabilityRule } | { error: string } {
  const start = draft.allDay ? 0 : parseMinute(draft.start);
  const end = draft.allDay ? 1_440 : parseMinute(draft.end);
  if (start === null || end === null) return { error: "시간을 확인해 주세요." };
  const rule: AvailabilityRule = {
    id: draft.id ?? crypto.randomUUID().replace(/-/g, "").slice(0, 20),
    kind: draft.kind,
    title: draft.title.trim().slice(0, MAX_RULE_TITLE_LENGTH),
    startDate: draft.startDate,
    endDate: draft.weekly ? draft.endDate : draft.startDate,
    weekday: draft.weekly ? draft.weekday : null,
    start,
    end,
    exclude: draft.weekly
      ? draft.exclude.filter(
          (day) => day >= draft.startDate && day <= draft.endDate,
        )
      : [],
  };
  const error = validateRule(rule);
  return error ? { error } : { rule };
}

/**
 * Adding or editing one schedule rule, as on the team's "빈칸" page: what it
 * is, 불가/가능/조율, one date or the same weekday every week of a period,
 * all day or a time range, and (for a weekly rule) days to leave out.
 */
export function AvailabilityRuleForm({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: RuleDraft;
  saving: boolean;
  /** Gets an updater, so quick successive edits never undo each other. */
  onChange: (update: (draft: RuleDraft) => RuleDraft) => void;
  onCancel: () => void;
  onSubmit: (rule: AvailabilityRule) => void;
}) {
  const [excludeDay, setExcludeDay] = React.useState("");
  const result = ruleOfDraft(draft);
  const error = "error" in result ? result.error : null;
  const set = (patch: Partial<RuleDraft>) =>
    onChange((current) => ({ ...current, ...patch }));

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 text-xs"
      data-testid="availability-rule-form"
      onSubmit={(event) => {
        event.preventDefault();
        if ("rule" in result) onSubmit(result.rule);
      }}
    >
      <label className="flex flex-col gap-1">
        어떤 일정인가요?
        <Input
          autoFocus
          maxLength={MAX_RULE_TITLE_LENGTH}
          onChange={(event) => set({ title: event.target.value })}
          placeholder="예: 수업 / 알바 / 공회전 촬영"
          value={draft.title}
        />
      </label>
      <div
        className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
        role="radiogroup"
      >
        {RULE_KINDS.map((kind) => (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control styled as buttons
          <button
            aria-checked={draft.kind === kind}
            className={cn(
              "border-0 cursor-pointer rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background/70",
              "data-[on=true]:font-semibold data-[on=true]:shadow-sm",
              KIND_TONE[kind],
            )}
            data-on={draft.kind === kind}
            data-testid={`availability-kind-${kind}`}
            key={kind}
            onClick={() => set({ kind })}
            role="radio"
            type="button"
          >
            {RULE_KIND_LABELS[kind]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input
          checked={draft.weekly}
          data-testid="availability-weekly"
          onChange={(event) => set({ weekly: event.target.checked })}
          type="checkbox"
        />
        매주 같은 요일에 반복
      </label>
      {draft.weekly ? (
        <div className="grid grid-cols-[6rem_1fr_1fr] gap-2">
          <label className="flex flex-col gap-1">
            요일
            <select
              className={SELECT_CLASS}
              onChange={(event) => set({ weekday: Number(event.target.value) })}
              value={draft.weekday}
            >
              {WEEKDAY_NAMES.map((name, index) => (
                <option key={name} value={index}>
                  {name}요일
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            기간 시작
            <Input
              onChange={(event) => {
                const startDate = event.target.value;
                onChange((current) => ({
                  ...current,
                  startDate,
                  // Keep the period valid when the start moves past its end.
                  endDate:
                    startDate && current.endDate < startDate
                      ? startDate
                      : current.endDate,
                }));
              }}
              type="date"
              value={draft.startDate}
            />
          </label>
          <label className="flex flex-col gap-1">
            기간 끝
            <Input
              min={draft.startDate}
              onChange={(event) => set({ endDate: event.target.value })}
              type="date"
              value={draft.endDate}
            />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-1">
          날짜
          <Input
            onChange={(event) =>
              set({
                startDate: event.target.value,
                endDate: event.target.value,
              })
            }
            type="date"
            value={draft.startDate}
          />
        </label>
      )}
      <label className="flex items-center gap-2">
        <input
          checked={draft.allDay}
          data-testid="availability-all-day"
          onChange={(event) => set({ allDay: event.target.checked })}
          type="checkbox"
        />
        종일
      </label>
      {draft.allDay ? null : (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            시작
            <Input
              onChange={(event) => set({ start: event.target.value })}
              step={300}
              type="time"
              value={draft.start}
            />
          </label>
          <label className="flex flex-col gap-1">
            종료
            <select
              className={SELECT_CLASS}
              data-testid="availability-end"
              onChange={(event) => set({ end: event.target.value })}
              value={draft.end}
            >
              {/* Keep an end that is not on a half hour (from an import). */}
              {HALF_HOURS.map(minuteLabel).includes(draft.end) ? null : (
                <option value={draft.end}>{draft.end}</option>
              )}
              {HALF_HOURS.map((minutes) => {
                const label = minuteLabel(minutes);
                return (
                  <option key={label} value={label}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      )}
      {draft.weekly ? (
        <div className="flex flex-col gap-1">
          <span>빠지는 날 (선택)</span>
          <div className="flex gap-2">
            <Input
              aria-label="빠지는 날"
              max={draft.endDate}
              min={draft.startDate}
              onChange={(event) => setExcludeDay(event.target.value)}
              type="date"
              value={excludeDay}
            />
            <Button
              disabled={
                !excludeDay ||
                draft.exclude.includes(excludeDay) ||
                draft.exclude.length >= MAX_EXCLUDED_DAYS
              }
              onClick={() => {
                onChange((current) => ({
                  ...current,
                  exclude: [
                    ...new Set([...current.exclude, excludeDay]),
                  ].sort(),
                }));
                setExcludeDay("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              추가
            </Button>
          </div>
          {draft.exclude.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {draft.exclude.map((day) => (
                <span
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                  key={day}
                >
                  {day}
                  <button
                    aria-label={`${day} 빼기`}
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        exclude: current.exclude.filter((item) => item !== day),
                      }))
                    }
                    type="button"
                  >
                    <X className="border-0 rounded-none p-0 cursor-pointer h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {error && draft.title.trim() ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
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
          data-testid="availability-rule-save"
          disabled={saving || error !== null}
          size="sm"
          type="submit"
        >
          {draft.id ? "수정 저장" : "일정에 적용"}
        </Button>
      </div>
    </form>
  );
}
