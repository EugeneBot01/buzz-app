import { describe, expect, it } from "vitest";
import { groupMentionSuggestions } from "./group-suggestions";

const labels = (...args: Parameters<typeof groupMentionSuggestions>) =>
  groupMentionSuggestions(...args).map(({ label }) => label);

describe("groupMentionSuggestions", () => {
  it("waits for two letters while typing in the draft", () => {
    expect(labels("", "stream")).toEqual([]);
    expect(labels("e", "stream")).toEqual([]);
    expect(labels("ev", "stream")).toEqual(["everyone"]);
  });

  it("lists both in the @ button, and narrows as you search", () => {
    expect(labels("", "stream", true)).toEqual(["all", "everyone"]);
    expect(labels("e", "stream", true)).toEqual(["everyone"]);
  });

  it("is never offered in a DM", () => {
    expect(labels("", "dm", true)).toEqual([]);
  });
});
