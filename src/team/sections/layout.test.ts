import { expect, it } from "vitest";
import {
  decodeLayout,
  latestLayout,
  layoutFromGroups,
  planFiling,
} from "./layout";

const groups = {
  sections: [
    { id: "s2", name: "프로젝트", order: 2 },
    { id: "s1", name: "공지", order: 1 },
  ],
  assignments: { notice: "s1", alpha: "s2", beta: "s2" },
};

it("captures folders in sidebar order and round-trips", () => {
  const layout = layoutFromGroups(groups, 7);
  expect(layout.sections).toEqual([
    { name: "공지", channels: ["notice"] },
    { name: "프로젝트", channels: ["alpha", "beta"] },
  ]);
  expect(decodeLayout(JSON.stringify(layout))).toEqual(layout);
});

it("drops repeated folders, repeated channels and broken data", () => {
  expect(decodeLayout("{bad")).toBeNull();
  const layout = decodeLayout(
    JSON.stringify({
      version: 1,
      sections: [
        { name: "A", channels: ["x", "x"] },
        { name: " a ", channels: ["y"] },
        { name: "B", channels: ["x", 3, "z"] },
        { name: "" },
      ],
    }),
  );
  expect(layout?.sections).toEqual([
    { name: "A", channels: ["x"] },
    { name: "B", channels: ["z"] },
  ]);
});

it("trusts only owners and admins, newest first", () => {
  const doc = (name: string) =>
    JSON.stringify({ version: 1, sections: [{ name, channels: [] }] });
  const events = [
    { pubkey: "admin", content: doc("old"), created_at: 1 },
    { pubkey: "member", content: doc("spam"), created_at: 9 },
    { pubkey: "owner", content: doc("new"), created_at: 5 },
  ];
  expect(
    latestLayout(events, new Set(["admin", "owner"]))?.sections[0]?.name,
  ).toBe("new");
});

it("files only joined, unfiled channels and reuses same-named folders", () => {
  const layout = layoutFromGroups(groups);
  let n = 0;
  const steps = planFiling(
    layout,
    {
      sections: [{ id: "mine", name: "공지 ", order: 0 }],
      assignments: { beta: "mine" },
    },
    new Set(["notice", "alpha", "beta"]),
    () => `new-${++n}`,
  );
  expect(steps).toEqual([
    { channelId: "notice", sectionId: "mine" },
    { channelId: "alpha", create: { id: "new-1", name: "프로젝트" } },
  ]);
});
