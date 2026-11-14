/** Channel files (Buzz Team): every attachment a channel's messages carry. */
import type { EventData } from "../../features/relay/events";
import type { Attachment } from "../../features/relay/contracts";
import { parseAttachments } from "../../features/relay/fold";
import { messageLinkParts } from "../../features/messages/message-link-parts";
import { threadReference } from "../../features/relay/thread-reference";

export type ChannelFile = Readonly<{
  /** The message that carries it; files are listed once per URL. */
  eventId: string;
  /** The thread it was posted in, when it is a reply. */
  threadRootId?: string | undefined;
  author: string;
  /** Unix seconds. */
  at: number;
  attachment: Attachment;
}>;
export type FileKind = Attachment["kind"] | "all";
/** One web link written in a message's text (not an attachment). */
export type ChannelLink = Readonly<{
  /** The message that carries it. */
  eventId: string;
  /** The thread it was posted in, when it is a reply. */
  threadRootId?: string | undefined;
  author: string;
  /** Unix seconds. */
  at: number;
  url: string;
  /** Link text when the writer gave one, else the site's host. */
  title: string;
}>;
export type Tab = FileKind | "link";

/** Messages someone deleted, as their own author's deletion events say. */
function deletedIds(events: readonly EventData[]) {
  const deleted = new Set<string>();
  for (const event of events)
    if (event.kind === 5)
      for (const [name, id] of event.tags)
        if (name === "e" && id) deleted.add(`${event.pubkey}:${id}`);
  return deleted;
}

/** Newest first, without deleted messages or repeated URLs. */
export function collectFiles(events: readonly EventData[]): ChannelFile[] {
  const deleted = deletedIds(events);
  const seen = new Set<string>();
  const files: ChannelFile[] = [];
  const messages = events
    .filter((event) => event.kind === 9)
    .sort((a, b) => b.created_at - a.created_at);
  for (const event of messages) {
    if (deleted.has(`${event.pubkey}:${event.id}`)) continue;
    for (const attachment of parseAttachments(event, [])) {
      if (seen.has(attachment.url)) continue;
      seen.add(attachment.url);
      files.push({
        eventId: event.id,
        threadRootId: threadReference(event)?.rootId,
        author: event.pubkey,
        at: event.created_at,
        attachment,
      });
    }
  }
  return files;
}

const isWeb = (url: string) => /^https?:\/\//i.test(url);
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Web links typed into messages, newest first, once per URL. */
export function collectLinks(events: readonly EventData[]): ChannelLink[] {
  const deleted = deletedIds(events);
  const seen = new Set<string>();
  const links: ChannelLink[] = [];
  const messages = events
    .filter((event) => event.kind === 9)
    .sort((a, b) => b.created_at - a.created_at);
  for (const event of messages) {
    if (deleted.has(`${event.pubkey}:${event.id}`)) continue;
    const attached = new Set(parseAttachments(event, []).map(({ url }) => url));
    for (const part of messageLinkParts(event.content)) {
      const { url } = part;
      if (!url || !isWeb(url) || attached.has(url) || seen.has(url)) continue;
      seen.add(url);
      links.push({
        eventId: event.id,
        threadRootId: threadReference(event)?.rootId,
        author: event.pubkey,
        at: event.created_at,
        url,
        title: part.label ?? hostOf(url),
      });
    }
  }
  return links;
}

export function filterLinks(
  links: readonly ChannelLink[],
  query: string,
): ChannelLink[] {
  const needle = query.trim().toLocaleLowerCase();
  return links.filter(
    (link) =>
      !needle ||
      link.url.toLocaleLowerCase().includes(needle) ||
      link.title.toLocaleLowerCase().includes(needle),
  );
}

/** The link in `buzz://message` form, which the app's own navigation opens.
 * A reply names its thread, or the jump cannot find it in the channel. */
export const messageLink = (
  channelId: string,
  eventId: string,
  threadRootId?: string,
) =>
  `buzz://message?${new URLSearchParams({
    channel: channelId,
    id: eventId,
    ...(threadRootId ? { thread: threadRootId } : {}),
  })}`;

export const fileName = (file: ChannelFile) =>
  file.attachment.name ??
  file.attachment.url.split("/").pop() ??
  file.attachment.kind;

export function filterFiles(
  files: readonly ChannelFile[],
  kind: FileKind,
  query: string,
): ChannelFile[] {
  const needle = query.trim().toLocaleLowerCase();
  return files.filter(
    (file) =>
      (kind === "all" || file.attachment.kind === kind) &&
      (!needle || fileName(file).toLocaleLowerCase().includes(needle)),
  );
}

export function formatSize(bytes: number | undefined) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
