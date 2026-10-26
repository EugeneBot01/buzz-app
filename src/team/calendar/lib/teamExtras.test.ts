// @ts-nocheck -- ported from the 0.5 team build as plain JS tests
import assert from "node:assert/strict";
import { test } from "vitest";

import { parseSchedule, titleFromMessage } from "./parseSchedule";
import {
  REPEAT_DOC,
  decodeMonth,
  docOfEntry,
  encodeMonth,
  expandRepeats,
  isAttendee,
  validateRange,
} from "./teamCalendar";
import {
  decodePollDoc,
  encodePollDoc,
  mergePollEvents,
  pollOptions,
  tallyPoll,
  validatePoll,
} from "./teamPolls";
import {
  dueReminders,
  occurrenceStartMs,
  parseReminderOverrides,
  reminderLabel,
  reminderOffsets,
} from "./teamReminders";

const A = "a".repeat(64);
const B = "b".repeat(64);
const entry = (fields) => ({
  id: "e1",
  title: "회의",
  date: "2026-10-12",
  updatedAt: 1,
  updatedBy: A,
  ...fields,
});

test("a repeating entry is stored in the repeat document and round-trips", () => {
  const weekly = entry({
    repeat: { every: "weekly", until: "2026-12-31" },
    skip: ["2026-10-19"],
    attendees: [B, A],
  });
  assert.equal(docOfEntry(weekly), REPEAT_DOC);
  assert.equal(docOfEntry(entry({})), "2026-10");
  const decoded = decodeMonth(encodeMonth({ e1: weekly }), REPEAT_DOC);
  assert.deepEqual(decoded.e1.repeat, { every: "weekly", until: "2026-12-31" });
  assert.deepEqual(decoded.e1.skip, ["2026-10-19"]);
  assert.deepEqual(decoded.e1.attendees, [A, B]);
  // A month document never carries a repeat, and the repeat document never
  // carries an entry that does not repeat.
  assert.equal(
    decodeMonth(encodeMonth({ e1: weekly }), "2026-10").e1.repeat,
    undefined,
  );
  assert.deepEqual(decodeMonth(encodeMonth({ e1: entry({}) }), REPEAT_DOC), {});
});

test("repeats expand inside the window, skipping removed days", () => {
  const weekly = entry({ repeat: { every: "weekly" }, skip: ["2026-10-19"] });
  const dates = expandRepeats([weekly], "2026-10-01", "2026-11-08").map(
    (occurrence) => occurrence.date,
  );
  assert.deepEqual(dates, ["2026-10-12", "2026-10-26", "2026-11-02"]);
  // Far from the start the right days still come out.
  const far = expandRepeats([weekly], "2028-03-01", "2028-03-14").map(
    (occurrence) => occurrence.date,
  );
  assert.deepEqual(far, ["2028-03-06", "2028-03-13"]);
  const monthly = entry({ date: "2026-01-31", repeat: { every: "monthly" } });
  assert.deepEqual(
    expandRepeats([monthly], "2026-02-01", "2026-05-31").map((o) => o.date),
    ["2026-03-31", "2026-05-31"],
  );
  const farMonthly = expandRepeats([monthly], "2036-03-01", "2036-03-31");
  assert.deepEqual(
    farMonthly.map((o) => o.date),
    ["2036-03-31"],
  );
  const until = entry({ repeat: { every: "daily", until: "2026-10-14" } });
  assert.equal(expandRepeats([until], "2026-10-01", "2026-10-31").length, 3);
  // A multi-day occurrence keeps its length and shows when it reaches in.
  const span = entry({ endDate: "2026-10-13", repeat: { every: "weekly" } });
  const [first] = expandRepeats([span], "2026-10-20", "2026-10-20");
  assert.equal(first.date, "2026-10-19");
  assert.equal(first.endDate, "2026-10-20");
  assert.equal(first.seriesDate, "2026-10-12");
});

test("a repeat must be longer than the entry and end after it starts", () => {
  assert.match(
    validateRange({
      date: "2026-10-12",
      endDate: "2026-10-13",
      repeat: { every: "daily" },
    }),
    /반복 간격/,
  );
  assert.match(
    validateRange({
      date: "2026-10-12",
      repeat: { every: "weekly", until: "2026-10-01" },
    }),
    /반복 종료/,
  );
  assert.equal(
    validateRange({ date: "2026-10-12", repeat: { every: "weekly" } }),
    null,
  );
});

test("an entry without a list is for everyone", () => {
  assert.equal(isAttendee(entry({}), B), true);
  assert.equal(isAttendee(entry({ attendees: [A] }), B), false);
});

test("poll options, validation and round trip", () => {
  const poll = {
    id: "p1",
    title: "모임",
    startDate: "2026-10-12",
    endDate: "2026-10-13",
    hours: { from: 9, to: 11 },
    createdBy: A,
    updatedAt: 5,
    updatedBy: A,
  };
  assert.deepEqual(pollOptions(poll), [
    "2026-10-12T09",
    "2026-10-12T10",
    "2026-10-13T09",
    "2026-10-13T10",
  ]);
  assert.match(
    validatePoll({ title: "", startDate: "2026-10-12", endDate: "2026-10-13" }),
    /제목/,
  );
  assert.match(
    validatePoll({
      title: "x",
      startDate: "2026-10-12",
      endDate: "2026-12-13",
    }),
    /최대 31일/,
  );
  assert.match(
    validatePoll({
      title: "x",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      hours: { from: 9, to: 9 },
    }),
    /시간 범위/,
  );
  const content = encodePollDoc(
    {
      polls: { p1: poll },
      answers: {
        p1: { choices: ["2026-10-12T09", "2026-11-01T09"], updatedAt: 9 },
      },
    },
    "2026-10-12",
  );
  const doc = decodePollDoc(content);
  assert.equal(doc.polls.p1.title, "모임");
  // An answer for an option the poll does not have is dropped.
  assert.deepEqual(doc.answers.p1.choices, ["2026-10-12T09"]);
  // A poll that ended long ago is left out of what is published.
  assert.deepEqual(
    decodePollDoc(
      encodePollDoc({ polls: { p1: poll }, answers: {} }, "2026-12-25"),
    ).polls,
    {},
  );
});

test("answers are counted per author and the best days are found", () => {
  const poll = {
    id: "p1",
    title: "모임",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    createdBy: A,
    updatedAt: 5,
    updatedBy: A,
  };
  const event = (pubkey, created_at, answers, polls = { p1: poll }) => ({
    id: `${pubkey.slice(0, 4)}${created_at}`,
    pubkey,
    created_at,
    kind: 30078,
    tags: [["d", "dtag"]],
    content: JSON.stringify({ v: 1, polls, answers }),
    sig: "",
  });
  const state = mergePollEvents(
    [
      event(A, 10, {
        p1: { choices: ["2026-10-12", "2026-10-13"], updatedAt: 1 },
      }),
      // B's older event is replaced by the newer one.
      event(B, 10, { p1: { choices: ["2026-10-12"], updatedAt: 1 } }),
      event(B, 11, {
        p1: { choices: ["2026-10-13", "2026-10-14"], updatedAt: 2 },
      }),
      { ...event(B, 99, {}), tags: [["d", "other"]] },
    ],
    "dtag",
    A,
  );
  assert.equal(state.ownCreatedAt, 10);
  const tally = tallyPoll(poll, state.answersByMember);
  assert.deepEqual(tally.voters, [A, B]);
  assert.deepEqual(tally.best, ["2026-10-13"]);
  assert.equal(tally.bestCount, 2);
  assert.deepEqual(tally.byOption["2026-10-12"], [A]);
});

test("reminders come due once, nearest first, only for attendees", () => {
  const meeting = entry({ time: "15:00" });
  const start = occurrenceStartMs(meeting);
  assert.equal(new Date(start).getHours(), 15);
  assert.deepEqual(reminderOffsets(meeting, {}), [1440, 30, 10]);
  assert.deepEqual(reminderOffsets(entry({}), {}), [1440]);
  assert.deepEqual(reminderOffsets(meeting, { e1: [60] }), [60]);
  const due = (sinceMin, nowMin, extra = {}) =>
    dueReminders({
      entries: [meeting],
      overrides: {},
      pubkey: A,
      sinceMs: start - sinceMin * 60_000,
      nowMs: start - nowMin * 60_000,
      ...extra,
    }).map((reminder) => reminder.offset);
  assert.deepEqual(due(31, 29.5), [30]);
  assert.deepEqual(due(29.5, 29), []);
  // The app was closed over two reminders: only the nearest is shown.
  assert.deepEqual(due(2000, 5), [10]);
  // Nothing once the entry has started.
  assert.deepEqual(due(31, -1), []);
  assert.deepEqual(
    dueReminders({
      entries: [entry({ time: "15:00", attendees: [B] })],
      overrides: {},
      pubkey: A,
      sinceMs: start - 31 * 60_000,
      nowMs: start - 29 * 60_000,
    }),
    [],
  );
  assert.equal(reminderLabel(1440), "하루 전");
  assert.equal(reminderLabel(180), "3시간 전");
  assert.equal(reminderLabel(10080), "1주 전");
  assert.deepEqual(parseReminderOverrides('{"e1":[10,10,-5,"x",60]}'), {
    e1: [60, 10],
  });
  assert.deepEqual(parseReminderOverrides("nope"), {});
});

test("dates and times are read from Korean messages", () => {
  const now = new Date(2026, 9, 7, 10, 0); // Wed 2026-10-07
  const parse = (text) => parseSchedule(text, now);
  assert.deepEqual(parse("10월 12일 오후 3시에 회의해요"), {
    date: "2026-10-12",
    time: "15:00",
    hasDate: true,
  });
  assert.deepEqual(parse("내일 14:00 ~ 16:30 미팅"), {
    date: "2026-10-08",
    time: "14:00",
    endTime: "16:30",
    hasDate: true,
  });
  assert.deepEqual(parse("다음 주 화요일 3시~5시"), {
    date: "2026-10-13",
    time: "15:00",
    endTime: "17:00",
    hasDate: true,
  });
  assert.equal(parse("금요일 오전 10시 반").date, "2026-10-09");
  assert.equal(parse("금요일 오전 10시 반").time, "10:30");
  assert.equal(parse("2026.11.03 회의").date, "2026-11-03");
  assert.equal(parse("10/20에 봐요").date, "2026-10-20");
  assert.equal(parse("1월 5일 신년회").date, "2027-01-05");
  assert.equal(parse("15일에 만나요").date, "2026-10-15");
  assert.equal(parse("3일에 만나요").date, "2026-11-03");
  assert.deepEqual(parse("7시에 저녁"), {
    date: "2026-10-07",
    time: "07:00",
    hasDate: false,
  });
  assert.equal(parse("저녁 7시").time, "19:00");
  assert.equal(parse("오전 12시").time, "00:00");
  assert.equal(parse("2시간 정도 걸려요"), null);
  assert.equal(parse("3일 전에 얘기했던 것"), null);
  assert.equal(parse("안녕하세요"), null);
  assert.equal(titleFromMessage("\n  첫 줄 \n둘째 줄"), "첫 줄");
  assert.equal(titleFromMessage("가".repeat(80)).length, 60);
});

test("poll answers fold into readable ranges and the best ones rank first", async () => {
  const { mergeOptions, rankPollRanges } = await import("./teamPolls.ts");
  assert.deepEqual(
    mergeOptions([
      "2026-10-12T15",
      "2026-10-12T14",
      "2026-10-12T17",
      "2026-10-13T09",
    ]),
    [
      { date: "2026-10-12", from: 14, to: 16 },
      { date: "2026-10-12", from: 17, to: 18 },
      { date: "2026-10-13", from: 9, to: 10 },
    ],
  );
  assert.deepEqual(mergeOptions(["2026-10-13", "2026-10-12"]), [
    { date: "2026-10-12" },
    { date: "2026-10-13" },
  ]);
  const poll = {
    id: "p1",
    title: "모임",
    startDate: "2026-10-12",
    endDate: "2026-10-13",
    hours: { from: 13, to: 17 },
    createdBy: A,
    updatedAt: 5,
    updatedBy: A,
  };
  const answers = {
    [A]: {
      p1: {
        choices: [
          "2026-10-12T13",
          "2026-10-12T14",
          "2026-10-12T15",
          "2026-10-13T16",
        ],
        updatedAt: 1,
      },
    },
    [B]: {
      p1: {
        choices: ["2026-10-12T14", "2026-10-12T15", "2026-10-12T16"],
        updatedAt: 1,
      },
    },
  };
  const ranked = rankPollRanges(poll, tallyPoll(poll, answers));
  assert.deepEqual(ranked[0], {
    date: "2026-10-12",
    from: 14,
    to: 16,
    members: [A, B],
  });
  assert.equal(ranked.length, 4);
  assert.ok(ranked.slice(1).every((range) => range.members.length === 1));
});

test("an entry can name a channel to tell, and only its last editor posts the reminder", async () => {
  const { channelNoticeText, dueChannelNotices, entryWhenText } = await import(
    "./teamReminders.ts"
  );
  const { CALENDAR_COLORS } = await import("./teamCalendar.ts");
  assert.ok(
    CALENDAR_COLORS.includes("teal") && CALENDAR_COLORS.includes("brown"),
  );
  const stored = entry({
    time: "15:00",
    endTime: "17:00",
    color: "teal",
    note: "회의실 A",
    notify: { channelId: "chan-1", before: 30 },
  });
  const decoded = decodeMonth(encodeMonth({ e1: stored }), "2026-10").e1;
  assert.deepEqual(decoded.notify, { channelId: "chan-1", before: 30 });
  assert.equal(decoded.color, "teal");
  // A lead time that is not offered is dropped; the channel is kept.
  const odd = decodeMonth(
    encodeMonth({ e1: entry({ notify: { channelId: "chan-1", before: 7 } }) }),
    "2026-10",
  ).e1;
  assert.deepEqual(odd.notify, { channelId: "chan-1" });
  const start = occurrenceStartMs(stored);
  const due = (pubkey, sinceMin, nowMin) =>
    dueChannelNotices({
      entries: [stored],
      pubkey,
      sinceMs: start - sinceMin * 60_000,
      nowMs: start - nowMin * 60_000,
    }).length;
  assert.equal(due(A, 31, 29.5), 1);
  assert.equal(due(A, 29.5, 29), 0);
  assert.equal(due(B, 31, 29.5), 0);
  assert.equal(due(A, 31, -1), 0);
  assert.equal(entryWhenText(stored), "10월 12일 (월) 15:00 ~ 17:00");
  assert.equal(entryWhenText(entry({})), "10월 12일 (월) 하루 종일");
  assert.equal(
    channelNoticeText(stored, "새 일정"),
    "📅 새 일정: 회의\n10월 12일 (월) 15:00 ~ 17:00\n회의실 A",
  );
});
