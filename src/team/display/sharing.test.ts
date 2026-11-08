import { expect, it } from "vitest";
import { renameProfile, saveProfile, shareProfile } from "./profiles";
import { DEFAULT_DISPLAY } from "./settings";
import { encodeShared, readShared, sharedDTag } from "./sharing";

const mine = saveProfile([], "업무용", DEFAULT_DISPLAY, 1);
const A = "team-ui-profiles:a";
const B = "team-ui-profiles:b";

it("renames only to a free name", () => {
  const two = saveProfile(mine, "회의용", DEFAULT_DISPLAY, 2);
  expect(renameProfile(two, "업무용", " 집중 ").map((p) => p.name)).toEqual([
    "회의용",
    "집중",
  ]);
  expect(() => renameProfile(two, "업무용", "회의용")).toThrow();
});

it("shares per community within a limit, and keeps sharing when overwritten", () => {
  const shared = shareProfile(mine, "업무용", A, true, 1);
  expect(shared[0]?.sharedIn).toEqual([A]);
  const two = saveProfile(shared, "회의용", DEFAULT_DISPLAY, 2);
  expect(() => shareProfile(two, "회의용", A, true, 1)).toThrow();
  // Another community has its own limit.
  expect(shareProfile(two, "회의용", B, true, 1)[0]?.sharedIn).toEqual([B]);
  expect(
    saveProfile(shared, "업무용", DEFAULT_DISPLAY, 3)[0]?.sharedIn,
  ).toEqual([A]);
});

it("publishes only the look: no work area layout or sharing list", () => {
  const withLayout = shareProfile(
    saveProfile([], "업무용", DEFAULT_DISPLAY, 1, { layout: { secret: 1 } }),
    "업무용",
    A,
    true,
    10,
  );
  const content = encodeShared(withLayout);
  expect(content).not.toContain("secret");
  expect(content).not.toContain("sharedIn");
});

it("reads each teammate's newest shared list, one row per name", () => {
  const older = { pubkey: "a", content: encodeShared(mine), created_at: 1 };
  const newer = {
    pubkey: "a",
    content: encodeShared(saveProfile([], "새 프로필", DEFAULT_DISPLAY, 5)),
    created_at: 5,
  };
  const broken = { pubkey: "b", content: "not json", created_at: 9 };
  const repeated = {
    pubkey: "c",
    content: JSON.stringify({ profiles: [...mine, ...mine] }),
    created_at: 2,
  };
  const read = readShared([older, newer, broken, repeated]);
  expect(read.map((entry) => entry.author)).toEqual(["a", "c"]);
  expect(read[0]?.profiles.map((p) => p.name)).toEqual(["새 프로필"]);
  expect(read[1]?.profiles).toHaveLength(1);
  expect(sharedDTag("wss://relay.example")).toBe(
    "team-ui-profiles:wss://relay.example",
  );
});
