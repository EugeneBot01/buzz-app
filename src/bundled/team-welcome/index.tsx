import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { PluginModule } from "../../plugins/api";
import type { RelayData } from "../../features/relay/service";
import type { RelaySession } from "../../features/relay/session";
import { useCommunityRole } from "../../features/communities/useCommunityRole";
import { Button } from "../../shared/design-system/ui/Button";
import { scopeOf } from "../reminders/react";
import {
  joinedChannels,
  readManagers,
  readTeamDocs,
  teamRelayUrl as relayUrlOf,
  waitForChannels,
} from "../../team/relay/community";
import {
  ONBOARDING_TAG,
  encodeOnboarding,
  latestOnboarding,
  onboardingDTag,
  pendingDefaults,
  readProgress,
  writeProgress,
  type DefaultChannel,
  type OnboardingDoc,
} from "../../team/onboarding/defaults";

export const inject = ["relay", "settingsCards"];

type Scope = { session: RelaySession; viewer: string; community: string };

// ---- shared state: the current community and whether the guide is open ----

let current: Scope | undefined;
let guide: { open: boolean; joined: readonly string[] } = {
  open: false,
  joined: [],
};
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function openGuide(joined: readonly string[] = []) {
  guide = { open: true, joined };
  emit();
}
function closeGuide() {
  guide = { ...guide, open: false };
  if (current) {
    const progress = readProgress(current.viewer, current.community);
    writeProgress(current.viewer, current.community, {
      ...progress,
      welcomed: true,
    });
  }
  emit();
}

// ---- relay helpers ----

async function readDefaults(
  session: RelaySession,
  relayUrl: string,
  signal: AbortSignal,
): Promise<OnboardingDoc | null> {
  const managers = await readManagers(session, signal);
  const events = await readTeamDocs(session, onboardingDTag(relayUrl));
  return latestOnboarding(events, managers);
}

/** Joins the community's new default channels once, then greets a newcomer. */
async function welcome(scope: Scope, signal: AbortSignal) {
  const { session, viewer, community } = scope;
  const list = await waitForChannels(session, signal);
  const joined = joinedChannels(list);
  const progress = readProgress(viewer, community);
  let doc: OnboardingDoc | null = null;
  try {
    doc = await readDefaults(session, relayUrlOf(community), signal);
  } catch {
    // Without defaults the guide still helps; joining waits for next launch.
  }
  signal.throwIfAborted();
  const lifecycle = session.channelLifecycle;
  const names: string[] = [];
  const attempted = new Set(progress.attempted);
  if (lifecycle?.available)
    for (const channel of pendingDefaults(doc, joined, attempted)) {
      signal.throwIfAborted();
      attempted.add(channel.id);
      try {
        await lifecycle.run("join", channel.id, signal);
        names.push(channel.name);
      } catch {
        // A channel that was removed or made private is skipped for good.
      }
    }
  writeProgress(viewer, community, {
    welcomed: progress.welcomed,
    attempted: [...attempted],
  });
  if (!progress.welcomed) openGuide(names);
}

function follow(relay: RelayData) {
  let running: AbortController | undefined;
  let key = "";
  const update = () => {
    const connection = relay.snapshot();
    const scope =
      connection.status === "ready" && connection.session
        ? scopeOf(connection)
        : undefined;
    const next = scope ? `${scope.viewer}:${scope.communityOrigin}` : "";
    if (next === key) return;
    key = next;
    running?.abort();
    running = undefined;
    current =
      scope && connection.session
        ? {
            session: connection.session,
            viewer: scope.viewer,
            community: scope.communityOrigin,
          }
        : undefined;
    emit();
    if (!current) return;
    running = new AbortController();
    welcome(current, running.signal).catch(() => {});
  };
  const stop = relay.subscribe(update);
  update();
  return () => {
    stop();
    running?.abort();
    current = undefined;
  };
}

/** The guide lives in its own small root so it shows over any page. */
function mountGuide() {
  if (typeof document === "undefined") return () => {};
  const host = document.createElement("div");
  host.setAttribute("data-team-welcome", "");
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Guide />);
  return () => {
    root.unmount();
    host.remove();
  };
}

// ---- the five-step guide ----

const STEPS: readonly { title: string; body: (joined: string) => string }[] = [
  {
    title: "팀 Buzz에 오신 걸 환영해요 👋",
    body: () =>
      "팀원과 AI 에이전트가 함께 일하는 대화 앱이에요. 다섯 가지만 알면 바로 쓸 수 있어요.",
  },
  {
    title: "채널 = 주제별 대화방",
    body: (joined) =>
      joined
        ? `왼쪽 목록의 '팀'이 채널이에요. 기본 채널(${joined})에 자동으로 넣어 드렸어요. 다른 채널은 목록 위 검색으로 찾아 들어가면 돼요.`
        : "왼쪽 목록의 '팀'이 채널이에요. 다른 채널은 목록 위 검색으로 찾아 들어가면 돼요.",
  },
  {
    title: "알림은 채널마다 고를 수 있어요",
    body: () =>
      "채널 이름을 오른쪽 클릭 → 알림에서 '모든 메시지 / 멘션만 / 끄기'를 고르세요. @everyone 이나 @all 을 쓰면 채널 모두에게 알림이 가요.",
  },
  {
    title: "위쪽 '캘린더' 탭",
    body: () =>
      "팀 모두가 함께 보는 달력이에요. 일정·투표·알림이 있고, 메시지 메뉴의 '캘린더에 추가'로 대화를 바로 일정으로 만들 수 있어요.",
  },
  {
    title: "에이전트와 예전 Buzz",
    body: () =>
      "예전 Buzz를 쓰셨다면 위쪽 '에이전트' 탭의 '지금 가져오기'로 에이전트를 그대로 옮길 수 있어요. 이 안내는 설정 → 팀 안내에서 다시 볼 수 있어요.",
  },
];

function Guide() {
  const state = useSyncExternalStore(subscribe, () => guide);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (state.open) setStep(0);
  }, [state.open]);
  if (!state.open) return null;
  const last = step === STEPS.length - 1;
  const page = STEPS[step];
  if (!page) return null;
  const { title, body } = page;
  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-overlay p-4"
      data-no-translate=""
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-welcome-title"
        className="w-full max-w-[440px] rounded-xl border border-line bg-elevated p-6 text-ink shadow-lg"
      >
        <p className="mb-2 text-xs text-muted">
          {step + 1} / {STEPS.length}
        </p>
        <h2 id="team-welcome-title" className="mb-3 text-lg font-semibold">
          {title}
        </h2>
        <p className="mb-6 text-sm leading-relaxed">
          {body(state.joined.join(", "))}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={closeGuide}>
            건너뛰기
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="subtle" onClick={() => setStep(step - 1)}>
                이전
              </Button>
            )}
            <Button
              variant="prominent"
              onClick={() => (last ? closeGuide() : setStep(step + 1))}
            >
              {last ? "시작하기" : "다음"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- settings: show the guide again, and (admins) pick default channels ----

function useCurrent() {
  return useSyncExternalStore(subscribe, () => current);
}

function WelcomeSettings() {
  const scope = useCurrent();
  return (
    <div className="flex flex-col gap-4" data-no-translate="">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          처음 들어온 팀원에게 보이는 5단계 안내예요.
        </p>
        <Button variant="subtle" onClick={() => openGuide()}>
          안내 다시 보기
        </Button>
      </div>
      {scope && <DefaultChannels key={scope.community} scope={scope} />}
    </div>
  );
}

function DefaultChannels({ scope }: { scope: Scope }) {
  const { session, viewer, community } = scope;
  const role = useCommunityRole(session, viewer);
  const list = useSyncExternalStore(
    session.channels.subscribeList,
    session.channels.list,
  );
  useEffect(() => {
    session.channels.ensureList();
  }, [session]);
  const channels = useMemo(
    () =>
      list.channels
        .filter(
          (channel) =>
            channel.visibility === "public" &&
            !channel.archived &&
            !channel.hidden &&
            !channel.huddle &&
            (channel.channelType ?? "stream") !== "solo" &&
            (channel.channelType ?? "stream") !== "dm",
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [list.channels],
  );
  const [chosen, setChosen] = useState<ReadonlySet<string>>();
  const [status, setStatus] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    readDefaults(session, relayUrlOf(community), controller.signal).then(
      (doc) =>
        controller.signal.aborted ||
        setChosen(new Set(doc?.channels.map(({ id }) => id))),
      () => controller.signal.aborted || setChosen(new Set()),
    );
    return () => controller.abort();
  }, [session, community]);
  if (!role.manager) return null;
  const save = async () => {
    const publish = session.teamAppData?.publish;
    if (!publish || !chosen) return;
    const picked: DefaultChannel[] = channels
      .filter(({ id }) => chosen.has(id))
      .map(({ id, name }) => ({ id, name }));
    setStatus("저장 중…");
    try {
      await publish({
        kind: 30078,
        content: encodeOnboarding(picked),
        tags: [
          ["d", onboardingDTag(relayUrlOf(community))],
          ["t", ONBOARDING_TAG],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      setStatus(
        "저장했어요. 새로 들어오는 팀원은 이 채널들에 자동으로 들어가요.",
      );
    } catch (reason) {
      setStatus(
        `저장하지 못했어요: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  };
  return (
    <fieldset className="flex flex-col gap-2 border-t border-line pt-4">
      <legend className="mb-1 text-sm font-semibold">
        기본 채널 (관리자만 보여요)
      </legend>
      <p className="text-xs text-muted">
        체크한 공개 채널에 새 팀원이 처음 접속할 때 자동으로 들어가요.
      </p>
      {!chosen ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : channels.length === 0 ? (
        <p className="text-sm text-muted">공개 채널이 없어요.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {channels.map((channel) => (
            <li key={channel.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(channel.id)}
                  onChange={(event) => {
                    const next = new Set(chosen);
                    if (event.currentTarget.checked) next.add(channel.id);
                    else next.delete(channel.id);
                    setChosen(next);
                  }}
                />
                # {channel.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="prominent"
          disabled={!chosen || !session.teamAppData}
          onClick={() => void save()}
        >
          저장
        </Button>
        {status && <span className="text-xs text-muted">{status}</span>}
      </div>
    </fieldset>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.effect(() => follow(ctx.relay));
  ctx.effect(() => mountGuide());
  ctx.settingsCards.register({
    id: "team-welcome",
    title: "Team welcome",
    component: WelcomeSettings,
  });
};
