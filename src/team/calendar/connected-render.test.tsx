// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { bindTeamRelay } from "./compat/relay";
import { InlineDialog } from "./compat/ui";
import { TeamCalendarDialog } from "./ui/TeamCalendarDialog";

const channel = {
  id: "c1",
  name: "공지",
  channelType: "stream",
  members: ["viewer", "other"],
};
function fakeSession() {
  const list = { status: "ready", channels: [channel] };
  const profiles = new Map([
    ["viewer", { name: "나" }],
    ["other", { name: "동료" }],
  ]);
  return {
    viewer: "viewer",
    channels: {
      ensureList: () => {},
      list: () => list,
      subscribeList: () => () => {},
    },
    profiles: {
      subscribe: () => () => {},
      snapshot: () => profiles,
      ensure: async () => {},
    },
    read: async () => [],
    messages: { send: async () => {} },
    teamAppData: { publish: async () => {} },
  };
}

// Regression: the calendar once crashed only when a community was connected
// (its icons were called as functions), which the disconnected page never hit.
it("renders the calendar when connected without crashing", async () => {
  const errors: unknown[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
    errors.push(a[0]);
  });
  bindTeamRelay({
    session: fakeSession() as never,
    viewer: "viewer",
    relayUrl: "wss://shibal.communities.buzz.xyz",
    notify: () => {},
  });
  try {
    render(
      <InlineDialog value={true}>
        <TeamCalendarDialog
          open
          onOpenChange={() => {}}
          pubkey="viewer"
          relayUrl="wss://shibal.communities.buzz.xyz"
        />
      </InlineDialog>,
    );
    await new Promise((r) => setTimeout(r, 300));
  } finally {
    spy.mockRestore();
    cleanup();
  }
  expect(errors.filter((e) => /Error|Invalid|Maximum/.test(String(e)))).toEqual(
    [],
  );
});
