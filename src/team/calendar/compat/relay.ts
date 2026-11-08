/**
 * Bridge from the team calendar (written for the 0.5 app) to the new app's
 * relay session. The calendar keeps its data format, so the old team build
 * and this app read and write the same events while people move over.
 */
import type { RelaySession } from "../../../features/relay/session";

export type RelayEvent = Readonly<{
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}>;

/** kind 30078 (application data). */
export const KIND_CHANNEL_SECTIONS = 30078;

export function normalizeRelayUrl(relayUrl: string): string {
  return relayUrl.trim().replace(/\/+$/, "").toLowerCase();
}

type Binding = Readonly<{
  session: RelaySession;
  viewer: string;
  relayUrl: string;
  notify?: (input: { title: string; body: string }) => void;
}>;

let current: Binding | undefined;
const listeners = new Set<() => void>();

/** The community the calendar works in; `undefined` while none is ready. */
export function bindTeamRelay(next: Binding | undefined) {
  if (
    current?.session === next?.session &&
    current?.viewer === next?.viewer &&
    current?.relayUrl === next?.relayUrl
  )
    return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function teamRelay() {
  return current;
}

export function subscribeTeamRelay(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function need() {
  if (!current) throw new Error("커뮤니티에 연결되어 있지 않습니다.");
  return current;
}

type Filter = Readonly<Record<string, unknown>>;

/** An unsigned event: the session signs it when it publishes. */
export type EventTemplate = Readonly<{
  kind: number;
  content: string;
  createdAt?: number;
  tags: string[][];
}>;

export async function signRelayEvent(template: EventTemplate) {
  return template;
}

type Watcher = {
  rest: Record<string, unknown>;
  onEvent: (event: RelayEvent) => void;
  since: number;
};
const watchers = new Set<Watcher>();
let pollTimer: ReturnType<typeof setInterval> | undefined;
const loads = new Set<() => void>();
let reloadTimer: ReturnType<typeof setInterval> | undefined;

/** One read per group of subscriptions that differ only in `#d`. */
async function poll() {
  if (!current) return;
  const groups = new Map<string, Watcher[]>();
  for (const watcher of watchers) {
    const { "#d": _d, ...shape } = watcher.rest;
    const key = JSON.stringify(shape);
    groups.set(key, [...(groups.get(key) ?? []), watcher]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const { "#d": _d, ...shape } = first.rest;
    const tags = group.flatMap((watcher) =>
      Array.isArray(watcher.rest["#d"]) ? (watcher.rest["#d"] as string[]) : [],
    );
    const anyWithoutD = group.some((watcher) => !watcher.rest["#d"]);
    const since = Math.min(...group.map((watcher) => watcher.since));
    try {
      const events = (await current.session.read([
        {
          ...shape,
          ...(anyWithoutD ? {} : { "#d": [...new Set(tags)] }),
          since,
          // Room for every subscription's documents, so none is crowded out.
          limit: Math.min(1000, 200 * Math.max(1, new Set(tags).size)),
        } as never,
      ])) as unknown as RelayEvent[];
      for (const watcher of group) {
        const wanted = watcher.rest["#d"] as string[] | undefined;
        for (const event of events) {
          if (event.created_at < watcher.since) continue;
          const d = event.tags.find((tag) => tag[0] === "d")?.[1];
          if (wanted && (!d || !wanted.includes(d))) continue;
          watcher.since = Math.max(watcher.since, event.created_at);
          watcher.onEvent(event);
        }
      }
    } catch {
      // The next tick tries again.
    }
  }
}

export const relayClient = {
  async fetchEvents(filter: Filter): Promise<RelayEvent[]> {
    const { session } = need();
    const events = await session.read([filter as never]);
    return events as unknown as RelayEvent[];
  },
  async publishEvent(
    event: EventTemplate,
    _slow?: string,
    failed?: string,
    isCurrent?: () => boolean,
  ) {
    const binding = need();
    if (isCurrent && !isCurrent()) return;
    const publish = binding.session.teamAppData?.publish;
    if (!publish) throw new Error(failed ?? "저장할 수 없는 연결입니다.");
    await publish({
      kind: event.kind,
      content: event.content,
      tags: event.tags,
      created_at: event.createdAt ?? Math.floor(Date.now() / 1000),
    });
  },
  /** Live updates as polling: new matching events every 15 seconds. Every
   * open subscription shares one timer, and those that differ only in their
   * `d` tags share one read. */
  async subscribeLive(
    filter: Filter,
    onEvent: (event: RelayEvent) => void,
  ): Promise<() => Promise<void>> {
    const { limit: _limit, ...rest } = filter as Record<string, unknown>;
    const watcher: Watcher = {
      rest,
      onEvent,
      since: Math.floor(Date.now() / 1000) - 5,
    };
    watchers.add(watcher);
    pollTimer ??= setInterval(() => void poll(), 15_000);
    return async () => {
      watchers.delete(watcher);
      if (!watchers.size && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };
  },
  /** Runs `load` when the connection comes back, and every minute so other
   * members' changes show up even if a poll was missed. One shared timer. */
  subscribeToReconnects(load: () => void) {
    loads.add(load);
    reloadTimer ??= setInterval(() => {
      for (const each of loads) each();
    }, 60_000);
    const stop = subscribeTeamRelay(load);
    return () => {
      loads.delete(load);
      if (!loads.size && reloadTimer) {
        clearInterval(reloadTimer);
        reloadTimer = undefined;
      }
      stop();
    };
  },
};

/** Posts a plain message to a channel as the viewer. */
export async function sendChannelMessage(
  channelId: string,
  content: string,
  ..._rest: unknown[]
) {
  const { session } = need();
  await session.messages.send(channelId, content);
}

/** The newest channel messages before `before`, newest first. */
export async function getChannelMessagesBefore(
  channelId: string,
  before: { createdAt: number; eventId?: string },
  limit: number,
) {
  const { session } = need();
  const events = (await session.read([
    { kinds: [9], "#h": [channelId], until: before.createdAt, limit } as never,
  ])) as unknown as RelayEvent[];
  return { events: [...events].sort((a, b) => b.created_at - a.created_at) };
}

export async function sendDesktopNotification(input: {
  title: string;
  body: string;
}) {
  current?.notify?.(input);
}
