import { sendChannelMessage } from "../compat/relay";
import { normalizeRelayUrl } from "../compat/relay";

/**
 * Posts a calendar notice to a channel as the current member (team patch).
 * The relay URL is passed as the expected scope, so the message is refused
 * rather than published elsewhere if the app is bound to another community.
 */
export async function postChannelNotice(
  relayUrl: string,
  channelId: string,
  text: string,
): Promise<void> {
  await sendChannelMessage(
    channelId,
    text,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    normalizeRelayUrl(relayUrl),
  );
}
