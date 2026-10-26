import * as React from "react";

import { useRelayMembersQuery } from "../compat/hooks";
import { useUsersBatchQuery } from "../compat/hooks";

export type TeamMember = { pubkey: string; name: string };

/**
 * The people of the community with a display name, for picking attendees and
 * showing who answered a poll. Agents are left out; `extra` adds pubkeys that
 * must be listed even when they are not relay members (a channel's members).
 */
export function useTeamMembers(extra: string[] = []): {
  members: TeamMember[];
  nameOf: (pubkey: string) => string;
} {
  const relayMembers = useRelayMembersQuery().data;
  const extraKey = [...extra].sort().join(",");
  const pubkeys = React.useMemo(
    () => [
      ...new Set([
        ...(relayMembers ?? []).map((member) => member.pubkey.toLowerCase()),
        ...(extraKey ? extraKey.split(",") : []),
      ]),
    ],
    [relayMembers, extraKey],
  );
  const profiles = useUsersBatchQuery(pubkeys).data?.profiles;

  return React.useMemo(() => {
    const nameOf = (pubkey: string) => {
      const profile = profiles?.[pubkey.toLowerCase()];
      return profile?.displayName || profile?.name || "이름 없는 멤버";
    };
    const members = pubkeys
      .filter((pubkey) => profiles?.[pubkey]?.isAgent !== true)
      .map((pubkey) => ({ pubkey, name: nameOf(pubkey) }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "ko") ||
          a.pubkey.localeCompare(b.pubkey),
      );
    return { members, nameOf };
  }, [pubkeys, profiles]);
}
