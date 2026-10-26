// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  DEFAULT_DIGEST,
  alreadyPosted,
  dailyNotices,
  decodeDigest,
  digestHeader,
  digestText,
  dueDigestWeek,
  encodeDigest,
  latestDigest,
  postDelaySeconds,
  weekStartOf,
} from "./weeklyDigest";

const on = {
  ...DEFAULT_DIGEST,
  enabled: true,
  channelId: "ch",
  updatedAt: 1,
  updatedBy: "a",
};
const at = (date, hour, minute = 0) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
};
const names = (pubkey) => ({ a: "구윤", b: "은서" })[pubkey] ?? pubkey;

test("weekStartOf finds Monday", () => {
  assert.equal(weekStartOf("2026-10-13"), "2026-10-12"); // Tue
  assert.equal(weekStartOf("2026-10-12"), "2026-10-12"); // Mon
  assert.equal(weekStartOf("2026-10-18"), "2026-10-12"); // Sun
});

test("digest is due from Monday 9:00 for two days, not before or when off", () => {
  assert.equal(dueDigestWeek(on, "2026-10-12", at("2026-10-12", 8, 59)), null);
  assert.equal(
    dueDigestWeek(on, "2026-10-12", at("2026-10-12", 9)),
    "2026-10-12",
  );
  assert.equal(
    dueDigestWeek(on, "2026-10-14", at("2026-10-14", 20)),
    "2026-10-12",
  );
  assert.equal(dueDigestWeek(on, "2026-10-15", at("2026-10-15", 9)), null);
  assert.equal(
    dueDigestWeek(
      { ...on, enabled: false },
      "2026-10-12",
      at("2026-10-12", 10),
    ),
    null,
  );
  assert.equal(
    dueDigestWeek(
      { ...on, channelId: null },
      "2026-10-12",
      at("2026-10-12", 10),
    ),
    null,
  );
});

test("a Sunday schedule belongs to the same Monday-start week", () => {
  const sunday = { ...on, weekday: 0, hour: 20 };
  assert.equal(
    dueDigestWeek(sunday, "2026-10-18", at("2026-10-18", 21)),
    "2026-10-12",
  );
  assert.equal(dueDigestWeek(sunday, "2026-10-13", at("2026-10-13", 21)), null);
});

test("digest text lists the week by day with attendees and multi-day ranges", () => {
  const text = digestText(
    [
      {
        id: "1",
        title: "촬영 회의",
        date: "2026-10-13",
        time: "14:00",
        endTime: "16:00",
        attendees: ["a", "b"],
        updatedAt: 1,
        updatedBy: "a",
      },
      {
        id: "2",
        title: "로케 답사",
        date: "2026-10-15",
        endDate: "2026-10-16",
        updatedAt: 1,
        updatedBy: "a",
      },
      {
        id: "3",
        title: "지난주부터",
        date: "2026-10-10",
        endDate: "2026-10-12",
        updatedAt: 1,
        updatedBy: "a",
      },
      {
        id: "4",
        title: "지움",
        date: "2026-10-13",
        deleted: true,
        updatedAt: 1,
        updatedBy: "a",
      },
      {
        id: "5",
        title: "다음주",
        date: "2026-10-19",
        updatedAt: 1,
        updatedBy: "a",
      },
    ],
    "2026-10-12",
    names,
  );
  assert.equal(text.split("\n")[0], digestHeader("2026-10-12"));
  assert.match(text, /\*\*10\/12 월\*\*\n- ~10\/12 월 지난주부터/);
  assert.match(
    text,
    /\*\*10\/13 화\*\*\n- 14:00~16:00 촬영 회의 \(구윤, 은서\)/,
  );
  assert.match(text, /- ~10\/16 금 로케 답사/);
  assert.doesNotMatch(text, /지움|다음주/);
});

test("an empty week says so", () => {
  assert.match(digestText([], "2026-10-12", names), /등록된 일정이 없습니다/);
});

test("daily notices group by channel and mention attendees", () => {
  const notices = dailyNotices(
    [
      {
        id: "1",
        title: "A",
        date: "2026-10-13",
        time: "10:00",
        notify: { channelId: "x" },
        attendees: ["a"],
        updatedAt: 1,
        updatedBy: "a",
      },
      {
        id: "2",
        title: "B",
        date: "2026-10-12",
        endDate: "2026-10-14",
        notify: { channelId: "x" },
        attendees: ["b"],
        updatedAt: 1,
        updatedBy: "a",
      },
      { id: "3", title: "C", date: "2026-10-13", updatedAt: 1, updatedBy: "a" },
      {
        id: "4",
        title: "D",
        date: "2026-10-14",
        notify: { channelId: "y" },
        updatedAt: 1,
        updatedBy: "a",
      },
    ],
    "2026-10-13",
    names,
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].channelId, "x");
  assert.deepEqual(notices[0].mentions.sort(), ["a", "b"]);
  assert.match(notices[0].text, /@구윤/);
});

test("settings round-trip and the newest wins", () => {
  const encoded = encodeDigest({ ...on, hour: 8 });
  assert.equal(decodeDigest(encoded).hour, 8);
  assert.equal(decodeDigest("{bad"), null);
  const newer = { ...on, updatedAt: 5, updatedBy: "b", hour: 7 };
  assert.equal(latestDigest([on, null, newer]).hour, 7);
  assert.equal(latestDigest([]).enabled, false);
});

test("an existing notice is recognised by its first line, and delays are stable", () => {
  const header = digestHeader("2026-10-12");
  assert.equal(alreadyPosted([{ content: `${header}\n- x` }], header), true);
  assert.equal(alreadyPosted([{ content: "다른 글" }], header), false);
  assert.equal(postDelaySeconds("abc"), postDelaySeconds("abc"));
  assert.ok(postDelaySeconds("f".repeat(64)) < 120);
});
