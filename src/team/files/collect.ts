/** Channel files (Buzz Team): every attachment a channel's messages carry. */
import type { EventData } from "../../features/relay/events";
import type { Attachment } from "../../features/relay/contracts";
import { parseAttachments } from "../../features/relay/fold";

export type ChannelFile = Readonly<{
  /** The message that carries it; files are listed once per URL. */
  eventId: string;
  author: string;
  /** Unix seconds. */
  at: number;
  attachment: Attachment;
}>;
export type FileKind = Attachment["kind"] | "all";

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
        author: event.pubkey,
        at: event.created_at,
        attachment,
      });
    }
  }
  return files;
}

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
