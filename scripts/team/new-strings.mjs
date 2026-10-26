// Team build: English strings added between two extractions that the Korean
// dictionary does not cover yet. Prints Markdown for the weekly report.
// Usage: node scripts/team/new-strings.mjs before.json after.json
import fs from "node:fs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const [beforeFile, afterFile] = process.argv.slice(2);
const before = read(beforeFile);
const after = read(afterFile);
const exact = read(
  new URL("../../src/team/i18n/ko-exact.json", import.meta.url),
);
const patterns = read(
  new URL("../../src/team/i18n/ko-patterns.json", import.meta.url),
);
const known = (text) => text in exact || text in patterns;

const fresh = Object.entries(after).filter(
  ([text]) => !(text in before) && !known(text),
);
if (!fresh.length) {
  console.log("새로 생긴 영어 문구 중 번역이 필요한 것은 없어요. ✅");
} else {
  console.log(`번역이 필요한 새 영어 문구 ${fresh.length}개:\n`);
  for (const [text, file] of fresh.slice(0, 300))
    console.log(`- \`${text.replaceAll("`", "'")}\` — ${file}`);
  if (fresh.length > 300) console.log(`\n…외 ${fresh.length - 300}개`);
}
