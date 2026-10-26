import * as React from "react";
import { toast } from "sonner";

import { todayKey } from "../lib/teamCalendar";
import { useNoticeChannels } from "../lib/useNoticeChannels";
import { useTeamMembers } from "../lib/useTeamMembers";
import {
  postDigestNow,
  useDigestSettings,
  useWeekOccurrences,
} from "../lib/useWeeklyDigest";
import { digestText, weekStartOf } from "../lib/weeklyDigest";
import { Button } from "../compat/ui";
import { SELECT_CLASS } from "./EntryForm";

const WEEKDAY_OPTIONS = [
  [1, "월요일"],
  [2, "화요일"],
  [3, "수요일"],
  [4, "목요일"],
  [5, "금요일"],
  [6, "토요일"],
  [0, "일요일"],
] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const weekdayLabel = (day: number) =>
  WEEKDAY_OPTIONS.find(([value]) => value === day)?.[1] ?? "";

/** One numbered step of a settings panel (team patch 94). */
export function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string | undefined;
  children?: React.ReactNode | undefined;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-on-primary">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** "Now: …" status line at the top of a settings panel (team patch 94). */
export function StatusLine({
  on,
  children,
}: {
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        on
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-line bg-soft text-muted"
      }`}
    >
      <span className="font-semibold">{on ? "켜짐" : "꺼짐"}</span>
      <span className="mx-2 opacity-40">|</span>
      {children}
    </div>
  );
}

/**
 * Weekly-digest settings (team patch 55, layout 94): where and when this
 * week's calendar summary is posted, plus same-day notices. Shared by every
 * member.
 */
export function DigestPanel({
  pubkey,
  relayUrl,
}: {
  pubkey: string;
  relayUrl: string;
}) {
  const { settings, ready, save } = useDigestSettings(pubkey, relayUrl);
  const channels = useNoticeChannels();
  const { nameOf } = useTeamMembers();
  const weekStart = weekStartOf(todayKey());
  const { occurrences, ready: calendarReady } = useWeekOccurrences(
    pubkey,
    relayUrl,
    weekStart,
  );
  const [saving, setSaving] = React.useState(false);
  const preview = React.useMemo(
    () => digestText(occurrences, weekStart, nameOf),
    [occurrences, weekStart, nameOf],
  );
  const channelName = channels.find((c) => c.id === settings.channelId)?.name;

  const change = async (patch: Parameters<typeof save>[0]) => {
    setSaving(true);
    try {
      await save(patch);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    if (!settings.channelId) return;
    try {
      await postDigestNow(relayUrl, settings.channelId, preview);
      toast("이번 주 일정 공지를 올렸습니다.");
    } catch {
      toast.error("이번 주 일정 공지를 올리지 못했습니다.");
    }
  };

  if (!ready) {
    return <p className="py-6 text-sm text-muted">설정을 불러오는 중…</p>;
  }

  const on = settings.enabled && Boolean(settings.channelId);

  return (
    <div className="flex flex-col gap-4" data-testid="team-calendar-digest">
      <StatusLine on={on}>
        {on
          ? `매주 ${weekdayLabel(settings.weekday)} ${settings.hour}시에 #${channelName ?? "채널"}에 그 주 일정이 올라가요.`
          : "아직 매주 공지가 꺼져 있어요. 아래 1~3을 차례로 해 주세요."}
      </StatusLine>

      <div className="flex flex-col gap-4 md:flex-row">
        <section
          aria-label="주간 공지 설정"
          className="flex min-w-0 flex-1 flex-col gap-4"
        >
          <Step n={1} title="어느 채널에 올릴까요?">
            <select
              aria-label="공지할 채널"
              className={SELECT_CLASS}
              data-testid="team-calendar-digest-channel"
              disabled={saving}
              onChange={(event) =>
                void change({ channelId: event.target.value || null })
              }
              value={settings.channelId ?? ""}
            >
              <option value="">채널 고르기</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          </Step>

          <Step n={2} title="언제 올릴까요?">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              매주
              <select
                aria-label="요일"
                className={SELECT_CLASS}
                disabled={saving}
                onChange={(event) =>
                  void change({ weekday: Number(event.target.value) })
                }
                value={settings.weekday}
              >
                {WEEKDAY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="시각"
                className={SELECT_CLASS}
                disabled={saving}
                onChange={(event) =>
                  void change({ hour: Number(event.target.value) })
                }
                value={settings.hour}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}시
                  </option>
                ))}
              </select>
            </div>
          </Step>

          <Step
            n={3}
            title="켜기"
            hint={
              settings.channelId
                ? undefined
                : "1번에서 채널을 먼저 골라 주세요."
            }
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={settings.enabled}
                data-testid="team-calendar-digest-enabled"
                disabled={saving || (!settings.channelId && !settings.enabled)}
                onChange={(event) =>
                  void change({ enabled: event.target.checked })
                }
                type="checkbox"
              />
              매주 그 주 일정 공지 올리기
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                checked={settings.daily}
                className="mt-1"
                data-testid="team-calendar-digest-daily"
                disabled={saving}
                onChange={(event) =>
                  void change({ daily: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                (선택) 일정이 있는 날 아침에도 알리기
                <span className="block text-xs text-muted">
                  일정에 "채널 알림"을 정해 두면, 그날 같은 시각에 그 채널에
                  오늘 일정과 참석자 이름이 올라가요.
                </span>
              </span>
            </label>
          </Step>

          <p className="text-xs text-muted">
            팀 전체에 같이 적용돼요. 그 시각에 팀원 누군가의 Buzz가 켜져 있으면
            올라가고, 같은 공지는 두 번 올라가지 않아요.
          </p>
        </section>

        <section
          aria-label="미리 보기"
          className="flex min-w-0 flex-1 flex-col gap-2"
        >
          <p className="text-sm font-medium">이렇게 올라가요</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-soft p-3 text-xs">
            {calendarReady ? preview : "일정을 불러오는 중…"}
          </pre>
          <Button
            className="self-start"
            disabled={!settings.channelId || !calendarReady}
            onClick={() => void sendNow()}
            size="sm"
            type="button"
            variant="outline"
          >
            지금 한 번 올려 보기
          </Button>
        </section>
      </div>
    </div>
  );
}
