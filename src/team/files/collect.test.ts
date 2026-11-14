import { describe, expect, it } from "vitest";
import {
  collectFiles,
  collectLinks,
  fileName,
  filterFiles,
  filterLinks,
  formatSize,
  messageLink,
} from "./collect";

const hash = (n: number) => String(n).repeat(64).slice(0, 64);
const message = (
  id: string,
  at: number,
  files: { n: number; name: string; mime: string }[],
  pubkey = "a".repeat(64),
) => ({
  id,
  pubkey,
  kind: 9,
  created_at: at,
  content: "",
  sig: "",
  tags: files.map(({ n, name, mime }) => [
    "imeta",
    `url https://relay.test/media/${hash(n)}`,
    `m ${mime}`,
    `filename ${name}`,
    "size 2048",
  ]),
});

const events = [
  message("m1", 10, [{ n: 1, name: "기획서.pdf", mime: "application/pdf" }]),
  message("m2", 20, [
    { n: 2, name: "photo.png", mime: "image/png" },
    { n: 1, name: "기획서.pdf", mime: "application/pdf" },
  ]),
  message("m3", 30, [{ n: 3, name: "memo.m4a", mime: "audio/mp4" }]),
  {
    id: "d1",
    pubkey: "a".repeat(64),
    kind: 5,
    created_at: 40,
    content: "",
    sig: "",
    tags: [["e", "m3"]],
  },
];

it("lists each file once, newest first, without deleted messages", () => {
  const files = collectFiles(events);
  expect(files.map(fileName)).toEqual(["photo.png", "기획서.pdf"]);
  expect(files[0]?.attachment.size).toBe(2048);
});

it("ignores a deletion by someone other than the author", () => {
  const forged = { ...events[3], pubkey: "b".repeat(64) } as never;
  expect(collectFiles([...events.slice(0, 3), forged]).map(fileName)).toContain(
    "memo.m4a",
  );
});

it("filters by kind and name", () => {
  const files = collectFiles(events.slice(0, 3));
  expect(filterFiles(files, "image", "").map(fileName)).toEqual(["photo.png"]);
  expect(filterFiles(files, "all", "기획").map(fileName)).toEqual([
    "기획서.pdf",
  ]);
});

it("keeps voice as its own kind", () => {
  const files = collectFiles(events.slice(0, 3));
  expect(filterFiles(files, "audio", "").map(fileName)).toEqual(["memo.m4a"]);
  expect(filterFiles(files, "file", "").map(fileName)).toEqual(["기획서.pdf"]);
  expect(filterFiles(files, "video", "")).toEqual([]);
});

const text = (
  id: string,
  at: number,
  content: string,
  pubkey = "a".repeat(64),
) => ({
  id,
  pubkey,
  kind: 9,
  created_at: at,
  content,
  sig: "",
  tags: [],
});

const talk = [
  text("t1", 10, "참고: https://example.com/a?x=1 이거 보세요"),
  text(
    "t2",
    20,
    "[기사](https://news.test/story) 와 https://example.com/a?x=1",
  ),
  text("t3", 30, "보지 마 ftp://old.test/file 그리고 buzz://channel/abc"),
  text("t4", 40, "지운 글 https://gone.test/x"),
  { ...text("d1", 50, ""), kind: 5, tags: [["e", "t4"]] },
];

it("collects web links from message text, newest first, once each", () => {
  const links = collectLinks(talk);
  expect(links.map((link) => link.url)).toEqual([
    "https://news.test/story",
    "https://example.com/a?x=1",
  ]);
  // The repeated URL points at the newest message that wrote it.
  expect(links[1]?.eventId).toBe("t2");
  expect(links[0]).toMatchObject({
    title: "기사",
    author: "a".repeat(64),
    at: 20,
  });
  expect(links[1]?.title).toBe("example.com");
});

it("does not list an attachment's own URL as a link", () => {
  const withFile = {
    ...message("m9", 60, [{ n: 9, name: "x.png", mime: "image/png" }]),
    content: `https://relay.test/media/${hash(9)}`,
  };
  expect(collectLinks([withFile])).toEqual([]);
});

it("searches links by title and address", () => {
  const links = collectLinks(talk);
  expect(filterLinks(links, "기사").map((link) => link.url)).toEqual([
    "https://news.test/story",
  ]);
  expect(filterLinks(links, "EXAMPLE").length).toBe(1);
  expect(filterLinks(links, "").length).toBe(2);
});

it("builds the message link the app's navigation understands", () => {
  expect(messageLink("chan1", "evt1")).toBe(
    "buzz://message?channel=chan1&id=evt1",
  );
});

it("formats sizes", () => {
  expect(formatSize(undefined)).toBe("");
  expect(formatSize(2048)).toBe("2 KB");
  expect(formatSize(5 * 1024 ** 2)).toBe("5.0 MB");
});

describe("jumping to a reply", () => {
  it("names the thread so the jump can reach a reply", () => {
    const root = "a".repeat(64);
    expect(messageLink("c1", "b".repeat(64), root)).toContain(`thread=${root}`);
    expect(messageLink("c1", "b".repeat(64))).not.toContain("thread=");
  });
});
