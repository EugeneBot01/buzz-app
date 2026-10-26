import { expect, it } from "vitest";
import { collectFiles, fileName, filterFiles, formatSize } from "./collect";

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

it("formats sizes", () => {
  expect(formatSize(undefined)).toBe("");
  expect(formatSize(2048)).toBe("2 KB");
  expect(formatSize(5 * 1024 ** 2)).toBe("5.0 MB");
});
