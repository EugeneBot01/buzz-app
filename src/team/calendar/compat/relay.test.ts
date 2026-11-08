import { afterEach, expect, it, vi } from "vitest";
import { bindTeamRelay, relayClient } from "./relay";

afterEach(() => {
  bindTeamRelay(undefined);
  vi.useRealTimers();
});

it("polls every open month with one read and hands each its own events", async () => {
  vi.useFakeTimers();
  const read = vi.fn(async () => [
    {
      id: "1",
      pubkey: "p",
      kind: 30078,
      created_at: 9e9,
      content: "",
      tags: [["d", "cal:2026-10"]],
      sig: "",
    },
    {
      id: "2",
      pubkey: "p",
      kind: 30078,
      created_at: 9e9,
      content: "",
      tags: [["d", "cal:2026-11"]],
      sig: "",
    },
  ]);
  bindTeamRelay({ session: { read } } as never);
  const october = vi.fn();
  const november = vi.fn();
  const stopA = await relayClient.subscribeLive(
    { kinds: [30078], "#d": ["cal:2026-10"] } as never,
    october,
  );
  const stopB = await relayClient.subscribeLive(
    { kinds: [30078], "#d": ["cal:2026-11"] } as never,
    november,
  );
  await vi.advanceTimersByTimeAsync(15_000);
  expect(read).toHaveBeenCalledTimes(1);
  const [filters] = read.mock.calls[0] as unknown as [{ "#d": string[] }[]];
  expect(filters[0]?.["#d"]).toEqual(["cal:2026-10", "cal:2026-11"]);
  expect(october).toHaveBeenCalledTimes(1);
  expect(november).toHaveBeenCalledTimes(1);
  // The same events come back on the next read; nobody hears them twice.
  await vi.advanceTimersByTimeAsync(15_000);
  expect(october).toHaveBeenCalledTimes(1);
  expect(november).toHaveBeenCalledTimes(1);
  await stopA();
  await stopB();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(read).toHaveBeenCalledTimes(2);
});
