/**
 * Per-channel alert levels (Buzz Team, Discord-style).
 *
 * "all": every new message in the channel alerts.
 * "mentions": only @mentions, direct messages and thread replies alert
 * (the app's built-in behavior). Channel mute ("Nothing") stays the app's own
 * Mute, which already silences everything except explicit mentions.
 *
 * Choices are local to this device and account.
 */
export type ChannelAlertLevel = "all" | "mentions";
export type ChannelAlertLevels = Readonly<{
  defaultLevel: ChannelAlertLevel;
  overrides: Readonly<Record<string, ChannelAlertLevel>>;
}>;

const KEY = "buzz-team-channel-alert-levels.v1";
let DEFAULT: ChannelAlertLevels = Object.freeze({
  defaultLevel: "all",
  overrides: Object.freeze({}),
});

let viewer: string | undefined;
let state: ChannelAlertLevels = DEFAULT;
const listeners = new Set<() => void>();

const isLevel = (value: unknown): value is ChannelAlertLevel =>
  value === "all" || value === "mentions";

export function parseLevels(raw: unknown): ChannelAlertLevels {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT;
  const value = raw as Record<string, unknown>;
  const overrides: Record<string, ChannelAlertLevel> = {};
  if (value.overrides && typeof value.overrides === "object")
    for (const [id, level] of Object.entries(value.overrides))
      if (id.length <= 128 && isLevel(level)) overrides[id] = level;
  return Object.freeze({
    defaultLevel: isLevel(value.defaultLevel)
      ? value.defaultLevel
      : DEFAULT.defaultLevel,
    overrides: Object.freeze(overrides),
  });
}

function storageKey() {
  return `${KEY}:${viewer ?? "device"}`;
}

function restore() {
  try {
    const raw = window.localStorage.getItem(storageKey());
    state = raw ? parseLevels(JSON.parse(raw)) : DEFAULT;
  } catch {
    state = DEFAULT;
  }
  for (const listener of listeners) listener();
}

function save(next: ChannelAlertLevels) {
  state = next;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    // The choice still applies for this session.
  }
  for (const listener of listeners) listener();
}

export const channelAlertLevels = {
  selectViewer(next: string | undefined) {
    if (next === viewer) return;
    viewer = next;
    restore();
  },
  snapshot: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** The level in effect for a channel: its own choice, else the default. */
  level(channelId: string): ChannelAlertLevel {
    return state.overrides[channelId] ?? state.defaultLevel;
  },
  /** `undefined` clears the channel's own choice so it follows the default. */
  setChannel(channelId: string, level: ChannelAlertLevel | undefined) {
    const overrides = { ...state.overrides };
    if (level) overrides[channelId] = level;
    else delete overrides[channelId];
    save(Object.freeze({ ...state, overrides: Object.freeze(overrides) }));
  },
  setDefault(level: ChannelAlertLevel) {
    save(Object.freeze({ ...state, defaultLevel: level }));
  },
  /** The default for accounts that never chose one (tests use "mentions"). */
  setInitialDefault(level: ChannelAlertLevel) {
    DEFAULT = Object.freeze({
      defaultLevel: level,
      overrides: Object.freeze({}),
    });
    restore();
  },
  /** Every channel follows the default again. */
  resetChannels() {
    save(Object.freeze({ ...state, overrides: Object.freeze({}) }));
  },
};

if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey() || event.key === null) restore();
  });
