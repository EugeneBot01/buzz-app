// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import {
  decodeOnboarding,
  encodeOnboarding,
  latestOnboarding,
  pendingDefaults,
  readProgress,
  writeProgress,
} from "./defaults";

const general = { id: "general", name: "일반" };
const notice = { id: "notice", name: "공지" };

beforeEach(() => window.localStorage.clear());

it("round-trips and drops broken or repeated channels", () => {
  const doc = decodeOnboarding(encodeOnboarding([general, notice], 5));
  expect(doc).toEqual({
    version: 1,
    channels: [general, notice],
    updatedAt: 5,
  });
  expect(decodeOnboarding("{bad")).toBeNull();
  expect(decodeOnboarding('{"version":2,"channels":[]}')).toBeNull();
  expect(
    decodeOnboarding(
      JSON.stringify({ version: 1, channels: [general, general, { id: 3 }] }),
    )?.channels,
  ).toEqual([general]);
});

it("trusts only the newest document from an owner or admin", () => {
  const events = [
    { pubkey: "admin", content: encodeOnboarding([general]), created_at: 1 },
    { pubkey: "member", content: encodeOnboarding([notice]), created_at: 9 },
    { pubkey: "owner", content: encodeOnboarding([notice]), created_at: 5 },
  ];
  expect(
    latestOnboarding(events, new Set(["admin", "owner"]))?.channels,
  ).toEqual([notice]);
  expect(latestOnboarding(events, new Set())).toBeNull();
});

it("never re-adds a channel that was joined or tried before", () => {
  const doc = decodeOnboarding(encodeOnboarding([general, notice]));
  expect(pendingDefaults(doc, new Set(["general"]), new Set())).toEqual([
    notice,
  ]);
  expect(
    pendingDefaults(doc, new Set(), new Set(["general", "notice"])),
  ).toEqual([]);
});

it("remembers progress per person and community", () => {
  expect(readProgress("me", "c")).toEqual({ welcomed: false, attempted: [] });
  writeProgress("me", "c", { welcomed: true, attempted: ["general"] });
  expect(readProgress("me", "c")).toEqual({
    welcomed: true,
    attempted: ["general"],
  });
  expect(readProgress("me", "other").welcomed).toBe(false);
});
