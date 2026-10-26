import { afterEach, expect, it, vi } from "vitest";
import { cleanups, setup } from "../../features/notifications/messages-testing";
import { flush, message } from "../../features/relay/testing";
import { channelAlertLevels } from "./channel-levels";

afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop();
  vi.restoreAllMocks();
});

it("All messages: a plain channel message alerts with the channel and sender", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
  const h = await setup();
  channelAlertLevels.setInitialDefault("all");
  h.emit([message(h.peer, "room", "lunch at noon", 1_780_000_000)], "live");
  await vi.waitFor(() => expect(h.show).toHaveBeenCalledOnce());
  expect(h.show.mock.calls[0]?.[0].body).toBe("lunch at noon");
  expect(h.show.mock.calls[0]?.[0].title).toContain("#");
});

it("Only @mentions: a plain channel message stays quiet", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
  const h = await setup();
  channelAlertLevels.setInitialDefault("all");
  channelAlertLevels.setChannel("room", "mentions");
  h.emit([message(h.peer, "room", "quiet please", 1_780_000_000)], "live");
  await flush();
  expect(h.show).not.toHaveBeenCalled();
  channelAlertLevels.setChannel("room", undefined);
});

it("own messages never alert, even in an All messages channel", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
  const h = await setup();
  channelAlertLevels.setInitialDefault("all");
  h.emit([message(h.viewer, "room", "my own note", 1_780_000_000)], "live");
  await flush();
  expect(h.show).not.toHaveBeenCalled();
});
