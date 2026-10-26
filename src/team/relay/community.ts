/** Small community helpers the team plugins share. */
import type { RelaySession } from "../../features/relay/session";
import {
  managesCommunity,
  readRoster,
} from "../../features/communities/roster";
import { normalizeRelayUrl } from "../calendar/compat/relay";

/** The relay address the 0.5 team build used in its document keys. */
export const teamRelayUrl = (origin: string) =>
  normalizeRelayUrl(origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:"));

/** Owners and admins, from the relay-signed member list. */
export async function readManagers(
  session: RelaySession,
  signal: AbortSignal,
): Promise<Set<string>> {
  const roster = await readRoster(session, signal);
  return new Set(
    (roster ?? [])
      .filter(({ role }) => managesCommunity(role))
      .map(({ pubkey }) => pubkey),
  );
}

/** Every author's copy of one team document. */
export function readTeamDocs(session: RelaySession, dTag: string) {
  return session.read([{ kinds: [30078], "#d": [dTag], limit: 50 } as never]);
}

/** Resolves once the community's channel list has loaded. */
export function waitForChannels(session: RelaySession, signal: AbortSignal) {
  return new Promise<ReturnType<RelaySession["channels"]["list"]>>(
    (resolve, reject) => {
      session.channels.ensureList();
      const check = () => {
        const list = session.channels.list();
        if (list.status !== "ready") return;
        finish();
        resolve(list);
      };
      const stop = session.channels.subscribeList(check);
      const timer = setTimeout(() => {
        finish();
        reject(new Error("채널 목록을 불러오지 못했어요"));
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
      check();
    },
  );
}

/** Channels the viewer is a member of (not read-only previews). */
export const joinedChannels = (
  list: ReturnType<RelaySession["channels"]["list"]>,
) =>
  new Set(
    list.channels.filter((channel) => !channel.readOnly).map(({ id }) => id),
  );
