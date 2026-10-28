import { expect, it } from "vitest";
import {
  decodeShortcuts,
  encodeShortcuts,
  isMeet,
  latestShortcuts,
  safeShortcutUrl,
  shortcutTitle,
} from "./links";

it("accepts only https addresses, adding https when missing", () => {
  expect(safeShortcutUrl("notion.so/team")).toBe("https://notion.so/team");
  expect(safeShortcutUrl("https://drive.google.com/x")).toBe(
    "https://drive.google.com/x",
  );
  expect(safeShortcutUrl("http://example.com")).toBeNull();
  expect(safeShortcutUrl("javascript:alert(1)")).toBeNull();
  expect(safeShortcutUrl("file:///etc/passwd")).toBeNull();
  expect(safeShortcutUrl("nothing")).toBeNull();
});

it("names known sites", () => {
  expect(shortcutTitle("https://www.notion.so/a")).toBe("Notion");
  expect(shortcutTitle("https://www.figma.com/file/x")).toBe("Figma");
  expect(shortcutTitle("https://meet.google.com/abc-defg-hij")).toBe(
    "구글 미트",
  );
  expect(safeShortcutUrl("meet.google.com/abc-defg-hij")).toBe(
    "https://meet.google.com/abc-defg-hij",
  );
  expect(shortcutTitle("https://example.org/a")).toBe("example");
});

it("round-trips and drops unsafe links", () => {
  const doc = decodeShortcuts(
    JSON.stringify({
      version: 1,
      links: [
        { title: "기획서", url: "https://notion.so/p" },
        { title: "bad", url: "javascript:x" },
        { url: "https://www.figma.com/f" },
      ],
    }),
  );
  expect(doc?.links).toEqual([
    { title: "기획서", url: "https://notion.so/p" },
    { title: "Figma", url: "https://www.figma.com/f" },
  ]);
  expect(decodeShortcuts(encodeShortcuts(doc?.links ?? [], 3))?.updatedAt).toBe(
    3,
  );
});

it("keeps the newest document from a channel member", () => {
  const doc = (title: string) =>
    encodeShortcuts([{ title, url: "https://a.com" }]);
  const events = [
    { pubkey: "me", content: doc("old"), created_at: 1 },
    { pubkey: "outsider", content: doc("spam"), created_at: 9 },
    { pubkey: "you", content: doc("new"), created_at: 5 },
  ];
  expect(latestShortcuts(events, new Set(["me", "you"]))?.links[0]?.title).toBe(
    "new",
  );
});

it("recognises Google Meet rooms", () => {
  expect(isMeet("https://meet.google.com/abc-defg-hij")).toBe(true);
  expect(isMeet("https://notmeet.google.com.evil.com/x")).toBe(false);
  expect(isMeet("nope")).toBe(false);
});
