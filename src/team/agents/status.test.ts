import { expect, it } from "vitest";
import { nameList, splitAgents } from "./status";

it("lists agents that can answer and those resting, skipping unknown", () => {
  expect(
    splitAgents([
      { name: "꿀벌", status: "online" },
      { name: "기획봇", status: "away" },
      { name: "디자인봇", status: "offline" },
      { name: "새봇", status: "unknown" },
    ]),
  ).toEqual({ online: ["꿀벌", "기획봇"], resting: ["디자인봇"] });
});

it("shortens long name lists", () => {
  expect(nameList(["a", "b"])).toBe("a, b");
  expect(nameList(["a", "b", "c", "d", "e"])).toBe("a, b, c 외 2");
});
