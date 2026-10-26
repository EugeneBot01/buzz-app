import { expect, it } from "vitest";
import { isTeamAppData } from "./app-data";

const base = {
  kind: 30078,
  content: "{}",
  tags: [
    ["d", "team-calendar:wss://shibal.communities.buzz.xyz:2026-10"],
    ["t", "team-calendar"],
  ],
};

it("accepts the team calendar documents the 0.5 team build wrote", () => {
  expect(isTeamAppData(base)).toBe(true);
  expect(
    isTeamAppData({
      ...base,
      tags: [
        ["d", "team-calendar-polls:wss://x"],
        ["t", "team-calendar-polls"],
      ],
    }),
  ).toBe(true);
});

it("refuses other app data, extra tags, other kinds and huge content", () => {
  expect(isTeamAppData({ ...base, tags: [["d", "recipe:1"]] })).toBe(false);
  expect(isTeamAppData({ ...base, tags: [...base.tags, ["p", "x"]] })).toBe(
    false,
  );
  expect(isTeamAppData({ ...base, kind: 1 })).toBe(false);
  expect(isTeamAppData({ ...base, content: "x".repeat(61 * 1024) })).toBe(
    false,
  );
});
