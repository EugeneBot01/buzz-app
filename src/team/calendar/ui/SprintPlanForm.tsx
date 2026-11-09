import { ArrowDown, ArrowUp, Plus, Trash2 } from "../compat/icons";
import * as React from "react";

import { CALENDAR_COLORS } from "../lib/teamCalendar";
import {
  MAX_DEPTS,
  MAX_KEY_DATES,
  MAX_LABEL_LENGTH,
  MAX_PHASES,
  MAX_PLAN_NOTE_LENGTH,
  MAX_PLAN_TITLE_LENGTH,
  MAX_SPRINT_WEEKS,
  PHASE_TONES,
  type PhaseTone,
  mondayOf,
  validatePlan,
} from "../lib/teamSprint";
import type { SprintPlanInput } from "../lib/useTeamSprint";
import { Button } from "../compat/ui";
import { Input } from "../compat/ui";
import { Textarea } from "../compat/ui";
import { COLOR_STYLES, SELECT_CLASS } from "./EntryForm";

const TONE_LABELS: Record<PhaseTone, string> = {
  pre: "프리 (파랑)",
  prod: "프로덕션 (주황)",
  post: "포스트 (초록)",
  other: "기타 (회색)",
};

function move<T>(list: T[], index: number, step: number): T[] {
  const target = index + step;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

/** Board settings: period, phases, departments, note and key dates. */
export function SprintPlanForm({
  initial,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: SprintPlanInput;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (plan: SprintPlanInput) => void;
}) {
  const [plan, setPlan] = React.useState<SprintPlanInput>(initial);
  const error = validatePlan(plan);
  const phaseWeeks = plan.phases.reduce((sum, phase) => sum + phase.weeks, 0);
  const set = (patch: Partial<SprintPlanInput>) =>
    setPlan((current) => ({ ...current, ...patch }));

  return (
    <form
      className="flex max-h-[min(40rem,70vh)] flex-col gap-4 overflow-y-auto pr-1 text-xs"
      data-testid="sprint-plan-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!error) onSubmit(plan);
      }}
    >
      <fieldset className="grid gap-2 sm:grid-cols-[1fr_10rem_6rem]">
        <legend className="mb-1 text-sm font-semibold">기본</legend>
        <label className="flex flex-col gap-1">
          보드 이름
          <Input
            maxLength={MAX_PLAN_TITLE_LENGTH}
            onChange={(event) => set({ title: event.target.value })}
            value={plan.title}
          />
        </label>
        <label className="flex flex-col gap-1">
          W01 시작일
          <Input
            data-testid="sprint-plan-start"
            onChange={(event) => set({ start: event.target.value })}
            type="date"
            value={plan.start}
          />
        </label>
        <label className="flex flex-col gap-1">
          전체 주 수
          <Input
            data-testid="sprint-plan-weeks"
            max={MAX_SPRINT_WEEKS}
            min={1}
            onChange={(event) => set({ weeks: Number(event.target.value) })}
            type="number"
            value={plan.weeks}
          />
        </label>
        {plan.start && mondayOf(plan.start) !== plan.start ? (
          <p className="text-muted-foreground sm:col-span-3">
            시작일이 월요일이 아니어서 주가 그 요일부터 시작합니다.{" "}
            <button
              className="border-0 rounded-none p-0 cursor-pointer underline"
              onClick={() => set({ start: mondayOf(plan.start) })}
              type="button"
            >
              그 주 월요일로 맞추기
            </button>
          </p>
        ) : null}
        <label className="flex flex-col gap-1 sm:col-span-3">
          공지 (보드 위 한 줄, 선택)
          <Textarea
            maxLength={MAX_PLAN_NOTE_LENGTH}
            onChange={(event) => set({ note: event.target.value })}
            placeholder="예: 10/22 변경 프로덕션 12/5–6 → 12/12–13(토–일)"
            rows={2}
            value={plan.note ?? ""}
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">
          단계{" "}
          <span className="font-normal text-muted-foreground">
            ({phaseWeeks}/{plan.weeks}주)
          </span>
        </legend>
        {plan.phases.map((phase, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <div className="flex items-center gap-2" key={index}>
            <Input
              aria-label="단계 이름"
              className="min-w-0 flex-1"
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) =>
                set({
                  phases: plan.phases.map((item, at) =>
                    at === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
              value={phase.label}
            />
            <Input
              aria-label="주 수"
              className="w-20"
              min={1}
              onChange={(event) =>
                set({
                  phases: plan.phases.map((item, at) =>
                    at === index
                      ? { ...item, weeks: Number(event.target.value) }
                      : item,
                  ),
                })
              }
              type="number"
              value={phase.weeks}
            />
            <select
              aria-label="색"
              className={SELECT_CLASS}
              onChange={(event) =>
                set({
                  phases: plan.phases.map((item, at) =>
                    at === index
                      ? { ...item, tone: event.target.value as PhaseTone }
                      : item,
                  ),
                })
              }
              value={phase.tone}
            >
              {PHASE_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {TONE_LABELS[tone]}
                </option>
              ))}
            </select>
            <Button
              aria-label="단계 삭제"
              onClick={() =>
                set({ phases: plan.phases.filter((_, at) => at !== index) })
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {plan.phases.length < MAX_PHASES ? (
          <Button
            className="self-start"
            onClick={() =>
              set({
                phases: [
                  ...plan.phases,
                  {
                    label: "새 단계",
                    weeks: Math.max(1, plan.weeks - phaseWeeks),
                    tone: "other",
                  },
                ],
              })
            }
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus className="h-3 w-3" />
            단계 추가
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">부서 (보드의 행)</legend>
        {plan.depts.map((dept, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <div className="flex items-center gap-2" key={index}>
            <Input
              aria-label="부서 코드"
              className="w-28 font-mono uppercase"
              maxLength={24}
              onChange={(event) =>
                set({
                  depts: plan.depts.map((item, at) =>
                    at === index
                      ? {
                          ...item,
                          key: event.target.value
                            .toUpperCase()
                            .replace(/\s/g, "_"),
                        }
                      : item,
                  ),
                })
              }
              value={dept.key}
            />
            <Input
              aria-label="부서 이름"
              className="min-w-0 flex-1"
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) =>
                set({
                  depts: plan.depts.map((item, at) =>
                    at === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
              value={dept.label}
            />
            <select
              aria-label="부서 색"
              className={SELECT_CLASS}
              onChange={(event) =>
                set({
                  depts: plan.depts.map((item, at) =>
                    at === index
                      ? {
                          ...item,
                          color: (event.target.value ||
                            undefined) as typeof item.color,
                        }
                      : item,
                  ),
                })
              }
              value={dept.color ?? ""}
            >
              <option value="">기본</option>
              {CALENDAR_COLORS.map((color) => (
                <option key={color} value={color}>
                  {COLOR_STYLES[color].label}
                </option>
              ))}
            </select>
            <Button
              aria-label="위로"
              disabled={index === 0}
              onClick={() => set({ depts: move(plan.depts, index, -1) })}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ArrowUp />
            </Button>
            <Button
              aria-label="아래로"
              disabled={index === plan.depts.length - 1}
              onClick={() => set({ depts: move(plan.depts, index, 1) })}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <ArrowDown />
            </Button>
            <Button
              aria-label="부서 삭제"
              onClick={() =>
                set({ depts: plan.depts.filter((_, at) => at !== index) })
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {plan.depts.length < MAX_DEPTS ? (
          <Button
            className="self-start"
            onClick={() =>
              set({
                depts: [
                  ...plan.depts,
                  { key: `DEPT${plan.depts.length + 1}`, label: "새 부서" },
                ],
              })
            }
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus className="h-3 w-3" />
            부서 추가
          </Button>
        ) : null}
        <p className="text-muted-foreground">
          부서를 지우거나 코드를 바꾸면, 그 부서 일정은 지워지지 않고 "부서
          미지정" 행에 보입니다.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">
          주요 날짜 (D-day 표시)
        </legend>
        {plan.keyDates.map((keyDate, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <div className="flex items-center gap-2" key={index}>
            <Input
              aria-label="이름"
              className="min-w-0 flex-1"
              maxLength={MAX_LABEL_LENGTH}
              onChange={(event) =>
                set({
                  keyDates: plan.keyDates.map((item, at) =>
                    at === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                })
              }
              placeholder="예: 프로덕션"
              value={keyDate.label}
            />
            <Input
              aria-label="날짜"
              className="w-40"
              onChange={(event) =>
                set({
                  keyDates: plan.keyDates.map((item, at) =>
                    at === index ? { ...item, date: event.target.value } : item,
                  ),
                })
              }
              type="date"
              value={keyDate.date}
            />
            <Button
              aria-label="주요 날짜 삭제"
              onClick={() =>
                set({ keyDates: plan.keyDates.filter((_, at) => at !== index) })
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {plan.keyDates.length < MAX_KEY_DATES ? (
          <Button
            className="self-start"
            onClick={() =>
              set({
                keyDates: [...plan.keyDates, { label: "", date: plan.start }],
              })
            }
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus className="h-3 w-3" />
            주요 날짜 추가
          </Button>
        ) : null}
      </fieldset>

      {error ? (
        <p
          className="text-destructive"
          data-testid="sprint-plan-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="sticky bottom-0 flex justify-end gap-2 bg-background pt-2">
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
          data-testid="sprint-plan-save"
          disabled={saving || error !== null}
          size="sm"
          type="submit"
        >
          설정 저장
        </Button>
      </div>
    </form>
  );
}
