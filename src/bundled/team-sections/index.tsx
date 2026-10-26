import { useEffect, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { RelayData } from "../../features/relay/service";
import type { RelaySession } from "../../features/relay/session";
import { useCommunityRole } from "../../features/communities/useCommunityRole";
import { Button } from "../../shared/design-system/ui/Button";
import { scopeOf } from "../reminders/react";
import {
  SECTIONS_TAG,
  latestLayout,
  layoutFromGroups,
  planFiling,
  sectionsDTag,
  type TeamLayout,
} from "../../team/sections/layout";
import {
  joinedChannels,
  readManagers,
  readTeamDocs,
  teamRelayUrl,
  waitForChannels,
} from "../../team/relay/community";

export const inject = ["relay", "settingsCards"];

type Scope = { session: RelaySession; viewer: string; community: string };

let current: Scope | undefined;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Channels this device already filed, so a channel someone moves out of a
// team folder on purpose is not put back on every launch.
const filedKey = (viewer: string, community: string) =>
  `buzz-team-sections.v1:${viewer}:${community}`;
function readFiled(viewer: string, community: string): Set<string> {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(filedKey(viewer, community)) ?? "[]",
    );
    return new Set(
      Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
function writeFiled(viewer: string, community: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(
      filedKey(viewer, community),
      JSON.stringify([...ids].slice(-1000)),
    );
  } catch {
    // Without storage, filing simply runs again next time.
  }
}

async function readLayout(scope: Scope, signal: AbortSignal) {
  const managers = await readManagers(scope.session, signal);
  const events = await readTeamDocs(
    scope.session,
    sectionsDTag(teamRelayUrl(scope.community)),
  );
  return latestLayout(events, managers);
}

/** Resolves with the member's own folders once they can be changed. */
function waitForFolders(session: RelaySession, signal: AbortSignal) {
  const prefs = session.sidebarPreferences;
  return new Promise<NonNullable<ReturnType<typeof prefs.snapshot>["data"]>>(
    (resolve, reject) => {
      const check = () => {
        const { data, cached } = prefs.snapshot();
        if (!data || cached || !prefs.writable) return;
        finish();
        resolve(data);
      };
      const stop = prefs.subscribe(check);
      const timer = setTimeout(() => {
        finish();
        reject(new Error("폴더를 아직 쓸 수 없어요"));
      }, 30_000);
      const abort = () => {
        finish();
        reject(signal.reason);
      };
      function finish() {
        stop();
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
      signal.addEventListener("abort", abort);
      void prefs.ensure().catch(() => {});
      check();
    },
  );
}

/** Files the member's joined, unfiled channels into the team folders. */
async function fileChannels(
  scope: Scope,
  signal: AbortSignal,
  layout?: TeamLayout | null,
  again = false,
) {
  const team = layout ?? (await readLayout(scope, signal));
  if (!team?.sections.length) return 0;
  const list = await waitForChannels(scope.session, signal);
  const personal = await waitForFolders(scope.session, signal);
  const filed = again
    ? new Set<string>()
    : readFiled(scope.viewer, scope.community);
  const joined = new Set(
    [...joinedChannels(list)].filter((id) => !filed.has(id)),
  );
  const steps = planFiling(team, personal, joined, () => crypto.randomUUID());
  const prefs = scope.session.sidebarPreferences;
  let done = 0;
  for (const step of steps) {
    signal.throwIfAborted();
    try {
      if ("create" in step)
        await prefs.createAndAssign(step.channelId, step.create, signal);
      else await prefs.assign(step.channelId, step.sectionId, signal);
      done++;
    } catch {
      // A folder change from another device wins; this channel stays put.
    }
    filed.add(step.channelId);
  }
  // Channels already in a folder count as filed too.
  for (const id of joinedChannels(list)) filed.add(id);
  writeFiled(scope.viewer, scope.community, filed);
  return done;
}

function follow(relay: RelayData) {
  let running: AbortController | undefined;
  let key = "";
  let stopList: (() => void) | undefined;
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
    stopList?.();
    stopList = undefined;
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
    const scoped = current;
    const controller = new AbortController();
    running = controller;
    void fileChannels(scoped, controller.signal).catch(() => {});
    // Channels joined later (such as default channels) are filed too.
    let known = joinedChannels(scoped.session.channels.list()).size;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = scoped.session.channels.subscribeList(() => {
      const size = joinedChannels(scoped.session.channels.list()).size;
      if (size <= known) return;
      known = size;
      clearTimeout(timer);
      timer = setTimeout(
        () => void fileChannels(scoped, controller.signal).catch(() => {}),
        3_000,
      );
    });
    stopList = () => {
      stop();
      clearTimeout(timer);
    };
  };
  const stop = relay.subscribe(update);
  update();
  return () => {
    stop();
    stopList?.();
    running?.abort();
    current = undefined;
  };
}

function TeamFoldersSettings() {
  const scope = useSyncExternalStore(subscribe, () => current);
  if (!scope)
    return (
      <p className="text-sm text-muted" data-no-translate="">
        커뮤니티를 고르면 팀 폴더 설정이 보입니다.
      </p>
    );
  return <Folders key={scope.community} scope={scope} />;
}

function Folders({ scope }: { scope: Scope }) {
  const role = useCommunityRole(scope.session, scope.viewer);
  const [layout, setLayout] = useState<TeamLayout | null>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readLayout(scope, controller.signal).then(
      (next) => controller.signal.aborted || setLayout(next),
      () => controller.signal.aborted || setLayout(null),
    );
    return () => controller.abort();
  }, [scope]);
  const share = async () => {
    const publish = scope.session.teamAppData?.publish;
    const data = scope.session.sidebarPreferences.snapshot().data;
    if (!publish || !data) {
      setStatus("내 폴더를 아직 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      return;
    }
    const next = layoutFromGroups(data);
    setBusy(true);
    setStatus("공유 중…");
    try {
      await publish({
        kind: 30078,
        content: JSON.stringify(next),
        tags: [
          ["d", sectionsDTag(teamRelayUrl(scope.community))],
          ["t", SECTIONS_TAG],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });
      setLayout(next);
      setStatus("공유했어요. 팀원이 다음에 접속하면 같은 폴더로 정리돼요.");
    } catch (reason) {
      setStatus(
        `공유하지 못했어요: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    } finally {
      setBusy(false);
    }
  };
  const applyAgain = async () => {
    setBusy(true);
    setStatus("정리 중…");
    try {
      const done = await fileChannels(
        scope,
        AbortSignal.timeout(60_000),
        layout,
        true,
      );
      setStatus(
        done
          ? `채널 ${done}개를 팀 폴더로 옮겼어요.`
          : "옮길 채널이 없어요. 이미 정리돼 있어요.",
      );
    } catch (reason) {
      setStatus(
        `정리하지 못했어요: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4" data-no-translate="">
      <p className="text-sm text-muted">
        관리자가 공유한 폴더 배치로, 아직 폴더에 넣지 않은 채널이 자동으로
        정리돼요. 내가 직접 정리한 채널은 건드리지 않아요.
      </p>
      {layout === undefined ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : !layout?.sections.length ? (
        <p className="text-sm text-muted">아직 공유된 팀 폴더가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {layout.sections.map((section) => (
            <li key={section.name}>
              📁 {section.name}{" "}
              <span className="text-muted">
                (채널 {section.channels.length}개)
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="subtle"
          disabled={busy || !layout?.sections.length}
          onClick={() => void applyAgain()}
        >
          팀 폴더 다시 적용
        </Button>
        {role.manager && (
          <Button
            variant="prominent"
            disabled={busy || !scope.session.teamAppData}
            onClick={() => void share()}
          >
            내 폴더 배치를 팀에 공유
          </Button>
        )}
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.effect(() => follow(ctx.relay));
  ctx.settingsCards.register({
    id: "team-folders",
    title: "Team folders",
    component: TeamFoldersSettings,
  });
};
