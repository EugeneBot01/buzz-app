import { Plus } from "../compat/icons";
import * as React from "react";
import { toast } from "sonner";

import { addDays, todayKey } from "../lib/teamCalendar";
import {
  type DatePoll,
  MAX_POLL_TITLE_LENGTH,
  type PollInput,
  livePolls,
  tallyPoll,
  validatePoll,
} from "../lib/teamPolls";
import { useTeamPolls } from "../lib/useTeamPolls";
import type { TeamMember } from "../lib/useTeamMembers";
import { Button } from "../compat/ui";
import { Checkbox } from "../compat/ui";
import { Input } from "../compat/ui";
import { type PollPick, PollDetail, dayLabel } from "./PollDetail";

export type { PollPick };

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const SELECT_CLASS =
  "h-9 rounded-md border border-input-line bg-surface px-2 text-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

type PollDraft = {
  title: string;
  startDate: string;
  endDate: string;
  withHours: boolean;
  from: number;
  to: number;
};

const inputOf = (draft: PollDraft): PollInput => ({
  title: draft.title,
  startDate: draft.startDate,
  endDate: draft.endDate,
  hours: draft.withHours ? { from: draft.from, to: draft.to } : undefined,
});

/**
 * Meeting-date polls (team patch): propose a span of days, everyone ticks
 * when they can make it, and the days most people can make are shown.
 */
export function PollsPanel({
  pubkey,
  relayUrl,
  members,
  nameOf,
  onPick,
}: {
  pubkey: string;
  relayUrl: string;
  members: TeamMember[];
  nameOf: (pubkey: string) => string;
  onPick: (pick: PollPick) => void;
}) {
  const { polls, answersByMember, status, savePoll, deletePoll, answerPoll } =
    useTeamPolls(pubkey, relayUrl);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<PollDraft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const list = livePolls(polls);
  const poll: DatePoll | undefined = openId
    ? list.find((candidate) => candidate.id === openId)
    : undefined;

  const run = async (action: () => Promise<void>, failure: string) => {
    setSaving(true);
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(errorText(error, failure));
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (draft) {
    const problem = validatePoll(inputOf(draft));
    return (
      <form
        className="flex min-h-80 max-w-md flex-col gap-2"
        data-testid="team-poll-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem || saving) return;
          void run(
            () => savePoll(inputOf(draft)),
            "투표를 만들지 못했습니다.",
          ).then((saved) => {
            if (saved) setDraft(null);
          });
        }}
      >
        <h3 className="text-sm font-semibold">모임 날짜 투표 만들기</h3>
        <label className="flex flex-col gap-1 text-xs">
          제목
          <Input
            autoFocus
            maxLength={MAX_POLL_TITLE_LENGTH}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            placeholder="예: 10월 정기 모임"
            value={draft.title}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            후보 시작 날짜
            <Input
              onChange={(event) =>
                setDraft({ ...draft, startDate: event.target.value })
              }
              type="date"
              value={draft.startDate}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            후보 종료 날짜
            <Input
              min={draft.startDate || undefined}
              onChange={(event) =>
                setDraft({ ...draft, endDate: event.target.value })
              }
              type="date"
              value={draft.endDate}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={draft.withHours}
            data-testid="team-poll-with-hours"
            onCheckedChange={(checked) =>
              setDraft({ ...draft, withHours: checked === true })
            }
          />
          시간대까지 고르기
        </label>
        {draft.withHours ? (
          <div className="flex items-center gap-2 text-xs">
            <select
              aria-label="시작 시각"
              className={SELECT_CLASS}
              onChange={(event) =>
                setDraft({ ...draft, from: Number(event.target.value) })
              }
              value={draft.from}
            >
              {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}시
                </option>
              ))}
            </select>
            부터
            <select
              aria-label="끝 시각"
              className={SELECT_CLASS}
              onChange={(event) =>
                setDraft({ ...draft, to: Number(event.target.value) })
              }
              value={draft.to}
            >
              {Array.from({ length: 24 }, (_, hour) => hour + 1).map((hour) => (
                <option key={hour} value={hour}>
                  {hour}시
                </option>
              ))}
            </select>
            까지
          </div>
        ) : null}
        {problem && draft.title.trim().length > 0 ? (
          <p className="text-xs text-danger" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            disabled={saving}
            onClick={() => setDraft(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            취소
          </Button>
          <Button disabled={saving || problem !== null} size="sm" type="submit">
            만들기
          </Button>
        </div>
      </form>
    );
  }

  if (poll) {
    return (
      <PollDetail
        answersByMember={answersByMember}
        key={poll.id}
        members={members}
        nameOf={nameOf}
        onAnswer={(choices) =>
          run(() => answerPoll(poll.id, choices), "답을 저장하지 못했습니다.")
        }
        onBack={() => setOpenId(null)}
        onDelete={() => {
          setOpenId(null);
          void run(() => deletePoll(poll.id), "투표를 삭제하지 못했습니다.");
        }}
        onPick={onPick}
        poll={poll}
        pubkey={pubkey}
        saving={saving}
      />
    );
  }

  const today = todayKey();
  return (
    <div className="flex min-h-80 flex-col gap-3" data-testid="team-poll-list">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          모일 수 있는 날을 팀원들에게 물어보고, 가장 많이 되는 날을 찾습니다.
        </p>
        <Button
          data-testid="team-poll-add"
          disabled={status !== "ready"}
          onClick={() =>
            setDraft({
              title: "",
              startDate: today,
              endDate: addDays(today, 6),
              withHours: false,
              from: 9,
              to: 22,
            })
          }
          size="sm"
          type="button"
        >
          <Plus className="h-4 w-4" />
          투표 만들기
        </Button>
      </div>
      {status === "loading" ? (
        <p className="text-sm text-muted">투표를 불러오는 중…</p>
      ) : status === "error" ? (
        <p className="text-sm text-muted">
          투표를 불러오지 못했습니다. 연결을 확인해 주세요.
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">아직 만든 투표가 없습니다.</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {list.map((item) => {
            const tally = tallyPoll(item, answersByMember);
            const answered = tally.voters.includes(pubkey);
            return (
              <li key={item.id}>
                <button
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:bg-soft focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="team-poll-item"
                  onClick={() => setOpenId(item.id)}
                  type="button"
                >
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-muted">
                    {dayLabel(item.startDate)} ~ {dayLabel(item.endDate)}
                    {item.hours
                      ? ` · ${item.hours.from}시~${item.hours.to}시`
                      : ""}{" "}
                    · 응답 {tally.voters.length}명
                    {answered ? "" : " · 아직 답하지 않음"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
