/**
 * Connection meter (Buzz Team): what each community's connection costs, so we
 * can decide whether background alerts need a lighter connection. Counts only
 * sizes and message types, never content; kept in memory until the app quits.
 */
export type CommunityMeter = {
  sockets: number;
  socketsOpen: number;
  /** Subscriptions currently open (REQ minus CLOSE). */
  subscriptions: number;
  framesIn: number;
  framesOut: number;
  bytesIn: number;
  bytesOut: number;
  reads: number;
  readBytes: number;
};

const meters = new Map<string, CommunityMeter>();
let since = Date.now();
const empty = (): CommunityMeter => ({
  sockets: 0,
  socketsOpen: 0,
  subscriptions: 0,
  framesIn: 0,
  framesOut: 0,
  bytesIn: 0,
  bytesOut: 0,
  reads: 0,
  readBytes: 0,
});

/** The community a relay or community URL belongs to: its host. */
export const communityHost = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

function meter(url: string) {
  const host = communityHost(url);
  let found = meters.get(host);
  if (!found) {
    found = empty();
    meters.set(host, found);
  }
  return found;
}

export const relayMetrics = {
  socketOpened(url: string) {
    const m = meter(url);
    m.sockets++;
    m.socketsOpen++;
  },
  /** `open` is how many subscriptions the closing connection still held. */
  socketClosed(url: string, open: number) {
    const m = meter(url);
    m.socketsOpen = Math.max(0, m.socketsOpen - 1);
    m.subscriptions = Math.max(0, m.subscriptions - open);
  },
  /** Returns +1 for a subscription opened, -1 for one closed, else 0. */
  sent(url: string, data: string) {
    const m = meter(url);
    m.framesOut++;
    m.bytesOut += data.length;
    // Only the message type is read: ["REQ", …] opens, ["CLOSE", …] ends one.
    const type = /^\s*\[\s*"([A-Z]+)"/.exec(data)?.[1];
    if (type === "REQ") {
      m.subscriptions++;
      return 1;
    }
    if (type === "CLOSE") {
      m.subscriptions = Math.max(0, m.subscriptions - 1);
      return -1;
    }
    return 0;
  },
  received(url: string, data: string) {
    const m = meter(url);
    m.framesIn++;
    m.bytesIn += data.length;
  },
  read(url: string, bytes: number) {
    const m = meter(url);
    m.reads++;
    m.readBytes += bytes;
  },
  /** Every community's totals, and the minutes they cover. */
  snapshot() {
    return {
      minutes: Math.max((Date.now() - since) / 60_000, 1 / 60),
      communities: [...meters.entries()].map(([host, m]) => ({
        host,
        ...m,
      })),
    };
  },
  /** Starts the totals over; open connections and subscriptions stay counted. */
  reset() {
    for (const [host, m] of meters)
      meters.set(host, {
        ...empty(),
        socketsOpen: m.socketsOpen,
        subscriptions: m.subscriptions,
      });
    since = Date.now();
  },
};
