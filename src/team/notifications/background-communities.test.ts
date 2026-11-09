// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const bound: string[] = [];
const unbound: string[] = [];
vi.mock("../../features/notifications/messages", () => ({
  bindMessageNotifications: (
    _notifications: unknown,
    _communities: unknown,
    background: { id: string },
  ) => {
    bound.push(background.id);
    return () => unbound.push(background.id);
  },
}));

const { bindBackgroundCommunityAlerts } = await import(
  "./background-communities"
);
const { communityAlerts } = await import("./community-alerts");

const memberships = ["a", "b", "c"].map((id) => ({ id, name: id }));
const communities = {
  snapshot: () => ({ viewer: "me", memberships, selected: "a" }),
  subscribe: () => () => {},
  open: () => ({ disconnect() {}, retry() {} }),
} as never;

beforeEach(() => {
  vi.useFakeTimers();
  bound.length = 0;
  unbound.length = 0;
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

it("connects joined communities one at a time, skipping ones turned off", () => {
  communityAlerts.selectViewer("me");
  communityAlerts.set("b", false);
  const stop = bindBackgroundCommunityAlerts({} as never, communities);
  vi.advanceTimersByTime(4_999);
  expect(bound).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(bound).toEqual(["a"]);
  vi.advanceTimersByTime(3_000);
  expect(bound).toEqual(["a", "c"]);
  // Turning one off stops its alerts at once.
  communityAlerts.set("c", false);
  expect(unbound).toEqual(["c"]);
  stop();
  expect(unbound).toEqual(["c", "a"]);
});

it("disconnects a community turned off unless shown or used by agents, and reconnects it", () => {
  communityAlerts.selectViewer("me");
  // The on/off list is kept in memory between tests.
  for (const id of ["a", "b", "c"]) communityAlerts.set(id, true);
  const calls: string[] = [];
  let selected = "a";
  const listeners = new Set<() => void>();
  const live = {
    snapshot: () => ({ viewer: "me", memberships, selected }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: (id: string) => ({
      disconnect: () => calls.push(`disconnect ${id}`),
      retry: () => calls.push(`retry ${id}`),
    }),
  } as never;
  const stop = bindBackgroundCommunityAlerts(
    {} as never,
    live,
    () => new Set(["c"]),
  );
  vi.advanceTimersByTime(5_000 + 3_000 * 2);
  expect(bound).toEqual(["a", "b", "c"]);
  // Shown, or an agent works there: alerts stop, the connection stays.
  communityAlerts.set("a", false);
  communityAlerts.set("c", false);
  expect(calls).toEqual([]);
  communityAlerts.set("b", false);
  expect(calls).toEqual(["disconnect b"]);
  // Opening it reconnects it.
  selected = "b";
  for (const listener of listeners) listener();
  expect(calls).toEqual(["disconnect b", "retry b"]);
  stop();
  for (const id of ["a", "b", "c"]) communityAlerts.set(id, true);
});
