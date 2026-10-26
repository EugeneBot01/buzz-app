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
  /** Live updates as polling: new matching events every 15 seconds. */
  async subscribeLive(
    filter: Filter,
    onEvent: (event: RelayEvent) => void,
  ): Promise<() => Promise<void>> {
    let since = Math.floor(Date.now() / 1000) - 5;
    let stopped = false;
    const { limit: _limit, ...rest } = filter as Record<string, unknown>;
    const tick = async () => {
      if (stopped || !current) return;
      try {
        const events = await current.session.read([
          { ...rest, since, limit: 200 } as never,
        ]);
        for (const event of events as unknown as RelayEvent[]) {
          since = Math.max(since, event.created_at);
          onEvent(event);
        }
      } catch {
        // The next tick tries again.
      }
    };
    const timer = setInterval(() => void tick(), 15_000);
    return async () => {
      stopped = true;
      clearInterval(timer);
    };
  },
  /** Runs `load` when the connection comes back, and every 30 seconds so
   * other members' changes show up without a live subscription. */
  subscribeToReconnects(load: () => void) {
    const timer = setInterval(load, 30_000);
    const stop = subscribeTeamRelay(load);
    return () => {
      clearInterval(timer);
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
