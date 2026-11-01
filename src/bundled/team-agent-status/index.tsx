import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { ComposerAccessoryProps } from "../../features/conversation/contracts";
import {
  splitAgents,
  statusCounts,
  type AgentAvailability,
} from "../../team/agents/status";

export const inject = ["conversation"];

const noop = () => () => {};
const emptyProfiles = new Map();

/** Team build: who among this channel's agents can answer right now. */
function AgentStatusLine({ session, channelId }: ComposerAccessoryProps) {
  const list = useSyncExternalStore(
    session.channels.subscribeList,
    session.channels.list,
  );
  const profiles = useSyncExternalStore(
    session.profiles.subscribe ?? noop,
    session.profiles.snapshot ?? (() => emptyProfiles),
  );
  const members = useMemo(
    () => list.channels.find(({ id }) => id === channelId)?.members ?? [],
    [list.channels, channelId],
  );
  useEffect(() => {
    if (members.length)
      void session.profiles.ensure([...members]).catch(() => {});
  }, [session, members]);
  const agents = useMemo(
    () =>
      members.filter((pubkey) => {
        const profile = profiles.get(pubkey);
        return profile?.isAgent === true || !!profile?.ownerPubkey;
      }),
    [members, profiles],
  );
  const presence = session.presence;
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!presence) return () => {};
      const stops = agents.map((pubkey) =>
        presence.subscribe(pubkey, listener),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
    [presence, agents],
  );
  const statuses = useSyncExternalStore(subscribe, () =>
    agents.map((pubkey) => presence?.status(pubkey) ?? "unknown").join(","),
  );
  if (!agents.length) return null;
  const { online, resting } = splitAgents(
    agents.map((pubkey, index) => ({
      name: profiles.get(pubkey)?.name?.trim() || "에이전트",
      status: (statuses.split(",")[index] ?? "unknown") as AgentAvailability,
    })),
  );
  if (!online.length && !resting.length) return null;
  return (
    <details className="px-1 pb-1 text-xs text-muted" data-no-translate="">
      <summary
        className="w-fit cursor-pointer select-none"
        title="이 채널 에이전트 상태 보기"
      >
        에이전트 {statusCounts(online.length, resting.length)}
      </summary>
      <div className="flex flex-col gap-0.5 pt-1">
        {online.length > 0 && (
          <span>
            🟢 <span className="text-ink">{online.join(", ")}</span> 지금 답할
            수 있어요
          </span>
        )}
        {resting.length > 0 && (
          <span>
            ⚪ {resting.join(", ")} 쉬는 중 (만든 사람 맥이 꺼져 있으면 답하지
            않아요)
          </span>
        )}
      </div>
    </details>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.conversation.registerAccessory({
    id: "agent-status",
    title: "Agent status line",
    component: AgentStatusLine,
  });
};
