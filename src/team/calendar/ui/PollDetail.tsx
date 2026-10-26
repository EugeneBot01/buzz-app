import { ArrowLeft, CalendarPlus, Trash2 } from "../compat/icons";
import * as React from "react";

import {
  type DatePoll,
  type PollAnswer,
  type PollRange,
  mergeOptions,
  pollDates,
  pollHours,
  rankPollRanges,
  slotKey,
  tallyPoll,
} from "../lib/teamPolls";
import type { TeamMember } from "../lib/useTeamMembers";
import { cn } from "../compat/ui";
import { Button } from "../compat/ui";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return `${month}/${day} (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`;
}

/** "10/12 (월)" or "10/12 (월) 14시~17시". */
function rangeLabel(range: PollRange): string {
  return range.from === undefined
    ? dayLabel(range.date)
    : `${dayLabel(range.date)} ${range.from}시~${range.to}시`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** What "make this an entry" hands to the calendar. */
export type PollPick = {
  title: string;
  date: string;
  time?: string | undefined;
  endTime?: string | undefined;
  attendees: string[];
};

/**
 * One poll (team patch). A member first ticks when they can make it and
 * confirms; after that the poll reads as plain text: the times most people
 * can make, then when each person can.
 */
export function PollDetail({
  poll,
  pubkey,
  answersByMember,
  members,
  nameOf,
  saving,
  onAnswer,
  onDelete,
  onBack,
  onPick,
}: {
  poll: DatePoll;
  pubkey: string;
  answersByMember: Record<string, Record<string, PollAnswer>>;
  members: TeamMember[];
  nameOf: (pubkey: string) => string;
  saving: boolean;
  /** Saves this member's answer; resolves to whether it was saved. */
  onAnswer: (choices: string[]) => Promise<boolean>;
  onDelete: () => void;
  onBack: () => void;
  onPick: (pick: PollPick) => void;
}) {
  const myAnswer = answersByMember[pubkey]?.[poll.id];
  const [picking, setPicking] = React.useState(myAnswer === undefined);
  const [chosen, setChosen] = React.useState<Set<string>>(
    () => new Set(myAnswer?.choices ?? []),
  );
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const dates = pollDates(poll);
  const hours = pollHours(poll);
  const unit = hours.length > 0 ? "시간" : "날";

  const toggle = (option: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });

  const cell = (option: string, label: string) => {
    const on = chosen.has(option);
    return (
      <button
        aria-label={`${label}${on ? ", 고름" : ""}`}
        aria-pressed={on}
        className={cn(
          "min-w-0 truncate rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-soft focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
          on
            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] font-medium"
            : "border-line bg-surface text-muted",
        )}
        data-testid={`team-poll-option-${option}`}
        key={option}
        onClick={() => toggle(option)}
        type="button"
      >
        {label}
      </button>
    );
  };

  const tally = tallyPoll(poll, answersByMember);
  const ranked = rankPollRanges(poll, tally);
  const waiting = members.filter(
    (member) => !tally.voters.includes(member.pubkey),
  );

  return (
    <div
      className="flex min-h-80 flex-col gap-3"
      data-testid="team-poll-detail"
    >
      <div className="flex items-center gap-2">
        <Button
          aria-label="투표 목록으로"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {poll.title}
        </h3>
        {confirmingDelete ? (
          <Button
            disabled={saving}
            onBlur={() => setConfirmingDelete(false)}
            onClick={onDelete}
            size="xs"
            type="button"
            variant="destructive"
          >
            삭제 확인
          </Button>
        ) : (
          <Button
            aria-label="투표 삭제"
            disabled={saving}
            onClick={() => setConfirmingDelete(true)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {picking ? (
        <>
          <p className="text-xs text-muted">
            내가 되는 {unit}을 모두 누른 뒤 아래 "확인"을 눌러 주세요. 다시
            누르면 취소됩니다.
          </p>
          {hours.length === 0 ? (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {dates.map((date) => cell(date, dayLabel(date)))}
            </div>
          ) : (
            <div className="max-h-72 overflow-auto">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${dates.length}, minmax(4.5rem, 1fr))`,
                }}
              >
                {dates.map((date) => (
                  <span className="text-center text-2xs text-muted" key={date}>
                    {dayLabel(date)}
                  </span>
                ))}
                {hours.map((hour) => (
                  <React.Fragment key={hour}>
                    {dates.map((date) =>
                      cell(slotKey(date, hour), `${hour}시~${hour + 1}시`),
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted">
              {chosen.size === 0
                ? `고른 ${unit}이 없습니다. 이대로 확인하면 "되는 때 없음"으로 저장됩니다.`
                : `내가 고른 때: ${mergeOptions([...chosen])
                    .map(rangeLabel)
                    .join(", ")}`}
            </span>
            {myAnswer ? (
              <Button
                disabled={saving}
                onClick={() => {
                  setChosen(new Set(myAnswer.choices));
                  setPicking(false);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                취소
              </Button>
            ) : null}
            <Button
              data-testid="team-poll-confirm"
              disabled={saving}
              onClick={() =>
                void onAnswer([...chosen]).then((saved) => {
                  if (saved) setPicking(false);
                })
              }
              size="sm"
              type="button"
            >
              확인
            </Button>
          </div>
        </>
      ) : (
        <div
          className="flex flex-col gap-3 text-sm"
          data-testid="team-poll-result"
        >
          <section className="rounded-lg border border-line px-3 py-2">
            <h4 className="text-xs font-semibold text-muted">
              가장 많이 되는 때
            </h4>
            {ranked.length === 0 ? (
              <p className="mt-1 text-muted">
                아직 되는 때를 고른 사람이 없습니다.
              </p>
            ) : (
              <ol className="mt-1 flex flex-col gap-1.5">
                {ranked.map((range, index) => (
                  <li
                    className="flex items-center gap-2"
                    key={`${range.date}-${range.from ?? "day"}`}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      <span
                        className={cn(
                          "font-semibold",
                          index === 0 && "text-base text-green-600",
                        )}
                      >
                        {rangeLabel(range)}
                      </span>{" "}
                      · {range.members.length}명
                      <span className="text-xs text-muted">
                        {" "}
                        ({range.members.map(nameOf).join(", ")})
                      </span>
                    </span>
                    <Button
                      data-testid="team-poll-pick"
                      onClick={() =>
                        onPick({
                          title: poll.title,
                          date: range.date,
                          time:
                            range.from === undefined
                              ? undefined
                              : `${pad(range.from)}:00`,
                          endTime:
                            range.to === undefined
                              ? undefined
                              : range.to === 24
                                ? "23:59"
                                : `${pad(range.to)}:00`,
                          attendees: range.members,
                        })
                      }
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      일정으로 만들기
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-lg border border-line px-3 py-2">
            <h4 className="text-xs font-semibold text-muted">
              사람별 되는 때 (응답 {tally.voters.length}명)
            </h4>
            <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {tally.voters.map((voter) => {
                const ranges = mergeOptions(
                  answersByMember[voter]?.[poll.id]?.choices ?? [],
                );
                return (
                  <li className="break-words" key={voter}>
                    <span className="font-medium">{nameOf(voter)}</span>:{" "}
                    {ranges.length === 0
                      ? "되는 때 없음"
                      : ranges.map(rangeLabel).join(", ")}
                  </li>
                );
              })}
            </ul>
            {waiting.length > 0 ? (
              <p className="mt-2 break-words text-xs text-muted">
                아직 답하지 않음:{" "}
                {waiting.map((member) => member.name).join(", ")}
              </p>
            ) : null}
          </section>

          <div className="flex justify-end">
            <Button
              data-testid="team-poll-edit-answer"
              onClick={() => {
                setChosen(new Set(myAnswer?.choices ?? []));
                setPicking(true);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {myAnswer ? "내 답 고치기" : "내 답 고르기"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
