import { beforeEach, expect, it } from "vitest";
import { relayMetrics } from "./relay-metrics";

beforeEach(() => relayMetrics.reset());

it("counts per community and keeps open subscriptions honest", () => {
  const url = "wss://shibal.example/relay";
  relayMetrics.socketOpened(url);
  expect(relayMetrics.sent(url, '["REQ","a",{}]')).toBe(1);
  expect(relayMetrics.sent(url, '["REQ","b",{}]')).toBe(1);
  expect(relayMetrics.sent(url, '["CLOSE","a"]')).toBe(-1);
  relayMetrics.received(url, '["EVENT","b",{}]');
  relayMetrics.read("https://shibal.example", 100);
  const row = relayMetrics.snapshot().communities[0];
  expect(row).toMatchObject({
    host: "shibal.example",
    socketsOpen: 1,
    subscriptions: 1,
    framesIn: 1,
    reads: 1,
    readBytes: 100,
  });
  // A dropped connection takes its open subscriptions with it.
  relayMetrics.socketClosed(url, 1);
  expect(relayMetrics.snapshot().communities[0]).toMatchObject({
    socketsOpen: 0,
    subscriptions: 0,
  });
});
