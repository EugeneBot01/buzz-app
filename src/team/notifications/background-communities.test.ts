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
