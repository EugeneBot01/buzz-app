/**
 * Channel shortcuts (Buzz Team): a short row of links (Notion, Drive, Figma,
 * ...) at the top of a channel. One plaintext kind-30078 document per editor;
 * readers keep the newest one written by a current channel member.
 */
export const SHORTCUTS_TAG = "team-shortcuts";
export const MAX_SHORTCUTS = 12;

export const shortcutsDTag = (relayUrl: string, channelId: string) =>
  `${SHORTCUTS_TAG}:${relayUrl}:${channelId}`;

export type Shortcut = Readonly<{ title: string; url: string }>;
export type ShortcutsDoc = Readonly<{
  version: 1;
  links: readonly Shortcut[];
  updatedAt: number;
}>;

/** An https address, or null; anything else could run or leak when clicked. */
export function safeShortcutUrl(raw: string): string | null {
  const text = raw.trim();
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`,
    );
    return url.protocol === "https:" && url.hostname.includes(".")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** A short name for a link when none was given: its site's name. */
export function shortcutTitle(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const known: Record<string, string> = {
    "notion.so": "Notion",
    "meet.google.com": "구글 미트",
    "drive.google.com": "Drive",
    "docs.google.com": "Google Docs",
    "figma.com": "Figma",
    "github.com": "GitHub",
    "linear.app": "Linear",
  };
  return known[host] ?? host.split(".")[0] ?? host;
}

export function encodeShortcuts(links: readonly Shortcut[], now = Date.now()) {
  const doc: ShortcutsDoc = {
    version: 1,
    links: links.slice(0, MAX_SHORTCUTS),
    updatedAt: now,
  };
  return JSON.stringify(doc);
}

export function decodeShortcuts(content: string): ShortcutsDoc | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { version, links, updatedAt } = raw as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(links)) return null;
  const valid: Shortcut[] = [];
  for (const entry of links) {
    if (!entry || typeof entry !== "object") continue;
    const { title, url } = entry as Record<string, unknown>;
    const safe = typeof url === "string" ? safeShortcutUrl(url) : null;
    if (!safe) continue;
    const name = typeof title === "string" ? title.trim().slice(0, 60) : "";
    valid.push({ title: name || shortcutTitle(safe), url: safe });
    if (valid.length === MAX_SHORTCUTS) break;
  }
  return {
    version: 1,
    links: valid,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  };
}

/** The newest readable document written by a current channel member. */
export function latestShortcuts(
  events: readonly { pubkey: string; content: string; created_at: number }[],
  members: ReadonlySet<string>,
): ShortcutsDoc | null {
  let best: { at: number; doc: ShortcutsDoc } | undefined;
  for (const event of events) {
    if (!members.has(event.pubkey)) continue;
    const doc = decodeShortcuts(event.content);
    if (doc && (!best || event.created_at > best.at))
      best = { at: event.created_at, doc };
  }
  return best?.doc ?? null;
}

/** Whether an address is a Google Meet room (or its `/new` page). */
export function isMeet(url: string) {
  try {
    return new URL(url).hostname === "meet.google.com";
  } catch {
    return false;
  }
}
