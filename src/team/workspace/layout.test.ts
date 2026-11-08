import { expect, it } from "vitest";
import {
  defaultWorkspace,
  layoutPages,
  pageTab,
  readWorkspace,
  WORKSPACE_PAGE,
} from "./layout";

const pages = [
  { key: "buzz.channels/channels", title: "Messages" },
  { key: "buzz.team.calendar/calendar", title: "Calendar" },
  { key: "buzz.reminders/reminders", title: "Reminders" },
];

it("starts with Messages beside another page", () => {
  expect(layoutPages(defaultWorkspace(pages))).toEqual([
    "buzz.channels/channels",
    "buzz.team.calendar/calendar",
  ]);
});

it("keeps a saved arrangement, dropping gone, repeated and self panels", () => {
  const saved = {
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          children: [pageTab("buzz.reminders/reminders", "R")],
        },
        {
          type: "tabset",
          children: [
            pageTab("gone.plugin/page", "Gone"),
            pageTab(WORKSPACE_PAGE, "Me"),
            pageTab("buzz.reminders/reminders", "Again"),
          ],
        },
        { type: "tabset", children: [pageTab("buzz.channels/channels", "M")] },
      ],
    },
  };
  const { layout, missing } = readWorkspace(saved, pages);
  expect(missing).toBe(1);
  expect(layoutPages(layout)).toEqual([
    "buzz.reminders/reminders",
    "buzz.channels/channels",
  ]);
  // The group left empty disappears.
  expect((layout.layout.children ?? []).length).toBe(2);
});

it("falls back to the default when nothing usable was saved", () => {
  expect(readWorkspace(null, pages).layout).toEqual(defaultWorkspace(pages));
  expect(
    readWorkspace(
      { layout: { type: "row", children: [pageTab("gone/x", "x")] } },
      pages,
    ),
  ).toEqual({ layout: defaultWorkspace(pages), missing: 1 });
});
