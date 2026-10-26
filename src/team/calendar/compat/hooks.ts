/** React data hooks the calendar used in the 0.5 app, backed by the session. */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { RelaySession } from "../../../features/relay/session";
import { subscribeTeamRelay, teamRelay } from "./relay";

const noSession = () => () => {};
const emptyList = { channels: [] as const } as never;
const emptyProfiles = new Map();

function useSession(): RelaySession | undefined {
  return useSyncExternalStore(
    subscribeTeamRelay,
    () => teamRelay()?.session,
    () => undefined,
  );
}

function useChannels() {
  const session = useSession();
  useEffect(() => session?.channels.ensureList(), [session]);
  const list = useSyncExternalStore(
    session?.channels.subscribeList ?? noSession,
    session ? session.channels.list : () => emptyList,
    () => emptyList,
  );
  return list.channels as RelaySession["channels"] extends {
    list(): { channels: infer C };
  }
    ? C
    : never;
}

function useProfileMap(session: RelaySession | undefined) {
  return useSyncExternalStore(
    session?.profiles.subscribe ?? noSession,
    session ? session.profiles.snapshot : () => emptyProfiles,
    () => emptyProfiles,
  );
}

/** Channels of the community: `channelType`, `name`, `archivedAt`. */
export function useChannelsQuery() {
  const channels = useChannels();
  const data = useMemo(
    () =>
      channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType ?? "stream",
        archivedAt: channel.archived ? 1 : undefined,
      })),
    [channels],
  );
  return { data };
}

/** People in the community: everyone who shares a channel with the viewer. */
export function useRelayMembersQuery() {
  const channels = useChannels();
  const data = useMemo(() => {
    const keys = new Set<string>();
    for (const channel of channels)
      for (const key of channel.members ?? []) keys.add(key);
    return [...keys].map((pubkey) => ({ pubkey }));
  }, [channels]);
  return { data };
}

/** Display names, and whether each key is an agent. */
export function useUsersBatchQuery(pubkeys: readonly string[]) {
  const session = useSession();
  const key = pubkeys.join(",");
  useEffect(() => {
    if (session && key)
      void session.profiles.ensure(key.split(",")).catch(() => {});
  }, [session, key]);
  const map = useProfileMap(session);
  const data = useMemo(() => {
    const profiles: Record<
      string,
      { name?: string; displayName?: string; isAgent?: boolean }
    > = {};
    for (const pubkey of key ? key.split(",") : []) {
      const profile = map.get(pubkey);
      if (profile)
        profiles[pubkey] = {
          name: profile.name,
          displayName: profile.name,
          isAgent: profile.isAgent === true || !!profile.ownerPubkey,
        };
    }
    return { profiles };
  }, [map, key]);
  return { data };
}

/** A channel's members, with an agent flag from their profiles. */
export function useChannelMembersQuery(channelId: string | null) {
  const session = useSession();
  const channels = useChannels();
  const members = useMemo(
    () => channels.find((item) => item.id === channelId)?.members ?? [],
    [channels, channelId],
  );
  const map = useProfileMap(session);
  const data = useMemo(
    () =>
      members.map((pubkey) => {
        const profile = map.get(pubkey);
        return {
          pubkey,
          isAgent:
            !profile || profile.isAgent === true || !!profile.ownerPubkey,
        };
      }),
    [members, map],
  );
  return { data };
}
