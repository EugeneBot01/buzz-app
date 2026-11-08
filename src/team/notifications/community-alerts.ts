/**
 * Which joined communities alert in the background (Buzz Team). A community
 * turned off here is not connected in the background at all, which is what
 * saves the work; the community in use always alerts as usual.
 */
import type { Communities } from "../../features/communities/service";

const KEY = "buzz-team-community-alerts-off.v1";
const listeners = new Set<() => void>();
let viewer: string | undefined;
let off: ReadonlySet<string> = new Set();
let attached: Communities | undefined;

const storageKey = () => `${KEY}:${viewer ?? "device"}`;

function load() {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(storageKey()) ?? "[]",
    );
    off = new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    off = new Set();
  }
}

const notify = () => {
  for (const listener of listeners) listener();
};

export const communityAlerts = {
  /** The communities service, for the settings list. */
  attach(communities: Communities) {
    attached = communities;
  },
  communities: () => attached,
  selectViewer(next: string | undefined) {
    if (next === viewer) return;
    viewer = next;
    load();
    notify();
  },
  snapshot: () => off,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isOn: (id: string) => !off.has(id),
  set(id: string, on: boolean) {
    const next = new Set(off);
    if (on) next.delete(id);
    else next.add(id);
    off = next;
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify([...next]));
    } catch {
      // The choice lasts until the app closes.
    }
    notify();
  },
};
