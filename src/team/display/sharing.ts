/**
 * Shared UI profiles (Buzz Team): each member publishes one community
 * document listing the profiles they share. Teammates read everyone's and can
 * apply one or copy it into their own profiles.
 */
import {
  decodeProfiles,
  MAX_PROFILE_NAME,
  publicProfile,
  type UiProfile,
} from "./profiles";
import { TEAM_APP_DATA_MAX_BYTES } from "../relay/app-data";

export const SHARED_TAG = "team-ui-profiles";
export const MAX_SHARED = 10;
export const sharedDTag = (relayUrl: string) => `${SHARED_TAG}:${relayUrl}`;

export function encodeShared(profiles: readonly UiProfile[]) {
  const content = JSON.stringify({
    v: 1,
    profiles: profiles.slice(0, MAX_SHARED).map(publicProfile),
  });
  if (new TextEncoder().encode(content).length > TEAM_APP_DATA_MAX_BYTES)
    throw new Error("공유할 프로필이 너무 커요. 개수를 줄여 주세요.");
  return content;
}

export type SharedProfiles = Readonly<{
  author: string;
  profiles: readonly UiProfile[];
  at: number;
}>;

/** Each member's newest document, newest first; unreadable ones are skipped. */
export function readShared(
  events: readonly Readonly<{
    pubkey: string;
    content: string;
    created_at: number;
  }>[],
): SharedProfiles[] {
  const newest = new Map<string, SharedProfiles>();
  for (const event of events) {
    let profiles: UiProfile[] = [];
    try {
      const value = JSON.parse(event.content) as { profiles?: unknown };
      profiles = decodeProfiles(JSON.stringify(value.profiles ?? [])).slice(
        0,
        MAX_SHARED,
      );
    } catch {
      continue;
    }
    const known = newest.get(event.pubkey);
    if (!known || known.at < event.created_at)
      newest.set(event.pubkey, {
        author: event.pubkey,
        // A teammate's look only: no work area layout, one row per name.
        profiles: profiles
          .filter(
            (profile, index) =>
              profile.name.length <= MAX_PROFILE_NAME &&
              profiles.findIndex((other) => other.name === profile.name) ===
                index,
          )
          .map(publicProfile),
        at: event.created_at,
      });
  }
  return [...newest.values()]
    .filter((entry) => entry.profiles.length)
    .sort((a, b) => b.at - a.at);
}
