import { expect, it } from "vitest";
import { expandGroupMentions, groupMentions } from "./group-mentions";

it("finds @all and @everyone, never inside code, addresses or longer words", () => {
  expect([...groupMentions("@everyone 회의 10분 전")]).toEqual(["everyone"]);
  expect([...groupMentions("hey @ALL please")]).toEqual(["all"]);
  expect(groupMentions("`@all` and ```\n@everyone\n```").size).toBe(0);
  expect(groupMentions("me@all.com /@all @allison @everyone-x").size).toBe(0);
});

it("@everyone adds people only; @all adds agents too; the sender is skipped", () => {
  const members = ["me", "ann", "bob", "bot"];
  const agent = (key: string) => key === "bot";
  expect(expandGroupMentions("@everyone hi", [], members, "me", agent)).toEqual(
    ["ann", "bob"],
  );
  expect(expandGroupMentions("@all hi", ["x"], members, "me", agent)).toEqual([
    "x",
    "ann",
    "bob",
    "bot",
  ]);
  expect(expandGroupMentions("hi", ["x"], members, "me", agent)).toEqual(["x"]);
});
